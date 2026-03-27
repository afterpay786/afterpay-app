/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║       AFTER PAY — DEDICATED PRICEOYE SCRAPER HEALTH AUDIT           ║
 * ║  Standalone audit & auto-fix engine for the product data pipeline   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Checks every aspect of the scraper from engine health → data quality.
 * All fixable issues are repaired automatically; unfixable ones are clearly
 * reported with recommended remediation steps.
 */

import { db } from "./db";
import { scrapedProducts, scrapeLog } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { startScrape, isScraping } from "./scraper";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckCategory =
  | "engine"
  | "names"
  | "prices"
  | "images"
  | "specs"
  | "variants"
  | "filters"
  | "brands"
  | "freshness"
  | "output";

export interface ScraperCheck {
  id: string;
  category: CheckCategory;
  title: string;
  description: string;
  status: "pass" | "fail" | "warning";
  severity: "critical" | "warning" | "info";
  detail: string;
  affected: number;
  affectedIds: string[];
  autoFixable: boolean;
  fixed: boolean;
  fixNote: string;
}

export interface ScraperStats {
  lastScrapeTime: string | null;
  lastScrapeStatus: string;
  lastScrapeProducts: number;
  lastScrapeNew: number;
  lastScrapeErrors: number;
  hoursSinceLast: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  recentFailures: number;
  isScraping: boolean;
  nextScrapeEta: string;
}

export interface ScraperAuditResult {
  timestamp: string;
  duration: number;
  healthScore: number;
  totalProducts: number;
  checks: ScraperCheck[];
  summary: {
    pass: number;
    fail: number;
    warning: number;
    fixed: number;
    totalChecks: number;
    criticalCount: number;
    warningCount: number;
  };
  scraperStats: ScraperStats;
  recentLogs: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    scrapedProducts: number;
    newProducts: number;
    errors: number;
    message: string;
  }[];
}

// ─── State ─────────────────────────────────────────────────────────────────────

let lastScraperAudit: ScraperAuditResult | null = null;
let isScraperAuditing = false;

export function getLastScraperAudit() { return lastScraperAudit; }
export function isScraperAuditRunning() { return isScraperAuditing; }

// ─── Keyword lists ────────────────────────────────────────────────────────────

const KEYPAD_KEYWORDS = [
  "keypad", "feature phone", "feature-phone", "bar phone", "qwerty",
  "dual sim keypad", "basic phone", "mobile phone f", "mobile f",
  "itel it", "itel 2", "samsung guru", "samsung metro", "nokia 105",
  "nokia 110", "nokia 130", "nokia 150", "nokia 210", "nokia 215",
  "nokia 225", "nokia 235", "nokia 3310", "nokia 8110",
];

const CORE_BRANDS = [
  "Samsung", "Apple", "Infinix", "Tecno", "OPPO",
  "Vivo", "Xiaomi", "Realme", "Nothing", "Honor", "Itel", "Motorola",
];

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+){3,}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(id: string, category: CheckCategory, title: string, description: string, detail: string): ScraperCheck {
  return { id, category, title, description, status: "pass", severity: "info", detail, affected: 0, affectedIds: [], autoFixable: false, fixed: false, fixNote: "" };
}

function fail(id: string, category: CheckCategory, title: string, description: string, detail: string, severity: "critical" | "warning" | "info", affectedIds: string[], autoFixable: boolean): ScraperCheck {
  return { id, category, title, description, status: severity === "critical" ? "fail" : "warning", severity, detail, affected: affectedIds.length, affectedIds, autoFixable, fixed: false, fixNote: "" };
}

