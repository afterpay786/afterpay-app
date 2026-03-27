import * as cheerio from "cheerio";
import { db } from "./db";
import { scrapedProducts, scrapeLog } from "@shared/schema";
import { eq, sql, and, notInArray } from "drizzle-orm";

const BASE_URL = "https://priceoye.pk";
const BRANDS = [
  "samsung", "apple", "infinix", "tecno", "oppo", "vivo",
  "xiaomi", "realme", "nothing", "honor", "itel", "motorola"
];

const DELAY_MS = 1500;
const RETRY_DELAYS = [2000, 4000, 8000];
const FETCH_TIMEOUT_MS = 30000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15",
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchPage(url: string, attempt = 0): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const ua = pickUserAgent();
    const isDetailPage = url.includes("/mobiles/") && url.split("/").length >= 6;
    const referer = isDetailPage
      ? `${BASE_URL}/mobile-phones/${url.split("/")[url.split("/").indexOf("mobiles") + 1]}/`
      : `${BASE_URL}/`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": referer,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Connection": "keep-alive",
      },
    });

    clearTimeout(timer);

    if (response.status === 429 || response.status === 503) {
      if (attempt < RETRY_DELAYS.length) {
        const waitMs = RETRY_DELAYS[attempt];
        console.log(`[Scraper] Rate limited (${response.status}) on ${url}, waiting ${waitMs}ms before retry ${attempt + 1}`);
        await delay(waitMs);
        return fetchPage(url, attempt + 1);
      }
      console.log(`[Scraper] Rate limited after all retries: ${url}`);
      return null;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      if (attempt < RETRY_DELAYS.length) {
        await delay(RETRY_DELAYS[attempt]);
        return fetchPage(url, attempt + 1);
      }
      console.log(`[Scraper] HTTP ${response.status} fetching: ${url}`);
      return null;
    }

    const text = await response.text();
    if (!text || text.length < 500) {
      if (attempt < RETRY_DELAYS.length) {
        console.log(`[Scraper] Got empty/tiny response (${text.length} bytes) for ${url}, retrying...`);
        await delay(RETRY_DELAYS[attempt]);
        return fetchPage(url, attempt + 1);
      }
      console.log(`[Scraper] Empty response after retries: ${url}`);
      return null;
    }

    return text;
  } catch (error: any) {
    clearTimeout(timer);
    if (error.name === "AbortError") {
      console.log(`[Scraper] Timeout (${FETCH_TIMEOUT_MS}ms) fetching: ${url}`);
    } else {
      console.log(`[Scraper] Fetch error (attempt ${attempt + 1}): ${url}`, error.message || error);
    }
    if (attempt < RETRY_DELAYS.length) {
      await delay(RETRY_DELAYS[attempt]);
      return fetchPage(url, attempt + 1);
    }
    return null;
  }
}

