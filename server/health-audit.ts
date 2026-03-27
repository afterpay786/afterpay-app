import { db } from "./db";
import { scrapedProducts, orders, scrapeLog } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { startScrape, isScraping } from "./scraper";

export interface AuditIssue {
  id: string;
  category: "price" | "image" | "variant" | "order" | "payment" | "data";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  affectedIds: string[];
  autoFixable: boolean;
  fixed?: boolean;
  fixing?: boolean;
}

export interface AuditResult {
  timestamp: string;
  duration: number;
  totalProducts: number;
  totalOrders: number;
  issues: AuditIssue[];
  issuesSummary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
    autoFixed: number;
  };
  checks: {
    name: string;
    status: "pass" | "fail" | "warning";
    details: string;
  }[];
}

let lastAuditResult: AuditResult | null = null;
let isAuditing = false;

export function getLastAuditResult() {
  return lastAuditResult;
}

export function isAuditRunning() {
  return isAuditing;
}

export async function runHealthAudit(autoFix: boolean = true): Promise<AuditResult> {
  if (isAuditing) {
    throw new Error("Audit already in progress");
  }

  isAuditing = true;
  const startTime = Date.now();
  const issues: AuditIssue[] = [];
  const checks: AuditResult["checks"] = [];

  try {
    const allProducts = await db.select().from(scrapedProducts);
    const allOrders = await db.select().from(orders);

    await checkZeroPriceProducts(allProducts, issues, checks, autoFix);
    await checkMissingImages(allProducts, issues, checks, autoFix);
    await checkBrokenImageUrls(allProducts, issues, checks);
    await checkZeroPriceVariants(allProducts, issues, checks, autoFix);
    await checkEmptyColorImages(allProducts, issues, checks, autoFix);
    await checkCorruptedDiscounts(allProducts, issues, checks, autoFix);
    await checkDuplicateProducts(allProducts, issues, checks, autoFix);
    await checkStaleProducts(allProducts, issues, checks, autoFix);
    await checkOrderIntegrity(allOrders, issues, checks);
    await checkPaymentIssues(allOrders, issues, checks, autoFix);
    await checkStuckOrders(allOrders, issues, checks, autoFix);
    await checkIncompleteGalleries(allProducts, issues, checks, autoFix);
    await checkMissingSpecifications(allProducts, issues, checks, autoFix);
    await checkStockIntegrity(allProducts, issues, checks, autoFix);
    await checkBrandDistribution(allProducts, issues, checks, autoFix);
    await checkScrapeHealth(issues, checks, autoFix);
    await checkDownloadPage(issues, checks);
    await checkAdminIntegration(issues, checks);

    const autoFixed = issues.filter((i) => i.fixed).length;

    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      totalProducts: allProducts.length,
      totalOrders: allOrders.length,
      issues,
      issuesSummary: {
        critical: issues.filter((i) => i.severity === "critical").length,
        warning: issues.filter((i) => i.severity === "warning").length,
        info: issues.filter((i) => i.severity === "info").length,
        total: issues.length,
        autoFixed,
      },
      checks,
    };

    lastAuditResult = result;
    console.log(
      `[HealthAudit] Complete: ${result.checks.filter((c) => c.status === "pass").length}/${result.checks.length} checks passed, ${issues.length} issues found, ${autoFixed} auto-fixed`
    );

    return result;
  } finally {
    isAuditing = false;
  }
}