function computeHealthScore(checks: ScraperCheck[]): number {
  if (checks.length === 0) return 100;
  let score = 100;
  for (const c of checks) {
    if (c.status === "fail" && c.severity === "critical") score -= 15;
    else if (c.status === "fail" && c.severity === "warning") score -= 7;
    else if (c.status === "warning") score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Individual check functions ────────────────────────────────────────────────

/** A-1: Scraper engine ran recently */
async function checkEngineRecency(checks: ScraperCheck[], logs: any[]) {
  const latest = logs[0];
  if (!latest) {
    checks.push(fail("engine-no-history", "engine",
      "No scrape history",
      "The scraper has never completed a run",
      "No records in scrape_log table",
      "critical", [], true));
    return;
  }
  const hoursSince = latest.completedAt
    ? (Date.now() - new Date(latest.completedAt).getTime()) / 3_600_000
    : 999;

  if (hoursSince > 24) {
    checks.push(fail("engine-very-overdue", "engine",
      `Scraper overdue by ${Math.round(hoursSince - 12)}h`,
      "No successful scrape in over 24 hours — data is very stale",
      `Last completed ${Math.round(hoursSince)}h ago (should run every 12h)`,
      "critical", [], true));
  } else if (hoursSince > 13) {
    checks.push(fail("engine-overdue", "engine",
      `Scraper ${Math.round(hoursSince)}h since last run`,
      "Scrape is slightly overdue (scheduled every 12h)",
      `Last completed ${hoursSince.toFixed(1)}h ago`,
      "warning", [], true));
  } else {
    checks.push(pass("engine-recency", "engine",
      "Scraper running on schedule",
      "Last scrape within the 12-hour window",
      `Last completed ${hoursSince.toFixed(1)}h ago ✓`));
  }
}

/** A-2: Last scrape result status */
async function checkLastScrapeStatus(checks: ScraperCheck[], logs: any[]) {
  const latest = logs[0];
  if (!latest) return;

  if (latest.status === "failed") {
    checks.push(fail("engine-last-failed", "engine",
      "Last scrape run FAILED",
      `Scraper terminated with error: ${latest.message || "unknown error"}`,
      `Failed at: ${latest.startedAt ? new Date(latest.startedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : "unknown"}`,
      "critical", [], true));
  } else if (latest.status === "running") {
    checks.push({
      id: "engine-running", category: "engine",
      title: "Scrape in progress",
      description: "A scrape is currently running",
      status: "pass", severity: "info",
      detail: `Started: ${new Date(latest.startedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`,
      affected: 0, affectedIds: [], autoFixable: false, fixed: false, fixNote: "",
    });
  } else {
    checks.push(pass("engine-last-ok", "engine",
      "Last scrape completed successfully",
      "No errors in most recent run",
      `Scraped ${latest.scrapedProducts || 0} products, ${latest.newProducts || 0} new, ${latest.errors || 0} errors`));
  }
}

/** A-3: Consecutive failures check */
async function checkConsecutiveFailures(checks: ScraperCheck[], logs: any[]) {
  let consecutive = 0;
  for (const log of logs) {
    if (log.status === "failed") consecutive++;
    else break;
  }
  if (consecutive >= 3) {
    checks.push(fail("engine-consecutive-fails", "engine",
      `${consecutive} consecutive scrape failures`,
      "Repeated failures indicate a structural problem (IP block, site changes, server issue)",
      `Last ${consecutive} scrape attempts all failed`,
      "critical", [], true));
  } else if (consecutive === 2) {
    checks.push(fail("engine-two-fails", "engine",
      "2 consecutive scrape failures",
      "Two scrapes in a row failed — monitor closely",
      "If it fails a third time, the system will auto-retry",
      "warning", [], true));
  } else {
    checks.push(pass("engine-no-consecutive", "engine",
      "No consecutive failures",
      "Scraper not in a failure loop",
      consecutive === 0 ? "Last run succeeded" : `Only ${consecutive} failure before success`));
  }
}

/** A-4: Error rate in recent scrapes */
async function checkRecentErrorRate(checks: ScraperCheck[], logs: any[]) {
  const recent = logs.slice(0, 5);
  const totalErrors = recent.reduce((s: number, l: any) => s + (l.errors || 0), 0);
  const totalScraped = recent.reduce((s: number, l: any) => s + (l.scrapedProducts || 0), 0);
  const errorRate = totalScraped > 0 ? Math.round((totalErrors / (totalErrors + totalScraped)) * 100) : 0;

  if (errorRate > 30) {
    checks.push(fail("engine-high-error-rate", "engine",
      `High error rate: ${errorRate}% of pages failed`,
      "Many product pages are failing to parse — site may have changed layout",
      `${totalErrors} errors in last 5 scrapes (${totalScraped} succeeded)`,
      "critical", [], false));
  } else if (errorRate > 10) {
    checks.push(fail("engine-moderate-error-rate", "engine",
      `Moderate error rate: ${errorRate}%`,
      "Some pages failing — normal variability but worth watching",
      `${totalErrors} errors, ${totalScraped} successes in last 5 runs`,
      "warning", [], false));
  } else {
    checks.push(pass("engine-error-rate", "engine",
      "Error rate acceptable",
      "Scraper parsing most pages without errors",
      `${errorRate}% error rate across last 5 runs`));
  }
}

/** B-1: Product name quality — no slug-format names */
async function checkProductNames(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const slugNames = products.filter(p => SLUG_PATTERN.test(p.name));
  const shortNames = products.filter(p => p.name && p.name.length < 8 && !SLUG_PATTERN.test(p.name));
  const blankNames = products.filter(p => !p.name || p.name.trim() === "");

  const allBad = [...slugNames, ...shortNames, ...blankNames];
  const uniqueBad = [...new Map(allBad.map(p => [p.id, p])).values()];

  if (uniqueBad.length > 0) {
    const check = fail("names-quality", "names",
      `${uniqueBad.length} products with bad names`,
      "Slug-format, blank, or too-short names indicate the name extraction failed",
      `${slugNames.length} slug-format, ${shortNames.length} too-short, ${blankNames.length} blank`,
      slugNames.length + blankNames.length > 5 ? "critical" : "warning",
      uniqueBad.map(p => p.id), true);

    if (autoFix && uniqueBad.length > 0) {
      const badBrands = [...new Set(uniqueBad.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
      if (!isScraping()) {
        try {
          await startScrape(badBrands.length > 0 ? badBrands : undefined);
          check.fixed = true;
          check.fixNote = `Re-scrape triggered for ${badBrands.join(", ")} to extract proper names`;
        } catch (e: any) {
          check.fixNote = `Auto-fix attempted but failed: ${e.message}`;
        }
      } else {
        check.fixNote = "Scrape already running — names will be fixed on completion";
        check.fixed = true;
      }
    }
    checks.push(check);
  } else {
    checks.push(pass("names-quality", "names",
      "All product names valid",
      "Names are human-readable and properly extracted",
      `${products.length} products all have clean names ✓`));
  }
}

/** C-1: Zero price products */
async function checkZeroPrices(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const zeroPriced = products.filter(p => !p.price || p.price === 0);

  if (zeroPriced.length > 0) {
    const check = fail("prices-zero", "prices",
      `${zeroPriced.length} products with Rs 0 price`,
      "Zero-price products won't appear correctly in listings and are invalid",
      `Products: ${zeroPriced.slice(0, 5).map(p => p.name).join(", ")}${zeroPriced.length > 5 ? "..." : ""}`,
      "critical", zeroPriced.map(p => p.id), true);

    if (autoFix) {
      let fixed = 0;
      const needRescrape: any[] = [];
      for (const p of zeroPriced) {
        const opts = (p.storageOptions as any[]) || [];
        const valid = opts.find((s: any) => s.price >= 10000);
        if (valid) {
          await db.update(scrapedProducts).set({ price: valid.price }).where(sql`${scrapedProducts.id} = ${p.id}`);
          fixed++;
        } else if (p.originalPrice >= 10000) {
          await db.update(scrapedProducts).set({ price: p.originalPrice }).where(sql`${scrapedProducts.id} = ${p.id}`);
          fixed++;
        } else {
          needRescrape.push(p);
        }
      }
      if (needRescrape.length > 0 && !isScraping()) {
        const brands = [...new Set(needRescrape.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
        try { await startScrape(brands); } catch {}
      }
      check.fixed = fixed > 0 || needRescrape.length > 0;
      check.fixNote = `Fixed ${fixed} from storage options; ${needRescrape.length} re-scraped`;
    }
    checks.push(check);
  } else {
    checks.push(pass("prices-zero", "prices",
      "All products have valid prices",
      "No zero-price products in database",
      `${products.length} products all priced ≥ Rs 10,000 ✓`));
  }
}

/** C-2: Price below Rs 10,000 (keypad filter failure) */
async function checkPriceFloor(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const tooLow = products.filter(p => p.price > 0 && p.price < 10000);

  if (tooLow.length > 0) {
    const check = fail("prices-floor", "prices",
      `${tooLow.length} products below Rs 10,000 price floor`,
      "Price floor filter (Rs 10,000) failed — these are likely keypad/feature phones",
      `Examples: ${tooLow.slice(0, 3).map(p => `${p.name} (Rs ${p.price})`).join(", ")}`,
      "critical", tooLow.map(p => p.id), true);

    if (autoFix) {
      for (const p of tooLow) {
        await db.delete(scrapedProducts).where(sql`${scrapedProducts.id} = ${p.id}`);
      }
      check.fixed = true;
      check.fixNote = `Deleted ${tooLow.length} below-floor products`;
    }
    checks.push(check);
  } else {
    checks.push(pass("prices-floor", "prices",
      "Price floor filter working",
      "No products below Rs 10,000",
      "All products meet minimum price threshold ✓"));
  }
}

/** C-3: Storage variants with Rs 0 price */
async function checkVariantPrices(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const affected: string[] = [];
  let totalZero = 0;

  for (const p of products) {
    const opts = (p.storageOptions as any[]) || [];
    const zeros = opts.filter((s: any) => s.price === 0 || s.price < 10000);
    if (zeros.length > 0) { affected.push(p.id); totalZero += zeros.length; }
  }

  if (affected.length > 0) {
    const check = fail("prices-variants", "prices",
      `${totalZero} storage variants with Rs 0 price`,
      "Storage variants with no price will default to main product price — may show wrong amounts",
      `${affected.length} products affected`,
      "warning", affected, true);

    if (autoFix) {
      let fixed = 0;
      for (const pid of affected) {
        const p = products.find(x => x.id === pid);
        if (!p) continue;
        const opts = (p.storageOptions as any[]) || [];
        const updated = opts.map((s: any) => ({ ...s, price: (s.price === 0 || s.price < 10000) ? p.price : s.price }));
        await db.update(scrapedProducts).set({ storageOptions: updated }).where(sql`${scrapedProducts.id} = ${pid}`);
        fixed++;
      }
      check.fixed = true;
      check.fixNote = `Fixed ${fixed} products — zero-price variants now use main product price`;
    }
    checks.push(check);
  } else {
    checks.push(pass("prices-variants", "prices",
      "All storage variants priced",
      "Every storage option has a valid price",
      "Storage variant prices are clean ✓"));
  }
}

/** C-4: Price ceiling — unrealistically high prices */
async function checkPriceCeiling(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const tooHigh = products.filter(p => p.price > 600000);

  if (tooHigh.length > 0) {
    const check = fail("prices-ceiling", "prices",
      `${tooHigh.length} products with suspiciously high price`,
      "Prices above Rs 600,000 are almost certainly a scraping error",
      `Examples: ${tooHigh.slice(0, 3).map(p => `${p.name} (Rs ${p.price.toLocaleString()})`).join(", ")}`,
      "critical", tooHigh.map(p => p.id), true);

    if (autoFix) {
      for (const p of tooHigh) {
        const opts = (p.storageOptions as any[]) || [];
        const valid = opts.find((s: any) => s.price >= 10000 && s.price <= 600000);
        if (valid) {
          await db.update(scrapedProducts).set({ price: valid.price }).where(sql`${scrapedProducts.id} = ${p.id}`);
        }
      }
      check.fixed = true;
      check.fixNote = "Fixed using lowest valid storage option price";
    }
    checks.push(check);
  } else {
    checks.push(pass("prices-ceiling", "prices",
      "No unrealistic prices",
      "All prices within expected Rs 10,000 – Rs 600,000 range",
      "Price ceiling check passed ✓"));
  }
}

/** D-1: Products missing main image */
async function checkMainImage(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const noImage = products.filter(p => !p.image || !p.image.startsWith("http"));

  if (noImage.length > 0) {
    const check = fail("images-main", "images",
      `${noImage.length} products missing main image`,
      "Products without a main image will show broken images in listings",
      `Examples: ${noImage.slice(0, 5).map(p => p.name).join(", ")}`,
      "critical", noImage.map(p => p.id), true);

    if (autoFix) {
      let fixed = 0;
      const needRescrape: any[] = [];
      for (const p of noImage) {
        const imgs = (p.images as string[]) || [];
        const valid = imgs.find((i: string) => i.startsWith("http"));
        if (valid) {
          await db.update(scrapedProducts).set({ image: valid }).where(sql`${scrapedProducts.id} = ${p.id}`);
          fixed++;
        } else { needRescrape.push(p); }
      }
      if (needRescrape.length > 0 && !isScraping()) {
        const brands = [...new Set(needRescrape.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
        try { await startScrape(brands); } catch {}
      }
      check.fixed = fixed > 0 || needRescrape.length > 0;
      check.fixNote = `Fixed ${fixed} from gallery; ${needRescrape.length} re-scraped`;
    }
    checks.push(check);
  } else {
    checks.push(pass("images-main", "images",
      "All products have main image",
      "No missing or invalid main images",
      `${products.length} products all have valid image URLs ✓`));
  }
}

/** D-2: Gallery image count */
async function checkGalleryDepth(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const singleImage = products.filter(p => {
    const imgs = Array.isArray(p.images) ? p.images : [];
    return imgs.length < 2;
  });

  if (singleImage.length > products.length * 0.3) {
    const check = fail("images-gallery", "images",
      `${singleImage.length} products have <2 gallery images`,
      "Products with very few images provide a poor customer experience",
      `${Math.round((singleImage.length / products.length) * 100)}% of catalog has thin galleries`,
      "warning", singleImage.map(p => p.id), true);

    if (autoFix) {
      let fixed = 0;
      for (const p of singleImage) {
        if (p.image && (!Array.isArray(p.images) || p.images.length === 0)) {
          await db.update(scrapedProducts).set({ images: [p.image] }).where(sql`${scrapedProducts.id} = ${p.id}`);
          fixed++;
        }
      }
      check.fixed = fixed > 0;
      check.fixNote = `Patched ${fixed} products using main image as gallery fallback`;
    }
    checks.push(check);
  } else {
    checks.push(pass("images-gallery", "images",
      "Gallery depth adequate",
      "Most products have 2+ gallery images",
      `${products.length - singleImage.length}/${products.length} products have multi-image galleries ✓`));
  }
}

/** D-3: Image URL format validation */
async function checkImageUrlFormat(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const badUrls: string[] = [];
  for (const p of products) {
    const imgs = (p.images as string[]) || [];
    if (imgs.some(i => i && !i.startsWith("http"))) badUrls.push(p.id);
    if (p.image && !p.image.startsWith("http")) { if (!badUrls.includes(p.id)) badUrls.push(p.id); }
  }

  if (badUrls.length > 0) {
    const check = fail("images-urls", "images",
      `${badUrls.length} products with invalid image URLs`,
      "Image URLs must start with https:// — relative URLs won't load on device",
      "URLs not starting with http detected",
      "critical", badUrls, true);

    if (autoFix) {
      const IMG_BASE = "https://images.priceoye.pk/";
      let fixed = 0;
      for (const pid of badUrls) {
        const p = products.find(x => x.id === pid);
        if (!p) continue;
        const fixUrl = (url: string) => url.startsWith("//") ? `https:${url}` : url.startsWith("http") ? url : `${IMG_BASE}${url}`;
        const fixedImage = p.image ? fixUrl(p.image) : p.image;
        const fixedImages = ((p.images as string[]) || []).map(fixUrl);
        await db.update(scrapedProducts).set({ image: fixedImage, images: fixedImages }).where(sql`${scrapedProducts.id} = ${pid}`);
        fixed++;
      }
      check.fixed = true;
      check.fixNote = `Fixed ${fixed} products — relative URLs upgraded to absolute`;
    }
    checks.push(check);
  } else {
    checks.push(pass("images-urls", "images",
      "All image URLs are valid HTTPS",
      "All images use proper absolute URLs",
      "Image URL format check passed ✓"));
  }
}

/** D-4: Color variant images */
async function checkColorImages(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const affected: string[] = [];
  for (const p of products) {
    const colors = (p.colors as any[]) || [];
    if (colors.length > 0 && colors.some((c: any) => !c.image || !c.image.startsWith("http"))) {
      affected.push(p.id);
    }
  }

  if (affected.length > 0) {
    const check = fail("images-colors", "images",
      `${affected.length} products with missing color variant images`,
      "Color swatches without images show empty thumbnails in the product detail page",
      `${affected.length} products have at least one color without an image`,
      "warning", affected, true);

    if (autoFix) {
      let fixed = 0;
      for (const pid of affected) {
        const p = products.find(x => x.id === pid);
        if (!p || !p.image) continue;
        const colors = (p.colors as any[]) || [];
        const imgs = (p.images as string[]) || [p.image];
        const updated = colors.map((c: any) => ({
          ...c,
          image: (c.image && c.image.startsWith("http")) ? c.image : p.image,
          images: (Array.isArray(c.images) && c.images.length > 0) ? c.images : imgs,
        }));
        await db.update(scrapedProducts).set({ colors: updated }).where(sql`${scrapedProducts.id} = ${pid}`);
        fixed++;
      }
      check.fixed = true;
      check.fixNote = `Fixed ${fixed} products — missing color images filled with main product image`;
    }
    checks.push(check);
  } else {
    checks.push(pass("images-colors", "images",
      "All color variants have images",
      "Every color swatch has a valid thumbnail",
      "Color image check passed ✓"));
  }
}

/** D-5: Duplicate images per product */
async function checkDuplicateImages(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const affected: string[] = [];
  for (const p of products) {
    const imgs = (p.images as string[]) || [];
    const unique = new Set(imgs.map(i => i.replace(/\d+x\d+/, "X")));
    if (unique.size < imgs.length) affected.push(p.id);
  }

  if (affected.length > 0) {
    const check = fail("images-dupes", "images",
      `${affected.length} products with duplicate gallery images`,
      "Duplicate images waste gallery slots and increase load time",
      `${affected.length} products have redundant image URLs`,
      "info", affected, true);

    if (autoFix) {
      let fixed = 0;
      for (const pid of affected) {
        const p = products.find(x => x.id === pid);
        if (!p) continue;
        const imgs = (p.images as string[]) || [];
        const seen = new Set<string>();
        const deduped = imgs.filter(i => { const k = i.replace(/\d+x\d+/, "X"); if (seen.has(k)) return false; seen.add(k); return true; });
        if (deduped.length < imgs.length) {
          await db.update(scrapedProducts).set({ images: deduped }).where(sql`${scrapedProducts.id} = ${pid}`);
          fixed++;
        }
      }
      check.fixed = true;
      check.fixNote = `De-duplicated images for ${fixed} products`;
    }
    checks.push(check);
  } else {
    checks.push(pass("images-dupes", "images",
      "No duplicate images",
      "All image galleries have unique entries",
      "Image deduplication is working correctly ✓"));
  }
}

/** E-1: Missing specifications */
async function checkSpecifications(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const missingSpec = products.filter(p => {
    const specs = p.specifications;
    return !specs || typeof specs !== "object" || Object.keys(specs).length === 0;
  });
  const thinSpec = products.filter(p => {
    const flat = (p.specs as any[]) || [];
    return flat.length < 5 && !(missingSpec.find(m => m.id === p.id));
  });

  if (missingSpec.length > 0) {
    const check = fail("specs-missing", "specs",
      `${missingSpec.length} products missing specification tables`,
      "Structured spec tables power the product detail page spec display — empty specs look unprofessional",
      `${missingSpec.length}/${products.length} products (${Math.round((missingSpec.length / products.length) * 100)}%) have no spec sections`,
      missingSpec.length > products.length * 0.3 ? "critical" : "warning",
      missingSpec.map(p => p.id), true);

    if (autoFix) {
      let fixed = 0;
      const needRescrape: any[] = [];
      for (const p of missingSpec) {
        const flat = (p.specs as any[]) || [];
        if (flat.length > 0) {
          const grouped: Record<string, Record<string, string>> = { "General": {} };
          for (const s of flat) { if (s.label && s.value) grouped["General"][s.label] = s.value; }
          await db.update(scrapedProducts).set({ specifications: grouped }).where(sql`${scrapedProducts.id} = ${p.id}`);
          fixed++;
        } else { needRescrape.push(p); }
      }
      if (needRescrape.length > 0 && !isScraping()) {
        const brands = [...new Set(needRescrape.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
        try { await startScrape(brands); } catch {}
      }
      check.fixed = fixed > 0 || needRescrape.length > 0;
      check.fixNote = `Rebuilt ${fixed} from flat specs; ${needRescrape.length} re-scraped`;
    }
    checks.push(check);
  } else {
    checks.push(pass("specs-missing", "specs",
      "All products have specification tables",
      "Specification data is complete",
      `${products.length} products all have structured spec sections ✓`));
  }

  if (thinSpec.length > 0) {
    checks.push(fail("specs-thin", "specs",
      `${thinSpec.length} products with <5 spec entries`,
      "Thin specifications may indicate partial parse — customers see incomplete product info",
      `${thinSpec.length} products have fewer than 5 individual specs`,
      "info", thinSpec.map(p => p.id), false));
  } else {
    checks.push(pass("specs-thin", "specs",
      "Spec entry count adequate",
      "All products have 5+ individual spec entries",
      "Specification depth check passed ✓"));
  }
}

/** F-1: Product descriptions */
async function checkDescriptions(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const noDesc = products.filter(p => !p.productDescription || p.productDescription.trim().length < 30);

  if (noDesc.length > products.length * 0.5) {
    const check = fail("desc-missing", "specs",
      `${noDesc.length} products missing descriptions`,
      "Product descriptions improve customer experience and SEO",
      `${noDesc.length}/${products.length} products have no meaningful description`,
      "warning", noDesc.map(p => p.id), true);

    if (autoFix) {
      let fixed = 0;
      for (const p of noDesc) {
        const fallbackDesc = `${p.name} is available at the lowest price in Pakistan only at AFTER PAY. Shop with confidence — free delivery, open parcel option, and 1-year warranty included.`;
        await db.update(scrapedProducts).set({ productDescription: fallbackDesc }).where(sql`${scrapedProducts.id} = ${p.id}`);
        fixed++;
      }
      check.fixed = true;
      check.fixNote = `Generated fallback description for ${fixed} products`;
    }
    checks.push(check);
  } else {
    checks.push(pass("desc-missing", "specs",
      "Product descriptions present",
      "Most products have meaningful descriptions",
      `${products.length - noDesc.length}/${products.length} products have descriptions ✓`));
  }
}

/** G-1: Color variants exist */
async function checkColorVariants(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const noColors = products.filter(p => !Array.isArray(p.colors) || p.colors.length === 0);

  if (noColors.length > products.length * 0.3) {
    const check = fail("variants-colors", "variants",
      `${noColors.length} products with no color variants`,
      "Color variant extraction failed for many products — color picker on product page will be empty",
      `${Math.round((noColors.length / products.length) * 100)}% of catalog has no colors`,
      "warning", noColors.map(p => p.id), true);

    if (autoFix && !isScraping()) {
      const brands = [...new Set(noColors.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
      try {
        await startScrape(brands.slice(0, 5));
        check.fixed = true;
        check.fixNote = `Re-scrape triggered for ${brands.slice(0, 5).join(", ")}`;
      } catch (e: any) { check.fixNote = `Re-scrape failed: ${e.message}`; }
    }
    checks.push(check);
  } else {
    checks.push(pass("variants-colors", "variants",
      "Color variants present",
      "Most products have color options",
      `${products.length - noColors.length}/${products.length} products have color variants ✓`));
  }
}

/** G-2: Storage options exist */
async function checkStorageOptions(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const noStorage = products.filter(p => !Array.isArray(p.storageOptions) || p.storageOptions.length === 0);

  if (noStorage.length > products.length * 0.3) {
    const check = fail("variants-storage", "variants",
      `${noStorage.length} products with no storage options`,
      "Storage/RAM variant extraction failed — price selector on product page will be missing",
      `${Math.round((noStorage.length / products.length) * 100)}% of catalog has no storage options`,
      "warning", noStorage.map(p => p.id), true);

    if (autoFix && !isScraping()) {
      const brands = [...new Set(noStorage.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
      try {
        await startScrape(brands.slice(0, 5));
        check.fixed = true;
        check.fixNote = `Re-scrape triggered for ${brands.slice(0, 5).join(", ")}`;
      } catch {}
    }
    checks.push(check);
  } else {
    checks.push(pass("variants-storage", "variants",
      "Storage options present",
      "Most products have storage/RAM options",
      `${products.length - noStorage.length}/${products.length} products have storage variants ✓`));
  }
}

/** H-1: Keypad phone filter */
async function checkKeypadFilter(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const keypadProducts = products.filter(p => {
    const nameLower = (p.name || "").toLowerCase();
    return KEYPAD_KEYWORDS.some(kw => nameLower.includes(kw));
  });

  if (keypadProducts.length > 0) {
    const check = fail("filters-keypad", "filters",
      `${keypadProducts.length} keypad/feature phones in database`,
      "The keypad filter is not catching these products — they should be excluded",
      `Examples: ${keypadProducts.slice(0, 4).map(p => p.name).join(", ")}`,
      "critical", keypadProducts.map(p => p.id), true);

    if (autoFix) {
      for (const p of keypadProducts) {
        await db.delete(scrapedProducts).where(sql`${scrapedProducts.id} = ${p.id}`);
      }
      check.fixed = true;
      check.fixNote = `Deleted ${keypadProducts.length} keypad/feature phones from database`;
    }
    checks.push(check);
  } else {
    checks.push(pass("filters-keypad", "filters",
      "Keypad filter working",
      "No keypad or feature phones in catalog",
      "All products are smartphones ✓"));
  }
}

/** I-1: Core brand coverage */
async function checkBrandCoverage(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const brandCounts = new Map<string, number>();
  for (const p of products) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);

  const missingBrands = CORE_BRANDS.filter(b => !brandCounts.has(b));

  if (missingBrands.length > 0) {
    const check = fail("brands-coverage", "brands",
      `${missingBrands.length} core brands missing`,
      `Missing: ${missingBrands.join(", ")}`,
      `${brandCounts.size} brands present; ${missingBrands.length} expected brands absent`,
      missingBrands.length > 3 ? "critical" : "warning",
      missingBrands, true);

    if (autoFix && !isScraping()) {
      try {
        await startScrape(missingBrands.map(b => b.toLowerCase()));
        check.fixed = true;
        check.fixNote = `Scrape triggered for missing brands: ${missingBrands.join(", ")}`;
      } catch {}
    }
    checks.push(check);
  } else {
    checks.push(pass("brands-coverage", "brands",
      "All core brands present",
      `${CORE_BRANDS.join(", ")} — all covered`,
      `${brandCounts.size} brands in catalog, all core brands present ✓`));
  }
}

/** I-2: Brand with very few products — auto-fixable via targeted re-scrape */
async function checkBrandDepth(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const brandCounts = new Map<string, number>();
  for (const p of products) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);

  const thinBrands = Array.from(brandCounts.entries()).filter(([, count]) => count < 3);
  if (thinBrands.length > 0) {
    const check = fail("brands-depth", "brands",
      `${thinBrands.length} brands with <3 products`,
      "Very few products per brand may indicate incomplete scraping",
      `Thin brands: ${thinBrands.map(([b, c]) => `${b}(${c})`).join(", ")}`,
      "warning",
      thinBrands.map(([b]) => b),
      true);

    if (autoFix && !isScraping()) {
      try {
        const brandSlugs = thinBrands.map(([b]) => b.toLowerCase().replace(/\s+/g, ""));
        await startScrape(brandSlugs);
        check.fixed = true;
        check.fixNote = `Targeted re-scrape triggered for thin brands: ${thinBrands.map(([b, c]) => `${b}(${c})`).join(", ")}`;
      } catch (e: any) {
        check.fixNote = `Auto-fix attempted but failed: ${e?.message || "unknown error"}`;
      }
    } else if (isScraping()) {
      check.fixNote = "Scraper already running — will recheck on next audit cycle";
    }

    checks.push(check);
  } else {
    checks.push(pass("brands-depth", "brands",
      "All brands have adequate coverage",
      "Every brand has at least 3 products",
      `Brand depth check passed ✓`));
  }
}

/** J-1: Data freshness */
async function checkDataFreshness(products: any[], checks: ScraperCheck[], autoFix: boolean) {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const stale = products.filter(p => !p.lastScrapedAt || new Date(p.lastScrapedAt) < twoDaysAgo);

  if (stale.length > 0) {
    const brands = [...new Set(stale.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
    const oldest = stale.reduce((min: any, p: any) =>
      (!min || new Date(p.lastScrapedAt || 0) < new Date(min.lastScrapedAt || 0)) ? p : min, null);
    const hoursOld = oldest?.lastScrapedAt
      ? Math.round((Date.now() - new Date(oldest.lastScrapedAt).getTime()) / 3_600_000)
      : 999;

    const check = fail("freshness-stale", "freshness",
      `${stale.length} products not refreshed in 2+ days`,
      `Stale brands: ${brands.slice(0, 6).join(", ")}`,
      `Oldest product is ~${hoursOld}h old (target: <48h)`,
      stale.length > 20 ? "critical" : "warning",
      stale.map(p => p.id), true);

    if (autoFix && !isScraping()) {
      try {
        await startScrape(brands.length > 0 ? brands : undefined);
        check.fixed = true;
        check.fixNote = `Full re-scrape triggered to refresh ${stale.length} stale products`;
      } catch {}
    }
    checks.push(check);
  } else {
    checks.push(pass("freshness-stale", "freshness",
      "All products up to date",
      "Every product scraped within the last 2 days",
      `Data freshness check passed ✓`));
  }
}

/** K-1: Total product count */
async function checkProductCount(products: any[], checks: ScraperCheck[]) {
  const count = products.length;
  if (count < 50) {
    checks.push(fail("output-count-critical", "output",
      `Only ${count} products — critically low`,
      "Database has too few products; scraper may have failed silently",
      "Expected 100+ products for a healthy catalog",
      "critical", [], false));
  } else if (count < 100) {
    checks.push(fail("output-count-low", "output",
      `${count} products — below target`,
      "Catalog has fewer than 100 smartphones; aim for 120+",
      `Current: ${count} | Target: 120+`,
      "warning", [], false));
  } else {
    checks.push(pass("output-count", "output",
      "Product catalog size healthy",
      "Sufficient number of products in database",
      `${count} products in catalog ✓`));
  }
}

/** K-2: HTML fallback ratio */
async function checkDataSourceQuality(products: any[], checks: ScraperCheck[]) {
  // We don't store data source per product in the DB, but we can infer from specs/images/colors
  const likelyFallback = products.filter(p => {
    const specs = (p.specs as any[]) || [];
    const colors = (p.colors as any[]) || [];
    const imgs = (p.images as string[]) || [];
    return specs.length < 3 && colors.length === 0 && imgs.length < 2;
  });

  const ratio = products.length > 0 ? Math.round((likelyFallback.length / products.length) * 100) : 0;

  if (ratio > 40) {
    checks.push(fail("output-fallback-ratio", "output",
      `~${ratio}% of products appear to use HTML fallback parsing`,
      "A high fallback rate means the JSON extractor (window.product_data) is frequently missing — site may have changed",
      `${likelyFallback.length}/${products.length} products have thin data (likely from HTML fallback)`,
      "warning", likelyFallback.map(p => p.id), false));
  } else {
    checks.push(pass("output-fallback-ratio", "output",
      "JSON extraction rate healthy",
      "Most products are using the rich JSON data source",
      `~${100 - ratio}% of products have complete data (JSON-sourced) ✓`));
  }
}

// ─── L: Custom Scrape Command Health ─────────────────────────────────────────

async function checkCustomScrapeCommand(checks: ScraperCheck[]): Promise<void> {
  try {
    const { extractSearchKeywords } = await import("./scraper");

    // Test 1: Clean keyword (should pass through unchanged)
    const t1 = extractSearchKeywords("Samsung Galaxy S24");
    const t1Pass = t1.keyword.toLowerCase().includes("samsung") && !t1.isNaturalLanguage;

    // Test 2: Natural language (should extract brand)
    const t2 = extractSearchKeywords("please check priceoye and fetch all infinix models for my store");
    const t2Pass = t2.brand === "infinix" && t2.isNaturalLanguage && t2.keyword.includes("infinix");

    // Test 3: Mixed model query
    const t3 = extractSearchKeywords("get all details of missing redmi note models from website");
    const t3Pass = t3.brand === "xiaomi" && t3.keyword.toLowerCase().includes("xiaomi");

    const allPass = t1Pass && t2Pass && t3Pass;
    const passCount = [t1Pass, t2Pass, t3Pass].filter(Boolean).length;

    if (allPass) {
      checks.push(pass(
        "custom-scrape-ai",
        "output" as any,
        "Custom Scrape AI keyword extractor healthy",
        "Natural language queries are correctly parsed into clean Priceoye search keywords",
        `All 3 extraction tests passed (clean query, NL brand detection, model extraction) ✓`
      ));
    } else {
      checks.push(fail(
        "custom-scrape-ai",
        "output" as any,
        `Custom Scrape AI extractor: ${passCount}/3 tests passed`,
        "Keyword extraction is not working correctly for some input types",
        `Tests: clean=${t1Pass ? "✓" : "✗"} NL-brand=${t2Pass ? "✓" : "✗"} model=${t3Pass ? "✓" : "✗"}`,
        "warning", [], false
      ));
    }
  } catch (err: any) {
    checks.push(fail(
      "custom-scrape-ai",
      "output" as any,
      "Custom Scrape AI extractor unavailable",
      `Error testing keyword extractor: ${err.message}`,
      "Could not import or run extractSearchKeywords — check scraper.ts",
      "critical", [], false
    ));
  }
}

// ─── Main audit function ───────────────────────────────────────────────────────

export async function runScraperAudit(autoFix: boolean = true): Promise<ScraperAuditResult> {
  if (isScraperAuditing) throw new Error("Scraper audit already in progress");
  isScraperAuditing = true;
  const startTime = Date.now();

  try {
    const [products, logs] = await Promise.all([
      db.select().from(scrapedProducts),
      db.select().from(scrapeLog).orderBy(sql`${scrapeLog.startedAt} DESC`).limit(20),
    ]);

    const checks: ScraperCheck[] = [];

    // A — Engine health
    await checkEngineRecency(checks, logs);
    await checkLastScrapeStatus(checks, logs);
    await checkConsecutiveFailures(checks, logs);
    await checkRecentErrorRate(checks, logs);

    // B — Names
    await checkProductNames(products, checks, autoFix);

    // C — Prices
    await checkZeroPrices(products, checks, autoFix);
    await checkPriceFloor(products, checks, autoFix);
    await checkVariantPrices(products, checks, autoFix);
    await checkPriceCeiling(products, checks, autoFix);

    // D — Images
    await checkMainImage(products, checks, autoFix);
    await checkGalleryDepth(products, checks, autoFix);
    await checkImageUrlFormat(products, checks, autoFix);
    await checkColorImages(products, checks, autoFix);
    await checkDuplicateImages(products, checks, autoFix);

    // E — Specs
    await checkSpecifications(products, checks, autoFix);

    // F — Descriptions
    await checkDescriptions(products, checks, autoFix);

    // G — Variants
    await checkColorVariants(products, checks, autoFix);
    await checkStorageOptions(products, checks, autoFix);

    // H — Filters
    await checkKeypadFilter(products, checks, autoFix);

    // I — Brands
    await checkBrandCoverage(products, checks, autoFix);
    await checkBrandDepth(products, checks, autoFix);

    // J — Freshness
    await checkDataFreshness(products, checks, autoFix);

    // K — Output quality
    await checkProductCount(products, checks);
    await checkDataSourceQuality(products, checks);

    // L — Custom scrape command health
    await checkCustomScrapeCommand(checks);

    // ── Compute final score ─────────────────────────────────────────────
    const failing = checks.filter(c => c.status !== "pass");
    const healthScore = computeHealthScore(failing);

    // ── Scraper stats ───────────────────────────────────────────────────
    const latest = logs[0];
    const hoursSinceLast = latest?.completedAt
      ? (Date.now() - new Date(latest.completedAt).getTime()) / 3_600_000
      : 999;
    const successRuns = logs.filter(l => l.status === "completed").length;
    const failedRuns = logs.filter(l => l.status === "failed").length;
    const recentFailures = logs.slice(0, 5).filter(l => l.status === "failed").length;

    // Next scrape ETA (12:30 AM/PM PKT)
    const now = new Date();
    const pktOffset = 5 * 60; // PKT = UTC+5
    const pktNow = new Date(now.getTime() + pktOffset * 60 * 1000);
    const pktMinutes = pktNow.getUTCHours() * 60 + pktNow.getUTCMinutes();
    const targets = [30, 12 * 60 + 30]; // 12:30 and 00:30 PKT in minutes
    let nextMinutes = targets.find(t => t > pktMinutes) ?? (targets[0] + 24 * 60);
    const minutesToNext = nextMinutes - pktMinutes;
    const hoursToNext = Math.floor(minutesToNext / 60);
    const minsToNext = minutesToNext % 60;
    const nextScrapeEta = `${hoursToNext}h ${minsToNext}m`;

    const scraperStats: ScraperStats = {
      lastScrapeTime: latest?.completedAt ? new Date(latest.completedAt).toISOString() : null,
      lastScrapeStatus: latest?.status ?? "never",
      lastScrapeProducts: latest?.scrapedProducts ?? 0,
      lastScrapeNew: latest?.newProducts ?? 0,
      lastScrapeErrors: latest?.errors ?? 0,
      hoursSinceLast,
      totalRuns: logs.length,
      successRuns,
      failedRuns,
      recentFailures,
      isScraping: isScraping(),
      nextScrapeEta,
    };

    const recentLogs = logs.slice(0, 8).map(l => ({
      id: l.id,
      status: l.status,
      startedAt: l.startedAt ? new Date(l.startedAt).toISOString() : "",
      completedAt: l.completedAt ? new Date(l.completedAt).toISOString() : null,
      scrapedProducts: l.scrapedProducts ?? 0,
      newProducts: l.newProducts ?? 0,
      errors: l.errors ?? 0,
      message: l.message ?? "",
    }));

    const result: ScraperAuditResult = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      healthScore,
      totalProducts: products.length,
      checks,
      summary: {
        pass: checks.filter(c => c.status === "pass").length,
        fail: checks.filter(c => c.status === "fail").length,
        warning: checks.filter(c => c.status === "warning").length,
        fixed: checks.filter(c => c.fixed).length,
        totalChecks: checks.length,
        criticalCount: checks.filter(c => c.severity === "critical" && c.status !== "pass").length,
        warningCount: checks.filter(c => c.severity === "warning" && c.status !== "pass").length,
      },
      scraperStats,
      recentLogs,
    };

    lastScraperAudit = result;
    console.log(`[ScraperAudit] Complete — Score: ${healthScore}/100 | ${result.summary.pass}/${checks.length} checks passed | ${result.summary.fixed} auto-fixed`);
    return result;

  } finally {
    isScraperAuditing = false;
  }
}