function generateProductId(brand: string, slug: string): string {
  const brandPrefix = brand.substring(0, 3).toLowerCase();
  const hash = slug.split("").reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${brandPrefix}_${Math.abs(hash).toString(36)}`;
}

function parsePrice(text: string): number {
  const cleaned = text.replace(/[^0-9]/g, "");
  return parseInt(cleaned, 10) || 0;
}

// ─── Hidden price markup caps ──────────────────────────────────────────────────
// Applied to every scraped price before storage. Confidential — never exposed
// to clients. Order matters: first matching tier is used.
const PRICE_MARKUP_TIERS: { maxPrice: number; markup: number }[] = [
  { maxPrice:  25_000, markup:    800 },
  { maxPrice:  30_000, markup:  1_200 },
  { maxPrice:  40_000, markup:  1_400 },
  { maxPrice:  80_000, markup:  1_700 },
  { maxPrice: 120_000, markup:  2_700 },
  { maxPrice: 200_000, markup:  9_000 },
  { maxPrice: 800_000, markup: 20_000 },
];

/**
 * Apply the hidden retail markup to a raw Priceoye price.
 * Returns the price unchanged if ≤ 0 or above the highest tier.
 */
function applyPriceMarkup(rawPrice: number): number {
  if (rawPrice <= 0) return rawPrice;
  for (const { maxPrice, markup } of PRICE_MARKUP_TIERS) {
    if (rawPrice <= maxPrice) return rawPrice + markup;
  }
  return rawPrice; // above 800 k — no markup defined
}

/** Exported so other modules (startup migration) can reuse the same tiers. */
export { applyPriceMarkup, PRICE_MARKUP_TIERS };

const HEX_MAP: Record<string, string> = {
  "black": "#000000", "white": "#FFFFFF", "blue": "#0000FF", "gray": "#808080",
  "grey": "#808080", "silver": "#C0C0C0", "gold": "#FFD700", "green": "#008000",
  "red": "#FF0000", "purple": "#800080", "pink": "#FFC0CB", "orange": "#FFA500",
  "yellow": "#FFFF00", "titanium": "#878681", "cream": "#FFFDD0", "lavender": "#E6E6FA",
  "mint": "#98FF98", "coral": "#FF7F50", "beige": "#F5F5DC", "brown": "#8B4513",
  "navy": "#000080", "teal": "#008080", "violet": "#EE82EE", "rose": "#FF007F",
  "midnight": "#191970", "natural": "#C4A882", "desert": "#C19A6B", "ultramarine": "#3F00FF",
  "sky": "#87CEEB", "ice": "#D6ECEF", "dark": "#1a1a1a", "light": "#D3D3D3",
  "graphite": "#383838", "space": "#2C2C2C", "phantom": "#1C1C1C",
  "emerald": "#50C878", "sapphire": "#0F52BA", "pearl": "#F0EAD6",
  "bronze": "#CD7F32", "copper": "#B87333", "charcoal": "#36454F",
  "ivory": "#FFFFF0", "mocha": "#967969", "sand": "#C2B280", "peach": "#FFE5B4",
  "aqua": "#00FFFF", "turquoise": "#40E0D0", "magenta": "#FF00FF",
  "lime": "#00FF00", "lilac": "#C8A2C8", "mauve": "#E0B0FF",
  "slate": "#708090", "onyx": "#353839", "chrome": "#DBE4EB",
  "bora": "#9966CC", "awesome": "#4EA97A", "cyan": "#00BCD4",
  "burgundy": "#800020", "maroon": "#800000", "olive": "#808000",
  "indigo": "#3F51B5", "fuchsia": "#FF00FF", "amber": "#FFC107",
};

function getHexForColor(name: string): string {
  const lower = name.toLowerCase().replace(/_/g, " ");
  for (const [key, value] of Object.entries(HEX_MAP)) {
    if (lower.includes(key)) return value;
  }
  return "#808080";
}

function formatColorName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ListingProduct {
  name: string;
  price: number;
  originalPrice: number;
  discount: number;
  rating: number;
  reviews: number;
  image: string;
  slug: string;
  url: string;
  fastDelivery: boolean;
  brand: string;
}

const BRAND_MAP: Record<string, string> = {
  "samsung": "Samsung", "apple": "Apple", "infinix": "Infinix",
  "tecno": "Tecno", "oppo": "OPPO", "vivo": "Vivo",
  "xiaomi": "Xiaomi", "realme": "Realme", "nothing": "Nothing",
  "honor": "Honor", "itel": "Itel", "motorola": "Motorola",
};

function resolveBrandFromSlug(brandSlug: string): string {
  const lower = brandSlug.toLowerCase();
  if (BRAND_MAP[lower]) return BRAND_MAP[lower];
  // Common Priceoye slug variations
  const EXTRA: Record<string, string> = {
    "oneplus": "OnePlus", "one-plus": "OnePlus",
    "google": "Google", "huawei": "Huawei",
    "nokia": "Nokia", "sony": "Sony", "lg": "LG",
    "blackberry": "BlackBerry", "htc": "HTC",
    "asus": "Asus", "lenovo": "Lenovo", "agm": "AGM",
    "alcatel": "Alcatel", "doogee": "Doogee",
    "ulefone": "Ulefone", "oukitel": "Oukitel",
  };
  if (EXTRA[lower]) return EXTRA[lower];
  return brandSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseProductsFromHtml(html: string, brandFilter?: string): ListingProduct[] {
  const $ = cheerio.load(html);
  const products: ListingProduct[] = [];

  $("a[href*='/mobiles/']").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") || "";

    if (!href.match(/\/mobiles\/[^/]+\/[^/]+/)) return;
    if (href.includes("/compare/") || href.includes("/pricelist/") || href.includes("/buy/")) return;

    const cleanHref = href.startsWith("http") ? href.replace(BASE_URL, "") : href;
    const urlParts = cleanHref.split("/").filter(Boolean);
    if (urlParts.length < 3) return; // needs /mobiles/[brand]/[slug]
    const slug = urlParts[urlParts.length - 1] || "";
    const brandInUrl = urlParts[urlParts.length - 2] || "";
    if (!slug || brandInUrl === "mobiles") return;

    // Skip keypad/feature phones by slug keywords
    const KEYPAD_KEYWORDS = ["keypad", "feature-phone", "bar-phone", "button-phone", "dual-sim-keypad", "feature phone", "qwerty"];
    if (KEYPAD_KEYWORDS.some(kw => slug.toLowerCase().includes(kw))) return;

    // If brand filter given, only accept matching brand
    if (brandFilter && brandInUrl.toLowerCase() !== brandFilter.toLowerCase()) return;

    const $img = $el.find("img").first();
    let imgSrc = $img.attr("data-src") || $img.attr("src") || "";
    if (!imgSrc || imgSrc.includes("/brands/") || imgSrc.includes("/badges/") || imgSrc.includes("logo")) return;
    if (!imgSrc.startsWith("http") && !imgSrc.startsWith("//") && !imgSrc.startsWith("/")) return;

    const textContent = $el.text().replace(/\s+/g, " ").trim();
    const htmlContent = $el.html() || "";

    // Skip listings where the visible text says "discontinued" or the card has a discontinued CSS class
    if (
      textContent.toLowerCase().includes("discontinued") ||
      $el.find("[class*='discontinued']").length > 0
    ) return;

    // Price must be present
    const priceMatches = textContent.match(/Rs\.?\s*([\d,]+)/gi);
    if (!priceMatches || priceMatches.length === 0) return;

    const price = parsePrice(priceMatches[0]);
    const originalPrice = priceMatches.length > 1 ? parsePrice(priceMatches[1]) : price;
    if (price < 10000 || price > 2000000) return;

    const discountMatch = textContent.match(/(\d+)%\s*OFF/i);
    const ratingMatch = textContent.match(/([\d.]+)\s*\(?([\d,]+)\s*Reviews?\)?/i);

    // Best name: try heading/title elements first, then bold, then slug
    let name = "";
    const nameEl = $el.find("h1, h2, h3, h4, h5, strong, b, [class*='name'], [class*='title'], [class*='product']").first();
    const nameCandidate = nameEl.text().trim();
    if (nameCandidate && nameCandidate.length > 4 && nameCandidate.length < 120) {
      name = nameCandidate.replace(/\s+/g, " ").trim();
    }
    if (!name) {
      name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Normalize image to 270x270
    imgSrc = imgSrc.replace(/(\d+x\d+)/g, "270x270");
    const fullImg = imgSrc.startsWith("http") ? imgSrc : imgSrc.startsWith("//") ? `https:${imgSrc}` : `${BASE_URL}${imgSrc}`;

    if (products.find((p) => p.slug === slug)) return;

    const resolvedBrand = resolveBrandFromSlug(brandInUrl);

    products.push({
      name,
      price,
      originalPrice: originalPrice > price ? originalPrice : price,
      discount: discountMatch
        ? parseInt(discountMatch[1])
        : originalPrice > price
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0,
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
      reviews: ratingMatch ? parseInt(ratingMatch[2].replace(/,/g, "")) : 0,
      image: fullImg,
      slug,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      fastDelivery: !!$el.find("[class*='fast-delivery'], img[src*='fast-delivery']").length,
      brand: resolvedBrand,
    });
  });

  return products;
}

const IMG_BASE = "https://images.priceoye.pk/";

// ─── JSON extraction helpers ───────────────────────────────────────────────

function extractJsonBlock(html: string, marker: string): any | null {
  const startIdx = html.indexOf(marker);
  if (startIdx < 0) return null;
  const jsonStart = html.indexOf("{", startIdx);
  if (jsonStart < 0) return null;
  let braceCount = 0, jsonEnd = jsonStart;
  for (let i = jsonStart; i < Math.min(html.length, jsonStart + 800000); i++) {
    if (html[i] === "{") braceCount++;
    else if (html[i] === "}") { braceCount--; if (braceCount === 0) { jsonEnd = i; break; } }
  }
  try { return JSON.parse(html.substring(jsonStart, jsonEnd + 1)); } catch { return null; }
}

function extractProductData(html: string): any | null {
  const markers = [
    "window.product_data = {", "window.product_data={",
    "var product_data = {", "var product_data={",
    "productData = {", "let product_data = {",
  ];
  for (const m of markers) {
    const data = extractJsonBlock(html, m);
    if (data) return data;
  }
  return null;
}

function extractNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ─── Image helpers ─────────────────────────────────────────────────────────

function buildImageUrl(img: string, size = "500x500"): string {
  if (!img) return "";
  const normalized = img
    .replace(/\b(50x50|100x100|150x150|200x200|270x270|300x300)\b/g, size)
    .replace(/\b(thumb|small|medium)\b/g, "large");
  if (normalized.startsWith("http")) return normalized;
  if (normalized.startsWith("//")) return `https:${normalized}`;
  return `${IMG_BASE}${normalized}`;
}

function dedupeImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    // Normalize URL for dedup key (ignore size variant)
    const key = url.replace(/\d+x\d+/, "DIM").replace(/\?.*/, "");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(url);
    }
  }
  return result;
}

function upsizeImageUrl(url: string): string {
  return url
    .replace(/\b(50x50|100x100|150x150|200x200|270x270|300x300)\b/g, "500x500")
    .replace(/thumb\//gi, "large/");
}

// ─── Spec helpers ──────────────────────────────────────────────────────────

function parseSpecifications(specData: any): { specs: { label: string; value: string }[]; specifications: Record<string, Record<string, string>> } {
  const specs: { label: string; value: string }[] = [];
  const specifications: Record<string, Record<string, string>> = {};
  if (typeof specData !== "object" || specData === null) return { specs, specifications };
  for (const [section, rows] of Object.entries(specData)) {
    if (!Array.isArray(rows)) continue;
    const sectionData: Record<string, string> = {};
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      for (const [key, val] of Object.entries(row as Record<string, string>)) {
        const cleanKey = String(key).trim();
        const cleanVal = String(val).trim();
        if (!cleanKey || !cleanVal || cleanVal === "null") continue;
        sectionData[cleanKey] = cleanVal;
        specs.push({ label: cleanKey, value: cleanVal });
      }
    }
    if (Object.keys(sectionData).length > 0) {
      specifications[section] = sectionData;
    }
  }
  return { specs, specifications };
}

// Extract specs from HTML spec table (fallback when JSON is empty)
function extractHtmlSpecs($: ReturnType<typeof cheerio.load>): { specs: { label: string; value: string }[]; specifications: Record<string, Record<string, string>> } {
  const specs: { label: string; value: string }[] = [];
  const specifications: Record<string, Record<string, string>> = {};
  let currentSection = "General";

  const SECTION_HEADERS = ["display", "camera", "battery", "memory", "storage", "connectivity", "performance", "general", "design", "features", "audio", "network", "sensor"];

  // Try spec table rows first
  $("table tr, [class*='spec-row'], [class*='spec_row'], [class*='specRow']").each((_, el) => {
    const $el = $(el);
    const cells = $el.find("td, th");
    if (cells.length >= 2) {
      const label = cells.eq(0).text().trim();
      const value = cells.eq(1).text().trim();
      if (label && value && value !== "N/A" && value !== "-" && label.length < 60 && value.length < 300) {
        // Detect section headers in label
        const lowerLabel = label.toLowerCase();
        if (SECTION_HEADERS.some(s => lowerLabel === s || lowerLabel.startsWith(s + " "))) {
          currentSection = label;
        } else {
          if (!specifications[currentSection]) specifications[currentSection] = {};
          specifications[currentSection][label] = value;
          specs.push({ label, value });
        }
      }
    }
  });

  // If table didn't work, try dl/dt/dd pattern
  if (specs.length === 0) {
    $("dl, [class*='specs'], [class*='specification']").each((_, container) => {
      const $c = $(container);
      const heading = $c.find("h2, h3, h4, [class*='heading'], [class*='title']").first().text().trim();
      if (heading) currentSection = heading;

      $c.find("dt, [class*='label'], [class*='name']").each((i, dt) => {
        const $dt = $(dt);
        const label = $dt.text().trim();
        const value = $dt.next("dd, [class*='value']").text().trim();
        if (label && value && value !== "N/A" && label.length < 60 && value.length < 300) {
          if (!specifications[currentSection]) specifications[currentSection] = {};
          specifications[currentSection][label] = value;
          specs.push({ label, value });
        }
      });
    });
  }

  // Generic key-value pairs from divs with spec-like class names
  if (specs.length === 0) {
    $("[class*='spec'], [class*='feature']").each((_, el) => {
      const $el = $(el);
      const label = $el.find("[class*='label'], [class*='name'], [class*='key']").first().text().trim();
      const value = $el.find("[class*='value'], [class*='data'], [class*='info']").first().text().trim();
      if (label && value && label.length < 60 && value.length < 200) {
        if (!specifications["General"]) specifications["General"] = {};
        specifications["General"][label] = value;
        specs.push({ label, value });
      }
    });
  }

  return { specs, specifications };
}

// ─── Product name helpers ──────────────────────────────────────────────────

function extractProductName(html: string, $: ReturnType<typeof cheerio.load>, productData: any, nextData: any, fallbackSlug: string): string {
  // Priority 1: window.product_data.dataSet.product_name
  const fromData = productData?.dataSet?.product_name || productData?.product_name ||
    productData?.dataSet?.name || productData?.name;
  if (fromData && typeof fromData === "string" && fromData.length > 3 && fromData.length < 200) {
    return fromData.trim();
  }

  // Priority 2: Next.js data
  try {
    const nextProduct = nextData?.props?.pageProps?.product || nextData?.props?.pageProps?.productData;
    const fromNext = nextProduct?.name || nextProduct?.product_name || nextProduct?.title;
    if (fromNext && typeof fromNext === "string" && fromNext.length > 3) return fromNext.trim();
  } catch {}

  // Priority 3: ld+json Product name
  let ldName = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    if (ldName) return;
    try {
      const ld = JSON.parse($(el).html() || "");
      const prod = ld["@type"] === "Product" ? ld : (Array.isArray(ld) ? ld.find((i: any) => i["@type"] === "Product") : null);
      if (prod?.name) ldName = String(prod.name).trim();
    } catch {}
  });
  if (ldName && ldName.length > 3) return ldName;

  // Priority 4: Open Graph / meta title
  const ogTitle = $('meta[property="og:title"]').attr("content") || $('meta[name="title"]').attr("content") || "";
  if (ogTitle && ogTitle.length > 3 && ogTitle.length < 150) {
    return ogTitle.replace(/\s*[-|]\s*PriceOye.*$/i, "").trim();
  }

  // Priority 5: H1 heading
  const h1 = $("h1").first().text().trim();
  if (h1 && h1.length > 3 && h1.length < 150) return h1.replace(/\s*price\s*in\s*pakistan.*/i, "").trim();

  // Priority 6: page <title>
  const title = $("title").first().text().trim();
  if (title && title.length > 3) {
    return title.replace(/\s*[-|]\s*PriceOye.*$/i, "").replace(/\s*price\s*in\s*pakistan.*/i, "").trim();
  }

  // Fallback: clean slug
  return fallbackSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Data quality scoring ──────────────────────────────────────────────────

function scoreProductData(detail: ProductDetail, name: string): number {
  let score = 0;
  if (name && !name.includes("-") && name.length > 5) score += 10; // Good name
  if (detail.price > 0) score += 15;
  if (detail.images.length >= 3) score += 15;
  else if (detail.images.length >= 1) score += 5;
  if (detail.colors.length > 0) score += 15;
  if (detail.storageOptions.length > 0) score += 10;
  if (Object.keys(detail.specifications).length >= 3) score += 15;
  else if (detail.specs.length >= 5) score += 8;
  if (detail.productDescription && detail.productDescription.length > 30) score += 5;
  if (detail.summaryHighlights.length >= 2) score += 5;
  if (detail.rating > 0) score += 5;
  if (detail.dataSource === "window.product_data") score += 5;
  return score; // max 100
}

// ─── Main detail page parser ───────────────────────────────────────────────

interface ProductDetail {
  name: string;
  images: string[];
  colors: { name: string; hex: string; image: string; images: string[]; soldOut: boolean }[];
  storageOptions: { label: string; price: number }[];
  specs: { label: string; value: string }[];
  specifications: Record<string, Record<string, string>>;
  productDescription: string;
  summaryHighlights: { title: string; subtitle: string; icon: string }[];
  rating: number;
  reviews: number;
  price: number;
  originalPrice: number;
  dataSource: "window.product_data" | "html-fallback" | "ld+json";
  qualityScore: number;
}

function parseProductDetailPage(html: string, productUrl: string, fallbackSlug = ""): ProductDetail | null {
  try {
    const $ = cheerio.load(html);
    const result: ProductDetail = {
      name: "",
      images: [],
      colors: [],
      storageOptions: [],
      specs: [],
      specifications: {},
      productDescription: "",
      summaryHighlights: [],
      rating: 0,
      reviews: 0,
      price: 0,
      originalPrice: 0,
      dataSource: "html-fallback",
      qualityScore: 0,
    };

    // ── Extract all JSON sources ───────────────────────────────────────────
    const productData = extractProductData(html);
    const nextData = extractNextData(html);

    // ── Product name (best available source) ──────────────────────────────
    result.name = extractProductName(html, $, productData, nextData, fallbackSlug || productUrl.split("/").filter(Boolean).pop() || "");

    // ── Primary path: window.product_data ─────────────────────────────────
    if (productData) {
      result.dataSource = "window.product_data";
      const colorImages = productData.product_color_images || {};
      const dataPrices = productData.product_config?.dataPrices || {};
      const dataSet = productData.dataSet || {};
      const summary = productData.summaryAttributes || {};

      // ── Images: collect ALL per-color, prefer large → medium ──────────
      const allImages: string[] = [];
      for (const [, imgData] of Object.entries(colorImages)) {
        const ci = imgData as any;
        const sources = [
          ...(Array.isArray(ci.large) ? ci.large : []),
          ...(Array.isArray(ci.medium) ? ci.medium : []),
        ];
        for (const img of sources) {
          const url = buildImageUrl(img, "500x500");
          if (url && !allImages.some(u => u.replace(/\d+x\d+/, "X") === url.replace(/\d+x\d+/, "X"))) {
            allImages.push(url);
          }
        }
      }
      // Fall back to small images if nothing else found
      if (allImages.length === 0) {
        for (const [, imgData] of Object.entries(colorImages)) {
          const ci = imgData as any;
          for (const img of (Array.isArray(ci.small) ? ci.small : [])) {
            const url = buildImageUrl(img, "500x500");
            if (url && !allImages.includes(url)) allImages.push(url);
          }
        }
      }
      result.images = dedupeImages(allImages);

      // ── Prices & availability ─────────────────────────────────────────
      const storageMap = new Map<string, { price: number; origPrice: number }>();
      let lowestPrice = Infinity;
      let lowestOrigPrice = 0;

      for (const [colorKey, storageData] of Object.entries(dataPrices)) {
        if (typeof storageData !== "object" || !storageData || Array.isArray(storageData)) continue;

        const colorName = formatColorName(colorKey);
        let colorSoldOut = true; // innocent until proven guilty

        for (const [storageKey, storeList] of Object.entries(storageData as Record<string, any>)) {
          if (!Array.isArray(storeList)) continue;

          let storageSoldOut = true;
          for (const store of storeList) {
            const avail = String(store.product_availability || store.availability || "").toLowerCase();
            const availIdx = Number(store.product_availability_index ?? store.availability_index ?? -1);
            const isInStock = avail === "in stock" || avail === "instock" || avail === "1" || availIdx === 1;
            if (isInStock) { storageSoldOut = false; colorSoldOut = false; }

            const vPrice = store.product_price ? parsePrice(String(store.product_price)) : 0;
            const vRetail = store.retail_price ? parsePrice(String(store.retail_price)) : 0;

            if (vPrice >= 10000 && vPrice < 2000000) {
              const normKey = storageKey.replace(/\s+/g, " ").trim().toUpperCase();
              const existing = storageMap.get(normKey);
              // Use the best (in-stock) price; if tied, prefer lower
              if (!existing || (!storageSoldOut && (existing.price > vPrice || storageSoldOut))) {
                storageMap.set(normKey, { price: vPrice, origPrice: vRetail > vPrice ? vRetail : vPrice });
              }
              if (vPrice < lowestPrice) {
                lowestPrice = vPrice;
                lowestOrigPrice = vRetail > vPrice ? vRetail : vPrice;
              }
            }
          }
        }

        // ── Per-color image gallery ────────────────────────────────────
        const colorImgData = colorImages[colorKey] as any;
        let colorGallery: string[] = [];
        let colorThumb = "";

        if (colorImgData) {
          const largeSrcs: string[] = Array.isArray(colorImgData.large) ? colorImgData.large : [];
          const medSrcs: string[] = Array.isArray(colorImgData.medium) ? colorImgData.medium : [];
          const smSrcs: string[] = Array.isArray(colorImgData.small) ? colorImgData.small : [];

          colorGallery = dedupeImages([
            ...largeSrcs.map(i => buildImageUrl(i, "500x500")),
            ...medSrcs.map(i => buildImageUrl(i, "500x500")),
          ]);

          // Thumbnail from medium (smaller size, faster load for swatch)
          if (medSrcs.length > 0) colorThumb = buildImageUrl(medSrcs[0], "150x150");
          else if (smSrcs.length > 0) colorThumb = buildImageUrl(smSrcs[0], "150x150");
          else if (largeSrcs.length > 0) colorThumb = buildImageUrl(largeSrcs[0], "150x150");
        }

        if (colorGallery.length === 0) colorGallery = [...result.images];

        result.colors.push({
          name: colorName,
          hex: getHexForColor(colorKey),
          image: colorThumb || (colorGallery[0] ? upsizeImageUrl(colorGallery[0]).replace("500x500", "150x150") : ""),
          images: colorGallery.length > 0 ? colorGallery : result.images.slice(0, 6),
          soldOut: colorSoldOut,
        });
      }

      for (const [label, info] of storageMap) {
        result.storageOptions.push({ label, price: info.price });
      }
      result.storageOptions.sort((a, b) => a.price - b.price);

      if (lowestPrice < Infinity && lowestPrice >= 10000) {
        result.price = lowestPrice;
        result.originalPrice = lowestOrigPrice;
      }

      // ── Specifications ─────────────────────────────────────────────────
      let specData = dataSet.specification;
      if (!specData) specData = productData.specification || productData.specs;
      if (specData) {
        try {
          const parsed = typeof specData === "string" ? JSON.parse(specData) : specData;
          const extracted = parseSpecifications(parsed);
          result.specs = extracted.specs;
          result.specifications = extracted.specifications;
        } catch {}
      }

      // ── Description ────────────────────────────────────────────────────
      const descSrc = dataSet.product_description || productData.description ||
        dataSet.short_description || productData.short_description || "";
      if (typeof descSrc === "string" && descSrc.length > 10) {
        result.productDescription = descSrc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }

      // ── Summary highlights ─────────────────────────────────────────────
      for (const [, attr] of Object.entries(summary)) {
        const a = attr as any;
        if (a.title && a.sub_titles) {
          result.summaryHighlights.push({
            title: a.title,
            subtitle: String(a.sub_titles).replace(/_/g, " "),
            icon: a.icon || "",
          });
        }
      }

      // ── Ratings ────────────────────────────────────────────────────────
      if (productData.average_rating) result.rating = parseFloat(productData.average_rating) || 0;
      if (productData.total_rattings_count) result.reviews = parseInt(productData.total_rattings_count) || 0;
      if (productData.rating) result.rating = result.rating || parseFloat(productData.rating) || 0;
      if (productData.reviews_count) result.reviews = result.reviews || parseInt(productData.reviews_count) || 0;
    }

    // ── Secondary: window.__NEXT_DATA__ enrichment ────────────────────────
    if (nextData) {
      try {
        const pp = nextData?.props?.pageProps;
        const np = pp?.product || pp?.productData || pp?.productDetail;
        if (np) {
          // Price from Next.js if missing
          if (result.price === 0 && np.price) {
            const np_price = parsePrice(String(np.price));
            if (np_price >= 10000) { result.price = np_price; result.dataSource = "html-fallback"; }
          }
          // Rating from Next.js
          if (result.rating === 0 && np.average_rating) result.rating = parseFloat(np.average_rating) || 0;
          if (result.reviews === 0 && np.total_ratings_count) result.reviews = parseInt(np.total_ratings_count) || 0;
          // Description from Next.js
          if (!result.productDescription && np.description) {
            result.productDescription = String(np.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          }
          // Specs from Next.js
          if (result.specs.length === 0 && np.specification) {
            try {
              const parsed = typeof np.specification === "string" ? JSON.parse(np.specification) : np.specification;
              const extracted = parseSpecifications(parsed);
              if (extracted.specs.length > 0) {
                result.specs = extracted.specs;
                result.specifications = extracted.specifications;
              }
            } catch {}
          }
        }
      } catch {}
    }

    // ── ld+json enrichment (price, rating) ────────────────────────────────
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const ld = JSON.parse($(el).html() || "");
        const product = ld["@type"] === "Product" ? ld : (Array.isArray(ld) ? ld.find((i: any) => i?.["@type"] === "Product") : null);
        if (!product) return;

        if (result.price === 0) {
          const ldPrice = product.offers?.price ?? product.offers?.lowPrice ?? product.offers?.highPrice;
          if (ldPrice) {
            const p = parseFloat(String(ldPrice));
            if (p >= 10000 && p < 2000000) { result.price = Math.round(p); result.dataSource = "ld+json"; }
          }
        }
        if (result.rating === 0 && product.aggregateRating) {
          result.rating = parseFloat(product.aggregateRating.ratingValue) || 0;
          result.reviews = parseInt(product.aggregateRating.reviewCount || product.aggregateRating.ratingCount) || 0;
        }
        // Image from ld+json
        if (result.images.length === 0 && product.image) {
          const imgs = Array.isArray(product.image) ? product.image : [product.image];
          result.images = imgs.filter((i: any) => typeof i === "string" && i.startsWith("http"));
        }
      } catch {}
    });

    // ── HTML fallback: images ─────────────────────────────────────────────
    if (result.images.length < 2) {
      const imgSelectors = [
        "img[src*='priceoye'][src*='500x500']",
        "img[data-src*='priceoye'][data-src*='500x500']",
        "img[src*='images.priceoye']",
        "img[data-src*='images.priceoye']",
        ".swiper-slide img",
        "[class*='gallery'] img",
        "[class*='product-image'] img",
        "[class*='slider'] img",
      ];
      for (const sel of imgSelectors) {
        $(sel).each((_, el) => {
          const src = $(el).attr("data-src") || $(el).attr("src") || "";
          if (!src || src.includes("/brands/") || src.includes("/badges/") || src.includes("logo")) return;
          const upscaled = upsizeImageUrl(src.startsWith("//") ? `https:${src}` : src);
          if (!result.images.some(u => u.replace(/\d+x\d+/, "X") === upscaled.replace(/\d+x\d+/, "X"))) {
            result.images.push(upscaled);
          }
        });
        if (result.images.length >= 3) break;
      }
    }

    // ── HTML fallback: price ──────────────────────────────────────────────
    if (result.price === 0) {
      const priceSelectors = [
        "[class*='current-price']", "[class*='new-price']", "[class*='product-price']:not([class*='old'])",
        "[class*='sale-price']", ".price-value", "[itemprop='price']",
      ];
      for (const sel of priceSelectors) {
        const txt = $(sel).first().text();
        if (!txt) continue;
        const p = parsePrice(txt);
        if (p >= 10000 && p < 2000000) { result.price = p; break; }
      }
      // Generic price pattern from page text
      if (result.price === 0) {
        const priceMatch = html.match(/"price"\s*:\s*"?(\d{5,7})"?/);
        if (priceMatch) {
          const p = parseInt(priceMatch[1]);
          if (p >= 10000 && p < 2000000) result.price = p;
        }
      }
    }

    // ── HTML fallback: specs ──────────────────────────────────────────────
    if (result.specs.length < 3) {
      const htmlSpecs = extractHtmlSpecs($);
      if (htmlSpecs.specs.length > result.specs.length) {
        result.specs = htmlSpecs.specs;
        result.specifications = htmlSpecs.specifications;
      }
    }

    // ── HTML fallback: description ────────────────────────────────────────
    if (!result.productDescription) {
      const descSelectors = [
        "[class*='product-description']", "[class*='product-detail']",
        "[class*='description']", "[itemprop='description']",
        'meta[name="description"]', 'meta[property="og:description"]',
      ];
      for (const sel of descSelectors) {
        const el = $(sel).first();
        const txt = el.attr("content") || el.text().trim();
        if (txt && txt.length > 30) {
          result.productDescription = txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
          break;
        }
      }
    }

    // ── HTML fallback: rating ─────────────────────────────────────────────
    if (result.rating === 0) {
      const ratingText = $("[class*='rating'], [itemprop='ratingValue']").first().text().trim();
      if (ratingText) {
        const r = parseFloat(ratingText);
        if (r > 0 && r <= 5) result.rating = r;
      }
      const reviewMatch = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/);
      if (reviewMatch && result.rating === 0) result.rating = parseFloat(reviewMatch[1]) || 0;
    }

    // ── Quality score ─────────────────────────────────────────────────────
    result.qualityScore = scoreProductData(result, result.name);

    return result;
  } catch (error) {
    console.log(`[Scraper] Error parsing detail for ${productUrl}:`, error);
    return null;
  }
}

let scrapeInProgress = false;
let currentScrapeLogId: string | null = null;

export function isScraping() {
  return scrapeInProgress;
}

export async function getScrapeStatus() {
  if (currentScrapeLogId) {
    const [log] = await db.select().from(scrapeLog).where(eq(scrapeLog.id, currentScrapeLogId));
    return log || null;
  }
  const [latest] = await db.select().from(scrapeLog).orderBy(sql`started_at DESC`).limit(1);
  return latest || null;
}

export async function startScrape(brandFilter?: string[]): Promise<{ success: boolean; message: string; logId?: string }> {
  if (scrapeInProgress) {
    return { success: false, message: "Scrape already in progress" };
  }

  scrapeInProgress = true;

  try {
    const [log] = await db.insert(scrapeLog).values({
      status: "running",
      message: "Starting scrape...",
    }).returning();

    currentScrapeLogId = log.id;

    runScrape(log.id, brandFilter).catch((error) => {
      console.error("[Scraper] Fatal error:", error);
      scrapeInProgress = false;
      currentScrapeLogId = null;
    });

    return { success: true, message: "Scrape started", logId: log.id };
  } catch (error) {
    scrapeInProgress = false;
    console.error("[Scraper] Failed to start scrape:", error);
    return { success: false, message: `Failed to start scrape: ${error}` };
  }
}

async function saveListingToDb(
  listing: ListingProduct,
  detail: ProductDetail | null,
  existingMap: Map<string, number>,
  totalNewProducts: { value: number },
  totalPriceUpdates: { value: number },
) {
  const brandSlug = listing.brand.toLowerCase().replace(/\s+/g, "");
  const productId = generateProductId(brandSlug, listing.slug);

  // Determine accurate product name: prefer detail page > listing page
  const accurateName = (detail?.name && detail.name.length > 3 && !detail.name.includes("-"))
    ? detail.name
    : listing.name;

  const isInStock = detail?.colors && detail.colors.length > 0
    ? detail.colors.some(c => !c.soldOut)
    : true;

  if (!isInStock && detail?.colors && detail.colors.length > 0) {
    console.log(`[Scraper] SKIP (all OOS): ${accurateName}`);
    await db.delete(scrapedProducts).where(eq(scrapedProducts.id, productId));
    return false;
  }

  // ── Raw prices from Priceoye ──────────────────────────────────────────────────
  const rawPrice = detail?.price && detail.price >= 10000 ? detail.price : listing.price;
  const rawOrigPrice = detail?.originalPrice && detail.originalPrice > rawPrice && detail.originalPrice < rawPrice * 3
    ? detail.originalPrice
    : listing.originalPrice > rawPrice && listing.originalPrice < rawPrice * 3
    ? listing.originalPrice : rawPrice;

  // ── Apply hidden retail markup (confidential — never exposed to users) ─────────
  const finalPrice = applyPriceMarkup(rawPrice);
  const finalOrigPrice = rawOrigPrice > rawPrice ? applyPriceMarkup(rawOrigPrice) : finalPrice;
  const discount = finalOrigPrice > finalPrice ? Math.round(((finalOrigPrice - finalPrice) / finalOrigPrice) * 100) : 0;

  const isNew = !existingMap.has(productId);
  const oldPrice = existingMap.get(productId) || 0;
  if (oldPrice > 0 && oldPrice !== finalPrice) {
    totalPriceUpdates.value++;
    const dir = finalPrice > oldPrice ? `▲ +Rs ${finalPrice - oldPrice}` : `▼ -Rs ${oldPrice - finalPrice}`;
    console.log(`[Scraper] PRICE: ${accurateName} | Rs ${oldPrice} → Rs ${finalPrice} (${dir})`);
  }

  const qualityScore = detail?.qualityScore ?? 0;
  const productData = {
    id: productId,
    name: accurateName,
    brand: listing.brand,
    slug: listing.slug,
    price: finalPrice,
    originalPrice: finalOrigPrice,
    discount,
    rating: detail?.rating || listing.rating,
    reviews: detail?.reviews || listing.reviews,
    image: listing.image,
    images: detail?.images?.length ? detail.images : [listing.image.replace("270x270", "500x500")],
    specs: detail?.specs?.length ? detail.specs : [],
    specifications: detail?.specifications && Object.keys(detail.specifications).length > 0 ? detail.specifications : {},
    description: `${accurateName} - Available at the lowest price in Pakistan only at AFTER PAY with warranty.`,
    productDescription: detail?.productDescription || "",
    summaryHighlights: detail?.summaryHighlights || [],
    fastDelivery: listing.fastDelivery,
    inStock: true,
    category: "smartphones",
    colors: detail?.colors || [],
    storageOptions: (detail?.storageOptions || []).map(opt => ({
      ...opt,
      price: applyPriceMarkup(opt.price),
    })),
    highlights: detail?.summaryHighlights
      ?.filter(h => h.icon && !h.icon.includes("shipping") && !h.icon.includes("delivery") && !h.icon.includes("approved"))
      .map(h => ({
        icon: h.icon.includes("display") ? "phone-portrait-outline"
          : h.icon.includes("ram") ? "hardware-chip-outline"
          : h.icon.includes("battery") ? "battery-full-outline"
          : h.icon.includes("camera") ? "camera-outline"
          : "information-circle-outline",
        title: h.subtitle,
        description: h.title,
      })) || [],
    priceoye_url: listing.url,
    isNewArrival: isNew,
    lastScrapedAt: new Date(),
  };

  await db.insert(scrapedProducts).values(productData)
    .onConflictDoUpdate({
      target: scrapedProducts.id,
      set: {
        name: productData.name,
        price: productData.price,
        originalPrice: productData.originalPrice,
        discount: productData.discount,
        rating: productData.rating,
        reviews: productData.reviews,
        image: productData.image,
        images: productData.images,
        specs: productData.specs,
        specifications: productData.specifications,
        productDescription: productData.productDescription,
        summaryHighlights: productData.summaryHighlights,
        colors: productData.colors,
        storageOptions: productData.storageOptions,
        highlights: productData.highlights,
        fastDelivery: productData.fastDelivery,
        inStock: productData.inStock,
        lastScrapedAt: new Date(),
      },
    });

  if (isNew) {
    totalNewProducts.value++;
    console.log(`[Scraper] NEW: ${accurateName} | Rs ${finalPrice} | ${(detail?.colors || []).length} colors | ${(detail?.images || []).length} imgs | Q:${qualityScore} | ${detail?.dataSource || "html"}`);
  } else {
    console.log(`[Scraper] UPD: ${accurateName} | Rs ${finalPrice} | ${(detail?.colors || []).length} colors | ${(detail?.images || []).length} imgs | Q:${qualityScore} | ${detail?.dataSource || "html"}`);
  }
  if (qualityScore < 40) {
    console.log(`[Scraper] ⚠️ LOW QUALITY (${qualityScore}/100): ${accurateName} — specs:${(detail?.specs || []).length} imgs:${(detail?.images || []).length} price:${finalPrice}`);
  }

  return true;
}

async function runScrape(logId: string, brandFilter?: string[]) {
  let totalFound = 0;
  let totalScraped = 0;
  let totalErrors = 0;
  let fallbackParseCount = 0;
  const totalNewProducts = { value: 0 };
  const totalPriceUpdates = { value: 0 };

  // Collect all products from global listing OR brand-specific pages
  const allListingProducts: ListingProduct[] = [];
  const seenSlugs = new Set<string>();

  try {
    if (brandFilter && brandFilter.length > 0) {
      // Health audit re-run: scrape specific brand pages
      console.log(`[Scraper] === Brand re-scrape: ${brandFilter.join(", ")} ===`);
      for (const brand of brandFilter) {
        await db.update(scrapeLog).set({ message: `Scraping ${brand} pages...` }).where(eq(scrapeLog.id, logId));
        let page = 1;
        while (page <= 5) {
          const url = page === 1
            ? `${BASE_URL}/mobiles/${brand}/`
            : `${BASE_URL}/mobiles/${brand}/?page=${page}`;
          const html = await fetchPage(url);
          if (!html) break;
          const found = parseProductsFromHtml(html, brand);
          if (found.length === 0) break;
          for (const p of found) {
            if (!seenSlugs.has(p.slug)) {
              seenSlugs.add(p.slug);
              allListingProducts.push(p);
            }
          }
          if (found.length < 8) break;
          page++;
          await delay(DELAY_MS);
        }
        console.log(`[Scraper] Found ${allListingProducts.length} products for ${brand}`);
      }
    } else {
      // Full global scrape: main /mobiles/ page A-to-Z
      console.log(`[Scraper] === GLOBAL SCRAPE: all mobile phones A-to-Z ===`);
      const MAX_PAGES = 20;
      const MAX_TOTAL = 400;

      for (let page = 1; page <= MAX_PAGES && allListingProducts.length < MAX_TOTAL; page++) {
        await db.update(scrapeLog).set({
          message: `Scanning listings page ${page}/${MAX_PAGES}...`,
        }).where(eq(scrapeLog.id, logId));

        const url = page === 1
          ? `${BASE_URL}/mobiles/`
          : `${BASE_URL}/mobiles/?page=${page}`;
        const html = await fetchPage(url);
        if (!html) {
          console.log(`[Scraper] Could not fetch page ${page}, stopping listing scan`);
          break;
        }

        const found = parseProductsFromHtml(html);
        if (found.length === 0) {
          console.log(`[Scraper] No products on page ${page}, listing scan complete`);
          break;
        }

        let addedThisPage = 0;
        for (const p of found) {
          if (!seenSlugs.has(p.slug)) {
            seenSlugs.add(p.slug);
            allListingProducts.push(p);
            addedThisPage++;
          }
        }
        console.log(`[Scraper] Page ${page}: found ${found.length}, added ${addedThisPage} new (total: ${allListingProducts.length})`);

        if (addedThisPage === 0) break; // All duplicates — done
        await delay(DELAY_MS);
      }
    }

    totalFound = allListingProducts.length;
    console.log(`[Scraper] Total listings to process: ${totalFound}`);

    // Load all existing products for price change detection
    const existingAll = await db.select({ id: scrapedProducts.id, price: scrapedProducts.price }).from(scrapedProducts);
    const existingMap = new Map(existingAll.map(p => [p.id, p.price]));

    // Process each product detail
    for (let i = 0; i < allListingProducts.length; i++) {
      const listing = allListingProducts[i];
      try {
        await db.update(scrapeLog).set({
          message: `Processing ${i + 1}/${totalFound}: ${listing.name}`,
          totalProducts: totalFound,
          scrapedProducts: totalScraped,
        }).where(eq(scrapeLog.id, logId));

        const detailHtml = await fetchPage(listing.url);
        if (!detailHtml) {
          console.log(`[Scraper] Could not fetch: ${listing.name}`);
          totalErrors++;
          continue;
        }

        const detail = parseProductDetailPage(detailHtml, listing.url, listing.slug);
        if (detail?.dataSource !== "window.product_data") fallbackParseCount++;

        const saved = await saveListingToDb(listing, detail, existingMap, totalNewProducts, totalPriceUpdates);
        if (saved) totalScraped++;

        await delay(DELAY_MS);
      } catch (err: any) {
        console.log(`[Scraper] ERROR on ${listing.name}:`, err?.message || err);
        totalErrors++;
      }
    }

    // Clean up products not found in this scrape
    if (allListingProducts.length > 0) {
      const brandSlugOf = (b: string) => b.toLowerCase().replace(/\s+/g, "");
      const scrapedIds = allListingProducts.map(l => generateProductId(brandSlugOf(l.brand), l.slug));

      if (!brandFilter) {
        // Full scrape: remove any product not in this scrape
        const deleted = await db.delete(scrapedProducts)
          .where(notInArray(scrapedProducts.id, scrapedIds))
          .returning({ id: scrapedProducts.id });
        if (deleted.length > 0) {
          console.log(`[Scraper] Cleaned up ${deleted.length} removed/discontinued products`);
        }
      } else {
        // Brand scrape: only clean up that brand
        for (const brand of brandFilter) {
          const brandName = resolveBrandFromSlug(brand);
          const brandIds = allListingProducts
            .filter(l => l.brand === brandName)
            .map(l => generateProductId(brand, l.slug));
          if (brandIds.length > 0) {
            const deleted = await db.delete(scrapedProducts)
              .where(and(eq(scrapedProducts.brand, brandName), notInArray(scrapedProducts.id, brandIds)))
              .returning({ id: scrapedProducts.id });
            if (deleted.length > 0) {
              console.log(`[Scraper] Cleaned up ${deleted.length} removed ${brandName} products`);
            }
          }
        }
      }
    }

    const summary = `Completed: ${totalScraped}/${totalFound} products, ${totalNewProducts.value} new, ${totalPriceUpdates.value} price updates, ${totalErrors} errors${fallbackParseCount > 0 ? `, ${fallbackParseCount} HTML fallback` : ""}`;
    await db.update(scrapeLog).set({
      status: "completed",
      totalProducts: totalFound,
      scrapedProducts: totalScraped,
      newProducts: totalNewProducts.value,
      errors: totalErrors,
      message: summary,
      completedAt: new Date(),
    }).where(eq(scrapeLog.id, logId));

    console.log(`[Scraper] === DONE: ${summary} ===`);
  } catch (error) {
    console.error("[Scraper] Fatal error:", error);
    await db.update(scrapeLog).set({
      status: "failed",
      message: `Fatal error: ${error}`,
      completedAt: new Date(),
    }).where(eq(scrapeLog.id, logId));
  } finally {
    scrapeInProgress = false;
    currentScrapeLogId = null;
  }
}

// ── AI Keyword Extractor: Parse natural language into clean Priceoye keywords ─
const BRAND_ALIASES: Record<string, string> = {
  "samsung": "samsung", "galaxy": "samsung",
  "apple": "apple", "iphone": "apple",
  "infinix": "infinix",
  "tecno": "tecno",
  "oppo": "oppo",
  "vivo": "vivo",
  "xiaomi": "xiaomi", "redmi": "xiaomi",
  "realme": "realme",
  "nothing": "nothing",
  "honor": "honor",
  "itel": "itel",
  "motorola": "motorola", "moto": "motorola",
  "oneplus": "oneplus",
  "nokia": "nokia",
  "huawei": "huawei",
};

const FILLER_WORDS = new Set([
  "please", "can", "you", "could", "should", "would", "will", "shall",
  "check", "fetch", "get", "find", "search", "look", "show", "give", "add",
  "all", "the", "a", "an", "of", "for", "in", "on", "at", "to", "from",
  "details", "detail", "info", "information", "specs", "specification",
  "specifications", "models", "model", "phones", "phone", "mobiles", "mobile",
  "devices", "device", "products", "product", "data", "available", "mix", "mixing",
  "missing", "new", "latest", "recent", "current", "running", "existing",
  "our", "my", "your", "their", "its", "app", "store", "list",
  "tab", "page", "website", "site", "priceoye", "tap",
  "some", "few", "many", "any", "every", "also", "and", "or", "but",
  "is", "are", "was", "were", "have", "has", "had", "be", "been",
  "not", "no", "yes", "this", "that", "these", "those", "it", "them",
  "we", "i", "he", "she", "they", "update", "updated",
]);

export function extractSearchKeywords(query: string): {
  keyword: string;
  brand: string | null;
  isNaturalLanguage: boolean;
} {
  const lower = query.toLowerCase().trim();
  const words = lower.split(/[\s,\.!?]+/).filter(Boolean);
  const fillerCount = words.filter(w => FILLER_WORDS.has(w)).length;
  const isNaturalLanguage = fillerCount >= 2 || words.length >= 5;

  // Detect brand
  let detectedBrand: string | null = null;
  let brandAlias = "";
  for (const [alias, brandName] of Object.entries(BRAND_ALIASES)) {
    if (lower.includes(alias)) {
      detectedBrand = brandName;
      brandAlias = alias;
      break;
    }
  }

  if (!isNaturalLanguage) {
    return { keyword: query.trim(), brand: detectedBrand, isNaturalLanguage: false };
  }

  // Remove filler words, keep meaningful terms
  const meaningful = words.filter(w => !FILLER_WORDS.has(w) && w.length >= 2);

  // Build keyword: start with brand, then add model-like words
  const keywordParts: string[] = [];
  if (detectedBrand) keywordParts.push(detectedBrand);

  for (const w of meaningful) {
    if (w === brandAlias || w === detectedBrand) continue;
    // Keep model-like words: numbers, mixed alphanumeric, known model terms
    const isModelWord = /\d/.test(w) || /^(note|pro|ultra|max|plus|lite|mini|prime|smart|spark|pop|hot|camon|phantom|reno|find|nova|y\d|a\d|f\d|x\d)/i.test(w);
    if (isModelWord && keywordParts.length < 4) keywordParts.push(w);
  }

  // If only brand found, just use brand
  const keyword = keywordParts.join(" ").trim() ||
    detectedBrand ||
    meaningful.slice(0, 2).join(" ") ||
    query.trim().split(" ").slice(0, 2).join(" ");

  return { keyword, brand: detectedBrand, isNaturalLanguage: true };
}

// ── Priceoye URL builder: try brand page first, then search ──────────────────
async function fetchPriceoyelistingsForQuery(keyword: string, brand: string | null): Promise<any[]> {
  // Strategy 1: brand-specific mobile listing page
  if (brand && BRANDS.includes(brand)) {
    const brandUrl = `${BASE_URL}/mobile-phones/${brand}/`;
    console.log(`[Scraper] AI strategy 1 — brand page: ${brandUrl}`);
    const brandHtml = await fetchPage(brandUrl);
    if (brandHtml) {
      const listings = parseProductsFromHtml(brandHtml);
      // If searching for a specific model within brand, filter by keyword words
      const modelWords = keyword.replace(brand, "").trim().split(/\s+/).filter(w => w.length >= 2);
      if (modelWords.length > 0) {
        const filtered = listings.filter(l =>
          modelWords.some(w => l.name.toLowerCase().includes(w))
        );
        if (filtered.length > 0) return filtered;
      }
      if (listings.length > 0) return listings;
    }
  }

  // Strategy 2: Priceoye search with clean keyword
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`;
  console.log(`[Scraper] AI strategy 2 — search: ${searchUrl}`);
  const html = await fetchPage(searchUrl);
  if (html) {
    const listings = parseProductsFromHtml(html);
    if (listings.length > 0) return listings;
  }

  // Strategy 3: mobiles filter page
  const mobileUrl = `${BASE_URL}/mobiles/?q=${encodeURIComponent(keyword)}`;
  console.log(`[Scraper] AI strategy 3 — mobile filter: ${mobileUrl}`);
  const mHtml = await fetchPage(mobileUrl);
  if (mHtml) return parseProductsFromHtml(mHtml);

  return [];
}