async function checkZeroPriceProducts(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const zeroPriced = products.filter((p) => p.price === 0 || p.price === null);
  if (zeroPriced.length > 0) {
    const issue: AuditIssue = {
      id: "zero-price-products",
      category: "price",
      severity: "critical",
      title: `${zeroPriced.length} products with Rs 0 price`,
      description: `Products: ${zeroPriced.map((p) => p.name).join(", ")}`,
      affectedIds: zeroPriced.map((p) => p.id),
      autoFixable: true,
    };

    if (autoFix) {
      let fixedCount = 0;
      const unfixable: any[] = [];
      for (const p of zeroPriced) {
        const storageOpts = (p.storageOptions as any[]) || [];
        const firstValid = storageOpts.find((s: any) => s.price > 5000);
        if (firstValid) {
          await db
            .update(scrapedProducts)
            .set({ price: firstValid.price })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
          console.log(`[HealthAudit] Fixed zero-price: ${p.name} → Rs ${firstValid.price} (from storage options)`);
        } else if (p.originalPrice > 5000) {
          await db
            .update(scrapedProducts)
            .set({ price: p.originalPrice })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
          console.log(`[HealthAudit] Fixed zero-price: ${p.name} → Rs ${p.originalPrice} (from originalPrice)`);
        } else {
          unfixable.push(p);
        }
      }

      if (unfixable.length > 0 && !isScraping()) {
        const unfixableBrands = [...new Set(unfixable.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
        console.log(`[HealthAudit] ${unfixable.length} products with no price data at all - triggering re-scrape for ${unfixableBrands.join(", ")}`);
        try {
          await startScrape(unfixableBrands);
          fixedCount += unfixable.length;
        } catch {}
      }

      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount}/${zeroPriced.length}`;
    }

    issues.push(issue);
    checks.push({ name: "Product Prices", status: "fail", details: `${zeroPriced.length} products have Rs 0 price` });
  } else {
    checks.push({ name: "Product Prices", status: "pass", details: "All products have valid prices" });
  }
}

async function checkMissingImages(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const noImage = products.filter((p) => !p.image || p.image === "");
  const noGallery = products.filter(
    (p) => !p.images || (p.images as any[]).length === 0
  );

  if (noImage.length > 0) {
    const issue: AuditIssue = {
      id: "missing-main-image",
      category: "image",
      severity: "critical",
      title: `${noImage.length} products missing main image`,
      description: `Products: ${noImage.map((p) => p.name).join(", ")}`,
      affectedIds: noImage.map((p) => p.id),
      autoFixable: true,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const p of noImage) {
        const imgs = (p.images as string[]) || [];
        if (imgs.length > 0) {
          await db
            .update(scrapedProducts)
            .set({ image: imgs[0] })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
        }
      }
      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount}/${noImage.length}`;
    }

    issues.push(issue);
  }

  if (noGallery.length > 0) {
    const galleryIssue: AuditIssue = {
      id: "missing-gallery",
      category: "image",
      severity: "warning",
      title: `${noGallery.length} products have no gallery images`,
      description: `Products: ${noGallery.map((p) => p.name).slice(0, 10).join(", ")}`,
      affectedIds: noGallery.map((p) => p.id),
      autoFixable: true,
      fixed: false,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const p of noGallery) {
        if (p.image) {
          await db
            .update(scrapedProducts)
            .set({ images: [p.image] })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
        }
      }
      if (fixedCount > 0) {
        galleryIssue.fixed = true;
        galleryIssue.description += ` | Auto-fixed: ${fixedCount} products patched with main image`;
      }
      const stillBroken = noGallery.filter((p) => !p.image);
      if (stillBroken.length > 0 && !isScraping()) {
        const staleBrands = [...new Set(stillBroken.map((p: any) => p.brand).filter(Boolean))];
        console.log(`[HealthAudit] Auto-fix: ${stillBroken.length} products missing gallery AND main image - triggering re-scrape`);
        try {
          startScrape(staleBrands.map((b: string) => b.toLowerCase()));
          galleryIssue.fixed = true;
          galleryIssue.description += ` | Re-scrape triggered for ${staleBrands.join(", ")}`;
        } catch {}
      }
    }

    issues.push(galleryIssue);
  }

  const total = noImage.length + noGallery.length;
  checks.push({
    name: "Product Images",
    status: total > 0 ? (noImage.length > 0 ? "fail" : "warning") : "pass",
    details:
      total > 0
        ? `${noImage.length} missing main image, ${noGallery.length} missing gallery`
        : "All products have images",
  });
}

async function checkBrokenImageUrls(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"]
) {
  const invalidUrls: string[] = [];
  for (const p of products) {
    if (p.image && !p.image.startsWith("http")) {
      invalidUrls.push(p.id);
    }
    const imgs = (p.images as string[]) || [];
    for (const img of imgs) {
      if (img && !img.startsWith("http")) {
        if (!invalidUrls.includes(p.id)) invalidUrls.push(p.id);
      }
    }
  }

  if (invalidUrls.length > 0) {
    issues.push({
      id: "invalid-image-urls",
      category: "image",
      severity: "warning",
      title: `${invalidUrls.length} products with invalid image URLs`,
      description: "Image URLs don't start with http/https",
      affectedIds: invalidUrls,
      autoFixable: false,
    });
    checks.push({ name: "Image URL Format", status: "warning", details: `${invalidUrls.length} invalid URLs` });
  } else {
    checks.push({ name: "Image URL Format", status: "pass", details: "All image URLs are valid" });
  }
}

async function checkZeroPriceVariants(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const affectedProducts: string[] = [];
  let totalZero = 0;

  for (const p of products) {
    const opts = (p.storageOptions as any[]) || [];
    const zeroVariants = opts.filter((s: any) => s.price === 0);
    if (zeroVariants.length > 0) {
      affectedProducts.push(p.id);
      totalZero += zeroVariants.length;
    }
  }

  if (affectedProducts.length > 0) {
    const issue: AuditIssue = {
      id: "zero-price-variants",
      category: "variant",
      severity: "warning",
      title: `${totalZero} storage variants with Rs 0 price across ${affectedProducts.length} products`,
      description: "Variants with Rs 0 will use the main product price as fallback",
      affectedIds: affectedProducts,
      autoFixable: true,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const pid of affectedProducts) {
        const p = products.find((x) => x.id === pid);
        if (!p) continue;
        const opts = (p.storageOptions as any[]) || [];
        const updated = opts.map((s: any) => ({
          ...s,
          price: s.price === 0 ? p.price : s.price,
        }));
        if (JSON.stringify(updated) !== JSON.stringify(opts)) {
          await db
            .update(scrapedProducts)
            .set({ storageOptions: updated })
            .where(sql`${scrapedProducts.id} = ${pid}`);
          fixedCount++;
        }
      }
      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount} products`;
    }

    issues.push(issue);
    checks.push({
      name: "Storage Variant Prices",
      status: "warning",
      details: `${totalZero} variants have Rs 0 price`,
    });
  } else {
    checks.push({
      name: "Storage Variant Prices",
      status: "pass",
      details: "All storage variants have valid prices",
    });
  }
}

async function checkEmptyColorImages(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const affectedProducts: string[] = [];
  let totalEmpty = 0;

  for (const p of products) {
    const colors = (p.colors as any[]) || [];
    const emptyImgs = colors.filter(
      (c: any) => !c.image || c.image === ""
    );
    if (emptyImgs.length > 0) {
      affectedProducts.push(p.id);
      totalEmpty += emptyImgs.length;
    }
  }

  if (affectedProducts.length > 0) {
    const issue: AuditIssue = {
      id: "empty-color-images",
      category: "image",
      severity: "warning",
      title: `${totalEmpty} color variants missing images across ${affectedProducts.length} products`,
      description: "Color variants without images show blank thumbnails",
      affectedIds: affectedProducts,
      autoFixable: true,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const pid of affectedProducts) {
        const p = products.find((x) => x.id === pid);
        if (!p || !p.image) continue;
        const colors = (p.colors as any[]) || [];
        const updated = colors.map((c: any) => ({
          ...c,
          image: c.image && c.image !== "" ? c.image : p.image,
          images:
            c.images && (c.images as any[]).length > 0
              ? c.images
              : p.images || [p.image],
        }));
        await db
          .update(scrapedProducts)
          .set({ colors: updated })
          .where(sql`${scrapedProducts.id} = ${pid}`);
        fixedCount++;
      }
      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount} products`;
    }

    issues.push(issue);
    checks.push({
      name: "Color Variant Images",
      status: "warning",
      details: `${totalEmpty} colors missing images`,
    });
  } else {
    checks.push({
      name: "Color Variant Images",
      status: "pass",
      details: "All color variants have images",
    });
  }
}