// ── Custom Scrape: Search Priceoye for a query, return listing-level preview ──
export async function previewCustomSearch(query: string): Promise<{
  success: boolean;
  results: Array<{ name: string; brand: string; slug: string; url: string; price: number; image: string }>;
  message: string;
  extractedKeyword: string;
  isNaturalLanguage: boolean;
}> {
  try {
    const { keyword, brand, isNaturalLanguage } = extractSearchKeywords(query);
    console.log(`[Scraper] Custom search preview: "${query}" → extracted: "${keyword}" (brand: ${brand || "none"})`);

    const listings = await fetchPriceoyelistingsForQuery(keyword, brand);
    const results = listings.slice(0, 20).map(l => ({
      name: l.name, brand: l.brand, slug: l.slug, url: l.url, price: l.price, image: l.image,
    }));
    return {
      success: true,
      results,
      extractedKeyword: keyword,
      isNaturalLanguage,
      message: results.length > 0
        ? `Found ${results.length} product${results.length !== 1 ? "s" : ""} for "${keyword}"`
        : `No products found for "${keyword}" on Priceoye`,
    };
  } catch (err: any) {
    return { success: false, results: [], message: err?.message || "Search failed", extractedKeyword: query, isNaturalLanguage: false };
  }
}

// ── Custom Scrape: Search Priceoye + fetch detail pages + save to DB ──────────
export async function scrapeCustomQuery(query: string, maxResults = 10): Promise<{
  success: boolean;
  found: number;
  scraped: number;
  newProducts: number;
  errors: number;
  results: Array<{ name: string; price: number; isNew: boolean; error?: string }>;
  message: string;
  extractedKeyword: string;
}> {
  const { keyword, brand, isNaturalLanguage } = extractSearchKeywords(query);
  console.log(`[Scraper] === CUSTOM SCRAPE: "${query}" → AI extracted: "${keyword}" (max ${maxResults}) ===`);

  try {
    const listings = await fetchPriceoyelistingsForQuery(keyword, brand);

    const limited = listings.slice(0, maxResults);
    const found = limited.length;

    if (found === 0) {
      return { success: true, found: 0, scraped: 0, newProducts: 0, errors: 0, results: [], message: `No products found for "${keyword}" on Priceoye`, extractedKeyword: keyword };
    }

    // Build existing map for price-change tracking
    const existingAll = await db.select({ id: scrapedProducts.id, price: scrapedProducts.price }).from(scrapedProducts);
    const existingMap = new Map(existingAll.map(p => [p.id, p.price]));

    let totalScraped = 0;
    let totalErrors = 0;
    const totalNewProducts = { value: 0 };
    const totalPriceUpdates = { value: 0 };
    const results: Array<{ name: string; price: number; isNew: boolean; error?: string }> = [];

    for (const listing of limited) {
      try {
        console.log(`[Scraper] Custom: fetching detail for ${listing.name}`);
        const detailHtml = await fetchPage(listing.url);
        if (!detailHtml) {
          results.push({ name: listing.name, price: listing.price, isNew: false, error: "Could not fetch detail page" });
          totalErrors++;
          continue;
        }

        const detail = parseProductDetailPage(detailHtml, listing.url, listing.slug);
        const prevNew = totalNewProducts.value;
        const saved = await saveListingToDb(listing, detail, existingMap, totalNewProducts, totalPriceUpdates);

        if (saved) {
          totalScraped++;
          results.push({ name: listing.name, price: listing.price, isNew: totalNewProducts.value > prevNew });
        } else {
          results.push({ name: listing.name, price: listing.price, isNew: false, error: "Skipped (OOS or save failed)" });
        }

        await delay(DELAY_MS);
      } catch (err: any) {
        results.push({ name: listing.name, price: listing.price, isNew: false, error: err?.message || "Unknown error" });
        totalErrors++;
      }
    }

    const message = `Custom scrape done: ${totalScraped}/${found} saved, ${totalNewProducts.value} new, ${totalErrors} errors`;
    console.log(`[Scraper] ${message}`);
    return { success: true, found, scraped: totalScraped, newProducts: totalNewProducts.value, errors: totalErrors, results, message, extractedKeyword: keyword };
  } catch (err: any) {
    return { success: false, found: 0, scraped: 0, newProducts: 0, errors: 1, results: [], message: err?.message || "Custom scrape failed", extractedKeyword: query };
  }
}