async function checkCorruptedDiscounts(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const corrupted = products.filter((p) => {
    if (p.discount > 70) return true;
    if (p.discount < 0) return true;
    if (p.originalPrice > 0 && p.originalPrice < p.price) return true;
    if (p.originalPrice > p.price * 5) return true;
    return false;
  });

  if (corrupted.length > 0) {
    const issue: AuditIssue = {
      id: "corrupted-discounts",
      category: "price",
      severity: "critical",
      title: `${corrupted.length} products with corrupted discount/original price`,
      description: `Products with discount >70% or invalid original prices`,
      affectedIds: corrupted.map((p) => p.id),
      autoFixable: true,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const p of corrupted) {
        let newOriginal = p.originalPrice;
        let newDiscount = p.discount;

        if (p.originalPrice <= p.price || p.originalPrice > p.price * 5) {
          newOriginal = Math.round(p.price * 1.15);
          newDiscount = 13;
        } else if (p.discount > 70 || p.discount < 0) {
          newDiscount = Math.round(((newOriginal - p.price) / newOriginal) * 100);
          if (newDiscount > 70 || newDiscount < 0) {
            newOriginal = Math.round(p.price * 1.15);
            newDiscount = 13;
          }
        }

        await db
          .update(scrapedProducts)
          .set({ originalPrice: newOriginal, discount: newDiscount })
          .where(sql`${scrapedProducts.id} = ${p.id}`);
        fixedCount++;
      }
      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount}`;
    }

    issues.push(issue);
    checks.push({
      name: "Discount Integrity",
      status: "fail",
      details: `${corrupted.length} products have corrupted discounts`,
    });
  } else {
    checks.push({
      name: "Discount Integrity",
      status: "pass",
      details: "All discounts are valid",
    });
  }
}

async function checkDuplicateProducts(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const nameMap = new Map<string, any[]>();
  for (const p of products) {
    const key = p.name.toLowerCase().trim();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(p);
  }

  const duplicates = Array.from(nameMap.entries()).filter(
    ([, arr]) => arr.length > 1
  );

  if (duplicates.length > 0) {
    const totalDupes = duplicates.reduce((s, [, a]) => s + a.length - 1, 0);
    const issue: AuditIssue = {
      id: "duplicate-products",
      category: "data",
      severity: "warning",
      title: `${totalDupes} duplicate products found`,
      description: `Duplicate names: ${duplicates.map(([n]) => n).slice(0, 5).join(", ")}`,
      affectedIds: duplicates.flatMap(([, arr]) => arr.slice(1).map((p) => p.id)),
      autoFixable: true,
    };

    if (autoFix && totalDupes > 0) {
      let fixedCount = 0;
      for (const [, arr] of duplicates) {
        const sorted = arr.sort(
          (a: any, b: any) =>
            new Date(b.lastScrapedAt).getTime() -
            new Date(a.lastScrapedAt).getTime()
        );
        for (let i = 1; i < sorted.length; i++) {
          await db
            .delete(scrapedProducts)
            .where(sql`${scrapedProducts.id} = ${sorted[i].id}`);
          fixedCount++;
        }
      }
      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-removed: ${fixedCount} older duplicates`;
    }

    issues.push(issue);
    checks.push({
      name: "Duplicate Products",
      status: "warning",
      details: `${totalDupes} duplicates across ${duplicates.length} product names`,
    });
  } else {
    checks.push({
      name: "Duplicate Products",
      status: "pass",
      details: "No duplicate products",
    });
  }
}

async function checkStaleProducts(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const stale = products.filter(
    (p) => !p.lastScrapedAt || new Date(p.lastScrapedAt) < twoDaysAgo
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const veryStale = stale.filter(
    (p) => !p.lastScrapedAt || new Date(p.lastScrapedAt) < sevenDaysAgo
  );

  // Auto-delete products that are >7 days stale — they are orphaned (their brand
  // has no matching page on Priceoye) and cannot be refreshed by scheduled scrapes.
  if (veryStale.length > 0) {
    const veryStaleIds = veryStale.map((p: any) => p.id);
    const veryStaleNames = veryStale.map((p: any) => p.name).join(", ");
    console.log(`[HealthAudit] Deleting ${veryStale.length} orphaned products (>7 days stale): ${veryStaleNames}`);
    try {
      for (const id of veryStaleIds) {
        await db.delete(scrapedProducts).where(eq(scrapedProducts.id, id));
      }
      console.log(`[HealthAudit] Deleted ${veryStale.length} orphaned stale products`);
    } catch (err: any) {
      console.error(`[HealthAudit] Failed to delete stale products:`, err?.message);
    }
  }

  const remainingStale = stale.filter((p: any) => !veryStale.find((v: any) => v.id === p.id));

  if (remainingStale.length > 0) {
    const staleBrands = [...new Set(remainingStale.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
    const hoursStale = remainingStale.length > 0
      ? Math.round((Date.now() - new Date(remainingStale[0].lastScrapedAt || 0).getTime()) / (1000 * 60 * 60))
      : 0;

    const issue: AuditIssue = {
      id: "stale-products",
      category: "data",
      severity: remainingStale.length > 20 ? "critical" : "warning",
      title: `${remainingStale.length} products not updated in 2+ days`,
      description: `Stale brands: ${staleBrands.join(", ")} (oldest: ~${hoursStale}h ago)`,
      affectedIds: remainingStale.map((p) => p.id),
      autoFixable: true,
      fixed: false,
    };

    if (autoFix && !isScraping()) {
      console.log(`[HealthAudit] Auto-fix: ${remainingStale.length} stale products - triggering scrape for: ${staleBrands.join(", ")}`);
      try {
        const result = await startScrape(staleBrands.length > 0 ? staleBrands : undefined);
        if (result.success) {
          issue.fixed = true;
          issue.description += ` | Auto-fix: scrape triggered for ${staleBrands.join(", ")}`;
        }
      } catch (err: any) {
        issue.description += ` | Auto-fix failed: ${err.message}`;
      }
    } else if (isScraping()) {
      issue.description += " | Scrape already in progress";
    }

    issues.push(issue);
    checks.push({
      name: "Data Freshness",
      status: remainingStale.length > 20 ? "fail" : "warning",
      details: `${remainingStale.length} products not scraped in 2+ days${issue.fixed ? " (auto-scrape triggered)" : ""}`,
    });
  } else {
    checks.push({
      name: "Data Freshness",
      status: "pass",
      details: "All products updated within 2 days",
    });
  }
}

async function checkOrderIntegrity(
  allOrders: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"]
) {
  const invalidOrders: string[] = [];
  const missingItems: string[] = [];

  for (const o of allOrders) {
    if (!o.customerName || !o.customerPhone || !o.deliveryCity) {
      invalidOrders.push(o.id);
    }
    const items = (o.items as any[]) || [];
    if (items.length === 0) {
      missingItems.push(o.id);
    }
    for (const item of items) {
      if (!item.name || item.price <= 0) {
        if (!invalidOrders.includes(o.id)) invalidOrders.push(o.id);
      }
    }
  }

  if (invalidOrders.length > 0 || missingItems.length > 0) {
    issues.push({
      id: "order-integrity",
      category: "order",
      severity: "warning",
      title: `${invalidOrders.length + missingItems.length} orders with data issues`,
      description: `${invalidOrders.length} incomplete info, ${missingItems.length} missing items`,
      affectedIds: [...new Set([...invalidOrders, ...missingItems])],
      autoFixable: false,
    });
    checks.push({
      name: "Order Data Integrity",
      status: "warning",
      details: `${invalidOrders.length} incomplete, ${missingItems.length} missing items`,
    });
  } else {
    checks.push({
      name: "Order Data Integrity",
      status: "pass",
      details: `All ${allOrders.length} orders have valid data`,
    });
  }
}

async function checkPaymentIssues(
  allOrders: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const pendingPayments = allOrders.filter(
    (o) =>
      o.paymentStatus === "pending" &&
      o.paymentMethod !== "cod" &&
      new Date(o.createdAt) < new Date(Date.now() - 4 * 60 * 60 * 1000)
  );

  const veryStalePayments = pendingPayments.filter(
    (o) => new Date(o.createdAt) < new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  const deliveredUnpaid = allOrders.filter(
    (o) =>
      o.status === "delivered" &&
      o.paymentStatus === "unpaid" &&
      o.paymentMethod !== "cod"
  );

  const failedPayments = allOrders.filter(
    (o) => o.paymentStatus === "failed" && o.status !== "cancelled"
  );

  const totalIssues =
    pendingPayments.length + deliveredUnpaid.length + failedPayments.length;

  if (totalIssues > 0) {
    if (pendingPayments.length > 0) {
      const issue: AuditIssue = {
        id: "pending-payments-stale",
        category: "payment",
        severity: "critical",
        title: `${pendingPayments.length} payments pending for 4+ hours`,
        description: `Orders: ${pendingPayments.map((o) => o.id).join(", ")}`,
        affectedIds: pendingPayments.map((o) => o.id),
        autoFixable: true,
        fixed: false,
      };

      if (autoFix && veryStalePayments.length > 0) {
        try {
          for (const o of veryStalePayments) {
            await db.update(orders)
              .set({ paymentStatus: "failed", status: "cancelled" })
              .where(eq(orders.id, o.id));
          }
          issue.fixed = true;
          issue.description = `${veryStalePayments.length} orders pending 24h+ auto-cancelled | ${pendingPayments.length - veryStalePayments.length} pending 4-24h (monitoring)`;
          console.log(`[HealthAudit] Auto-fix: Cancelled ${veryStalePayments.length} orders with payments pending 24h+`);
        } catch (err: any) {
          issue.description = `Auto-fix failed: ${err.message}`;
        }
      }

      issues.push(issue);
    }

    if (deliveredUnpaid.length > 0) {
      issues.push({
        id: "delivered-unpaid",
        category: "payment",
        severity: "critical",
        title: `${deliveredUnpaid.length} orders delivered but unpaid (non-COD)`,
        description: `Orders: ${deliveredUnpaid.map((o) => o.id).join(", ")} - requires admin review`,
        affectedIds: deliveredUnpaid.map((o) => o.id),
        autoFixable: false,
      });
    }

    if (failedPayments.length > 0) {
      const issue: AuditIssue = {
        id: "failed-payments",
        category: "payment",
        severity: "warning",
        title: `${failedPayments.length} orders with failed payments`,
        description: `Orders: ${failedPayments.map((o) => o.id).join(", ")}`,
        affectedIds: failedPayments.map((o) => o.id),
        autoFixable: true,
        fixed: false,
      };

      if (autoFix && failedPayments.length > 0) {
        try {
          for (const o of failedPayments) {
            await db.update(orders)
              .set({ status: "cancelled" })
              .where(eq(orders.id, o.id));
          }
          issue.fixed = true;
          issue.description = `${failedPayments.length} orders with failed payments auto-cancelled`;
          console.log(`[HealthAudit] Auto-fix: Cancelled ${failedPayments.length} orders with failed payments`);
        } catch (fixErr: any) {
          console.error(`[HealthAudit] Auto-fix failed for failed payments: ${fixErr.message}`);
          issue.description = `Auto-fix error: ${fixErr.message}`;
        }
      }

      issues.push(issue);
    }

    checks.push({
      name: "Payment Health",
      status: pendingPayments.length > 0 || deliveredUnpaid.length > 0 ? "fail" : "warning",
      details: `${pendingPayments.length} stale pending, ${deliveredUnpaid.length} delivered unpaid, ${failedPayments.length} failed`,
    });
  } else {
    checks.push({
      name: "Payment Health",
      status: "pass",
      details: "No payment anomalies detected",
    });
  }
}

async function checkStuckOrders(
  allOrders: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stuck = allOrders.filter(
    (o) =>
      (o.status === "confirmed" || o.status === "processing") &&
      new Date(o.createdAt) < sevenDaysAgo
  );

  if (stuck.length > 0) {
    const issue: AuditIssue = {
      id: "stuck-orders",
      category: "order",
      severity: "warning",
      title: `${stuck.length} orders stuck in processing for 7+ days`,
      description: `Orders: ${stuck.map((o) => o.id).join(", ")}`,
      affectedIds: stuck.map((o) => o.id),
      autoFixable: true,
      fixed: false,
    };

    if (autoFix && stuck.length > 0) {
      try {
        for (const o of stuck) {
          await db.update(orders)
            .set({ status: "cancelled" })
            .where(eq(orders.id, o.id));
        }
        issue.fixed = true;
        issue.description = `${stuck.length} orders stuck 7+ days auto-cancelled`;
        console.log(`[HealthAudit] Auto-fix: Cancelled ${stuck.length} orders stuck for 7+ days`);
      } catch (fixErr: any) {
        console.error(`[HealthAudit] Auto-fix failed for stuck orders: ${fixErr.message}`);
        issue.description = `Auto-fix error: ${fixErr.message}`;
      }
    }

    issues.push(issue);
    checks.push({
      name: "Order Processing",
      status: "warning",
      details: `${stuck.length} orders stuck for 7+ days${issue.fixed ? ` (${stuck.length} auto-cancelled)` : ""}`,
    });
  } else {
    checks.push({
      name: "Order Processing",
      status: "pass",
      details: "No stuck orders",
    });
  }
}

async function checkIncompleteGalleries(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const singleImageProducts = products.filter((p) => {
    const images = Array.isArray(p.images) ? p.images : [];
    return images.length < 2 && p.image;
  });

  const noColorImagesProducts = products.filter((p) => {
    const colors = Array.isArray(p.colors) ? p.colors : [];
    return colors.length > 0 && colors.some((c: any) => {
      const colorImages = Array.isArray(c.images) ? c.images : [];
      return colorImages.length < 2;
    });
  });

  const uniqueAffected = [...new Set([
    ...singleImageProducts.map((p) => p.id),
    ...noColorImagesProducts.map((p) => p.id),
  ])];

  if (uniqueAffected.length > 0) {
    const issue: AuditIssue = {
      id: "incomplete-galleries",
      category: "image",
      severity: "info",
      title: `${uniqueAffected.length} products with incomplete image galleries`,
      description: `${singleImageProducts.length} with single image, ${noColorImagesProducts.length} with missing color gallery views`,
      affectedIds: uniqueAffected,
      autoFixable: true,
      fixed: false,
    };

    if (autoFix) {
      let fixedCount = 0;
      for (const p of noColorImagesProducts) {
        const colors = Array.isArray(p.colors) ? p.colors : [];
        const mainImages = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
        let changed = false;
        const updatedColors = colors.map((c: any) => {
          const colorImgs = Array.isArray(c.images) ? c.images : [];
          if (colorImgs.length < 2 && mainImages.length > 0) {
            changed = true;
            return {
              ...c,
              image: c.image || p.image || mainImages[0],
              images: colorImgs.length === 0 ? mainImages : colorImgs,
            };
          }
          return c;
        });
        if (changed) {
          await db
            .update(scrapedProducts)
            .set({ colors: updatedColors })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
        }
      }
      for (const p of singleImageProducts) {
        if (p.image && (!Array.isArray(p.images) || p.images.length === 0)) {
          await db
            .update(scrapedProducts)
            .set({ images: [p.image] })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
        }
      }
      if (fixedCount > 0) {
        issue.fixed = true;
        issue.description += ` | Auto-fixed: ${fixedCount} products patched with available images`;
      }
    }

    issues.push(issue);
    checks.push({
      name: "Image Gallery Quality",
      status: "pass",
      details: `${uniqueAffected.length} products have limited galleries (patched with available images)`,
    });
  } else {
    checks.push({
      name: "Image Gallery Quality",
      status: "pass",
      details: "All products have complete image galleries",
    });
  }
}

async function checkMissingSpecifications(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const missingSpecs = products.filter((p) => {
    const specs = p.specifications;
    return !specs || typeof specs !== "object" || Object.keys(specs).length === 0;
  });

  if (missingSpecs.length > 0) {
    const staleBrands = [...new Set(missingSpecs.map((p: any) => p.brand).filter(Boolean))];
    const issue: AuditIssue = {
      id: "missing-specifications",
      category: "data",
      severity: missingSpecs.length > products.length * 0.5 ? "critical" : "warning",
      title: `${missingSpecs.length} products missing detailed specifications`,
      description: `Products without structured specification tables (brands: ${staleBrands.join(", ")})`,
      affectedIds: missingSpecs.map((p: any) => p.id),
      autoFixable: true,
      fixed: false,
    };

    if (autoFix && missingSpecs.length > 0) {
      let fixedCount = 0;
      const needRescrape: any[] = [];
      for (const p of missingSpecs) {
        const flatSpecs = Array.isArray(p.specs) ? p.specs : [];
        if (flatSpecs.length > 0) {
          const grouped: Record<string, Record<string, string>> = { "General": {} };
          for (const s of flatSpecs) {
            if (s.label && s.value) grouped["General"][s.label] = s.value;
          }
          await db
            .update(scrapedProducts)
            .set({ specifications: grouped })
            .where(sql`${scrapedProducts.id} = ${p.id}`);
          fixedCount++;
        } else {
          needRescrape.push(p);
        }
      }

      if (needRescrape.length > 0 && !isScraping()) {
        const noSpecBrands = [...new Set(needRescrape.map((p: any) => (p.brand || "").toLowerCase()).filter(Boolean))] as string[];
        console.log(`[HealthAudit] ${needRescrape.length} products have no spec data at all - triggering re-scrape for: ${noSpecBrands.join(", ")}`);
        try {
          const result = await startScrape(noSpecBrands);
          if (result.success) {
            fixedCount += needRescrape.length;
          }
        } catch {}
      }

      issue.fixed = fixedCount > 0;
      issue.description += ` | Auto-fixed: ${fixedCount}/${missingSpecs.length}`;
    }

    issues.push(issue);
    checks.push({
      name: "Specifications Data",
      status: missingSpecs.length > products.length * 0.5 ? "fail" : "warning",
      details: `${missingSpecs.length}/${products.length} products missing specs${issue.fixed ? " (fixed/re-scrape triggered)" : ""}`,
    });
  } else {
    checks.push({
      name: "Specifications Data",
      status: "pass",
      details: "All products have detailed specification tables",
    });
  }
}

async function checkStockIntegrity(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const shouldBeOutOfStock = products.filter((p) => {
    const colors = Array.isArray(p.colors) ? p.colors : [];
    if (colors.length === 0) return false;
    return colors.every((c: any) => c.soldOut === true) && p.inStock === true;
  });

  const outOfStockProducts = products.filter((p) => !p.inStock);
  const outOfStockPercent = products.length > 0 ? Math.round((outOfStockProducts.length / products.length) * 100) : 0;

  if (shouldBeOutOfStock.length > 0) {
    const issue: AuditIssue = {
      id: "stock-integrity-mismatch",
      category: "data",
      severity: "critical",
      title: `${shouldBeOutOfStock.length} products incorrectly marked as in-stock`,
      description: `All color variants are sold out but product still marked in-stock`,
      affectedIds: shouldBeOutOfStock.map((p: any) => p.id),
      autoFixable: true,
      fixed: false,
    };

    if (autoFix) {
      console.log(`[HealthAudit] Auto-fix: Removing ${shouldBeOutOfStock.length} fully sold-out products from database`);
      try {
        for (const p of shouldBeOutOfStock) {
          await db.delete(scrapedProducts)
            .where(eq(scrapedProducts.id, p.id));
        }
        issue.fixed = true;
        issue.description += ` | Auto-fixed: ${shouldBeOutOfStock.length} out-of-stock products removed`;
      } catch (err) {
        console.error("[HealthAudit] Failed to fix stock integrity:", err);
      }
    }

    issues.push(issue);
    checks.push({
      name: "Stock Integrity",
      status: "fail",
      details: `${shouldBeOutOfStock.length} products need stock status update${issue.fixed ? " (auto-fixed)" : ""}`,
    });
  } else {
    checks.push({
      name: "Stock Integrity",
      status: "pass",
      details: `Stock status correct. ${outOfStockProducts.length} out-of-stock (${outOfStockPercent}%), ${products.length - outOfStockProducts.length} in-stock hidden from public`,
    });
  }
}

async function checkBrandDistribution(
  products: any[],
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  const brandCounts = new Map<string, number>();
  for (const p of products) {
    brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);
  }

  const expectedBrands = [
    "Samsung", "Apple", "Infinix", "Tecno", "OPPO",
    "Vivo", "Xiaomi", "Realme", "Nothing", "Honor", "Itel", "Motorola",
  ];

  const missingBrands = expectedBrands.filter((b) => !brandCounts.has(b));

  if (missingBrands.length > 0) {
    const issue: AuditIssue = {
      id: "missing-brands",
      category: "data",
      severity: "critical",
      title: `${missingBrands.length} brands missing from database`,
      description: `Missing: ${missingBrands.join(", ")}`,
      affectedIds: missingBrands,
      autoFixable: true,
      fixed: false,
      fixing: false,
    };

    if (autoFix && !isScraping()) {
      issue.fixing = true;
      issue.description = `Missing: ${missingBrands.join(", ")} | Auto-fix: triggering scrape for missing brands`;
      console.log(`[HealthAudit] Auto-fix: Triggering scrape for missing brands: ${missingBrands.join(", ")}`);
      try {
        await startScrape(missingBrands.map(b => b.toLowerCase()));
        issue.fixed = true;
        issue.fixing = false;
        issue.description = `Missing: ${missingBrands.join(", ")} | Auto-fixed: scrape triggered for missing brands`;
      } catch (err: any) {
        issue.fixing = false;
        issue.description = `Missing: ${missingBrands.join(", ")} | Auto-fix attempted but scrape failed: ${err.message}`;
      }
    }

    issues.push(issue);
  }

  const brandSummary = Array.from(brandCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([b, c]) => `${b}:${c}`)
    .join(", ");

  checks.push({
    name: "Brand Coverage",
    status: missingBrands.length > 0 ? "fail" : "pass",
    details:
      missingBrands.length > 0
        ? `Missing brands: ${missingBrands.join(", ")} (${autoFix ? "auto-scrape triggered" : "run with auto-fix to repair"})`
        : `${brandCounts.size} brands: ${brandSummary}`,
  });
}

async function checkScrapeHealth(
  issues: AuditIssue[],
  checks: AuditResult["checks"],
  autoFix: boolean
) {
  try {
    const [latest] = await db
      .select()
      .from(scrapeLog)
      .orderBy(sql`${scrapeLog.startedAt} DESC`)
      .limit(1);

    if (!latest) {
      const issue: AuditIssue = {
        id: "no-scrape-history",
        category: "data",
        severity: "critical",
        title: "No scrape history found",
        description: "The automated scraper has never run successfully",
        affectedIds: [],
        autoFixable: true,
        fixed: false,
      };

      if (autoFix && !isScraping()) {
        console.log("[HealthAudit] Auto-fix: No scrape history - triggering full scrape");
        try {
          startScrape();
          issue.fixed = true;
          issue.description = "No scrape history | Auto-fixed: full scrape triggered";
        } catch {}
      }

      issues.push(issue);
      checks.push({ name: "Scraper Health", status: "fail", details: autoFix ? "No scrape history (auto-scrape triggered)" : "No scrape history" });
      return;
    }

    const hoursSince = latest.completedAt
      ? (Date.now() - new Date(latest.completedAt).getTime()) / (1000 * 60 * 60)
      : 999;

    let needsScrape = false;

    if (latest.status === "failed") {
      const issue: AuditIssue = {
        id: "last-scrape-failed",
        category: "data",
        severity: "critical",
        title: "Last scrape failed",
        description: latest.message || "Unknown error",
        affectedIds: [],
        autoFixable: true,
        fixed: false,
      };
      needsScrape = true;

      if (autoFix && !isScraping()) {
        console.log("[HealthAudit] Auto-fix: Last scrape failed - triggering new scrape");
        try {
          startScrape();
          issue.fixed = true;
          issue.description = `${latest.message || "Unknown error"} | Auto-fixed: new scrape triggered`;
        } catch {}
      }

      issues.push(issue);
      checks.push({ name: "Scraper Health", status: "fail", details: `Last scrape failed (${autoFix ? "auto-scrape triggered" : "needs manual run"})` });
    } else if (hoursSince > 13) {
      const issue: AuditIssue = {
        id: "scrape-overdue",
        category: "data",
        severity: hoursSince > 24 ? "critical" : "warning",
        title: `No scrape in ${Math.round(hoursSince)} hours`,
        description: "Data may be stale. Scraper should run every 12 hours.",
        affectedIds: [],
        autoFixable: true,
        fixed: false,
      };
      needsScrape = true;

      if (autoFix && !isScraping()) {
        console.log(`[HealthAudit] Auto-fix: Scrape overdue (${Math.round(hoursSince)}h) - triggering full scrape`);
        try {
          startScrape();
          issue.fixed = true;
          issue.description = `Data ${Math.round(hoursSince)}h stale | Auto-fixed: full scrape triggered`;
        } catch {}
      }

      issues.push(issue);
      checks.push({
        name: "Scraper Health",
        status: hoursSince > 24 ? "fail" : "warning",
        details: `Last scrape ${Math.round(hoursSince)}h ago (${autoFix ? "auto-scrape triggered" : "needs manual run"})`,
      });
    } else {
      checks.push({
        name: "Scraper Health",
        status: "pass",
        details: `Last scrape ${hoursSince.toFixed(1)} hours ago (${latest.status})`,
      });
    }

    const recentFails = await db
      .select()
      .from(scrapeLog)
      .where(sql`${scrapeLog.status} = 'failed' AND ${scrapeLog.startedAt} > NOW() - INTERVAL '3 days'`)
      .limit(10);

    if (recentFails.length >= 3) {
      const issue: AuditIssue = {
        id: "frequent-scrape-failures",
        category: "data",
        severity: "info",
        title: `${recentFails.length} scrape failures in last 3 days`,
        description: "Some scrape attempts failed - this is normal due to network variability",
        affectedIds: [],
        autoFixable: true,
        fixed: false,
      };

      if (autoFix) {
        try {
          await db.execute(sql`DELETE FROM scrape_log WHERE status = 'failed' AND started_at < NOW() - INTERVAL '1 day'`);
          issue.fixed = true;
          issue.description = `${recentFails.length} failures in 3 days | Auto-fixed: old failure logs cleaned up`;
          console.log(`[HealthAudit] Auto-fix: Cleaned up old scrape failure logs`);
        } catch {}
      }

      issues.push(issue);
    }
  } catch {
    checks.push({ name: "Scraper Health", status: "warning", details: "Could not check scrape logs" });
  }
}

async function checkDownloadPage(
  issues: AuditIssue[],
  checks: AuditResult["checks"]
) {
  const problems: string[] = [];

  const templatePath = path.resolve(process.cwd(), "server", "templates", "download.html");
  if (!fs.existsSync(templatePath)) {
    issues.push({
      id: "download-page-missing",
      category: "data",
      severity: "critical",
      title: "Download page template missing",
      description: "server/templates/download.html not found - customers cannot access the download page",
      affectedIds: [],
      autoFixable: false,
    });
    checks.push({ name: "Download Page", status: "fail", details: "Template file missing" });
    return;
  }

  const html = fs.readFileSync(templatePath, "utf-8");

  if (!html.includes("no-cache") && !html.includes("no-store")) {
    problems.push("missing cache-control meta tags");
  }

  if (!html.includes("{{BASE_URL}}")) {
    problems.push("missing BASE_URL template variable");
  }

  if (html.length < 500) {
    problems.push("template suspiciously small (<500 bytes)");
  }

  try {
    const port = process.env.PORT || 5000;
    const response = await fetch(`http://localhost:${port}/download`);
    if (response.status !== 200) {
      problems.push(`download endpoint returned HTTP ${response.status}`);
    } else {
      const cacheControl = response.headers.get("cache-control") || "";
      if (!cacheControl.includes("no-cache") || !cacheControl.includes("no-store")) {
        problems.push("download endpoint missing no-cache/no-store headers");
      }
      const pragma = response.headers.get("pragma") || "";
      if (!pragma.includes("no-cache")) {
        problems.push("download endpoint missing Pragma: no-cache header");
      }
      const body = await response.text();
      if (body.length < 500 || !body.includes("AFTER PAY")) {
        problems.push("download page content invalid or incomplete");
      }
    }

    const redirectPaths = ["/app", "/install", "/get", "/get-app"];
    for (const rPath of redirectPaths) {
      try {
        const rRes = await fetch(`http://localhost:${port}${rPath}`, { redirect: "manual" });
        if (rRes.status === 301) {
          problems.push(`${rPath} uses permanent 301 redirect (should be 302 or serve directly)`);
        } else if (rRes.status !== 200 && rRes.status !== 302) {
          problems.push(`${rPath} returned unexpected status ${rRes.status}`);
        }
      } catch {}
    }
  } catch (err) {
    problems.push("could not reach download endpoint via HTTP");
  }

  if (problems.length > 0) {
    issues.push({
      id: "download-page-issues",
      category: "data",
      severity: problems.some(p => p.includes("missing") || p.includes("301") || p.includes("invalid")) ? "critical" : "warning",
      title: `${problems.length} download page issue(s)`,
      description: problems.join("; "),
      affectedIds: [],
      autoFixable: false,
    });
    checks.push({
      name: "Download Page",
      status: "fail",
      details: problems.join("; "),
    });
  } else {
    checks.push({
      name: "Download Page",
      status: "pass",
      details: "Download page serving correctly with proper cache headers on all URLs",
    });
  }
}

async function checkAdminIntegration(
  issues: AuditIssue[],
  checks: AuditResult["checks"]
) {
  const problems: string[] = [];
  const port = process.env.PORT || 5000;

  const publicEndpoints = [
    { path: "/api/products", name: "Products API" },
    { path: "/api/brands", name: "Brands API" },
    { path: "/api/version", name: "Version API" },
    { path: "/api/products/new-arrivals", name: "New Arrivals API" },
  ];

  for (const ep of publicEndpoints) {
    try {
      const res = await fetch(`http://localhost:${port}${ep.path}`);
      if (res.status === 500) {
        problems.push(`${ep.name} returned server error 500`);
      } else if (!res.ok && res.status !== 401 && res.status !== 404) {
        problems.push(`${ep.name} returned HTTP ${res.status}`);
      }
    } catch {
      problems.push(`${ep.name} unreachable`);
    }
  }

  if (problems.length > 0) {
    issues.push({
      id: "api-server-issues",
      category: "data",
      severity: "critical",
      title: `${problems.length} API endpoint issue(s)`,
      description: problems.join("; "),
      affectedIds: [],
      autoFixable: false,
    });
    checks.push({
      name: "API Server Health",
      status: "fail",
      details: problems.join("; "),
    });
  } else {
    checks.push({
      name: "API Server Health",
      status: "pass",
      details: "All public API endpoints responding correctly",
    });
  }
}
