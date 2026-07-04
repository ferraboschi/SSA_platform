// Live Sake Company (supplier) Shopify Admin client. Server-only.
//
// Read-only: the full product catalog with per-variant stock (for low-stock
// thresholds). Credentials from sakeCompanyConfig (permanent offline OAuth
// token).
import "server-only";
import { sakeCompanyConfig } from "@/lib/integrations/config";
import { extractProductFacts, type RawMetafield } from "./product-notes";

const API_VERSION = "2026-01"; // bumped: 2025-01 is past Shopify's support window (Jun 2026)

export interface ScVariant {
  id: number;
  title: string;
  price: string | null;
  sku: string | null;
  inventory_quantity: number | null;
}
export interface ScProduct {
  id: number;
  title: string;
  product_type: string | null;
  vendor: string | null;
  tags: string;
  status: string;
  image: { src: string } | null;
  variants: ScVariant[];
  body_html?: string | null;
}

function base(): string {
  const domain = sakeCompanyConfig.storeDomain;
  const token = sakeCompanyConfig.adminToken;
  if (!domain || !token) {
    throw new Error(
      "Sake Company non configurato (SAKECOMPANY_STORE_DOMAIN / SAKECOMPANY_ADMIN_TOKEN).",
    );
  }
  return `https://${domain}/admin/api/${API_VERSION}`;
}

function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shopify's REST products endpoint is intermittently flaky for this store: it
// sometimes returns HTTP 200 with an `{ errors }` body (or 429/5xx) instead of
// the products. Retry a few times so a transient failure doesn't yield an empty
// catalog (which then gets cached for 10 minutes).
async function scGet(
  path: string,
  attempt = 0,
): Promise<{ body: unknown; link: string | null }> {
  const res = await fetch(`${base()}/${path}`, {
    headers: { "X-Shopify-Access-Token": sakeCompanyConfig.adminToken as string },
    cache: "no-store",
  });
  if (!res.ok) {
    // This store's REST products endpoint flaps between 200 and a transient 404
    // (Shopify throttling), so retry 404 here too — the endpoint works ~1/3 of
    // the time, so several attempts make it reliable.
    if ((res.status === 429 || res.status === 404 || res.status >= 500) && attempt < 7) {
      await sleep(Math.min(300 * (attempt + 1), 1500));
      return scGet(path, attempt + 1);
    }
    throw new Error(`Sake Company ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  // A 200 with an `errors` body is a transient API hiccup, not real data.
  if (body && typeof body === "object" && "errors" in (body as Record<string, unknown>)) {
    if (attempt < 5) {
      await sleep(400 * (attempt + 1));
      return scGet(path, attempt + 1);
    }
    throw new Error(
      `Sake Company error body: ${JSON.stringify((body as { errors: unknown }).errors).slice(0, 200)}`,
    );
  }
  return { body, link: res.headers.get("Link") };
}

/** Every metafield on one product (aroma/region/ABV/pairing live here for the
 *  current "hoculus" schema — verified live: ~3 in 4 active products).
 *  Best-effort: a failure degrades to no metafields, never breaks the
 *  catalog over one product's data. */
async function fetchMetafields(productId: number): Promise<RawMetafield[]> {
  try {
    const { body } = await scGet(`products/${productId}/metafields.json?limit=250`);
    return (body as { metafields?: RawMetafield[] }).metafields ?? [];
  } catch {
    return [];
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once — metafields
 *  are one extra request PER PRODUCT, so an unbounded Promise.all across the
 *  whole catalog would open hundreds of connections at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** A pickable catalog item — one per variant (the unit with its own SKU/stock). */
export interface ScCatalogItem {
  productId: number;
  variantId: number;
  /** Display name: product + variant (size) when relevant. */
  name: string;
  productTitle: string;
  variantTitle: string | null;
  vendor: string | null;
  sku: string | null;
  stock: number | null;
  image: string | null;
  /** Public product URL on the Sake Company store. */
  url: string;
  handle: string;
  /** Cost in euros (from the Airtable "Master product list", merged by SKU). */
  cost?: number;
  /** Sake Company store list price (€) for this variant — used as the cost
   *  fallback when the product isn't in the Airtable cost list (e.g. beers). */
  price?: number;
  /** Product type from Airtable (e.g. "Junmai Ginjo"), merged by SKU. */
  productType?: string | null;
  /** Short aroma/tasting hook, extracted from the Shopify product description
   *  (owner: show it to the educator on the Programma tab). */
  aroma?: string | null;
  /** Longer narrative commentary (production, character), same source. */
  notes?: string | null;
  region?: string | null;
  /** Alcohol by volume, as the store's own label (e.g. "15.5%"). */
  abv?: string | null;
  /** Suggested food pairing, comma-joined when the source lists several. */
  pairing?: string | null;
}

/** Metafield fetches run at this many products in flight — bounded so a
 *  273-product catalog (verified live count) doesn't open hundreds of
 *  connections at once, while still finishing in a reasonable time behind
 *  the 10-minute cache (see catalog.ts). */
const METAFIELDS_CONCURRENCY = 6;

/** Full pickable catalog (all active products, flattened to variants). */
export async function listCatalog(): Promise<ScCatalogItem[]> {
  const domain = sakeCompanyConfig.storeDomain;
  const out: ScCatalogItem[] = [];
  // body_html carries the LEGACY aroma hook + narrative + <h6> fact block
  // (parseProductNotes / extractProductFacts) — same request, no extra
  // round-trip. The CURRENT schema lives in metafields instead (fetched
  // per product below — Sake Company's own data is split across two eras).
  const fields = "id,handle,title,vendor,status,image,variants,body_html";
  let path: string | null = `products.json?limit=250&status=active&fields=${fields}`;
  while (path) {
    const { body, link } = await scGet(path);
    const page = (body as { products?: (ScProduct & { handle: string })[] }).products ?? [];
    const metafieldsByProduct = await mapWithConcurrency(page, METAFIELDS_CONCURRENCY, (p) =>
      fetchMetafields(p.id),
    );
    page.forEach((p, i) => {
      const single = p.variants.length <= 1;
      const { aroma, notes, region, abv, pairing } = extractProductFacts(p.body_html, metafieldsByProduct[i]);
      for (const v of p.variants) {
        const variantTitle =
          v.title && v.title !== "Default Title" ? v.title : null;
        const priceNum = v.price != null && v.price !== "" ? Number(v.price) : undefined;
        out.push({
          productId: p.id,
          variantId: v.id,
          name: single || !variantTitle ? p.title : `${p.title} · ${variantTitle}`,
          productTitle: p.title,
          variantTitle,
          vendor: p.vendor,
          sku: v.sku,
          stock: v.inventory_quantity,
          image: p.image?.src ?? null,
          url: `https://${domain}/products/${p.handle}`,
          handle: p.handle,
          price: priceNum != null && Number.isFinite(priceNum) ? priceNum : undefined,
          aroma,
          notes,
          region,
          abv,
          pairing,
        });
      }
    });
    const cursor = nextPageInfo(link);
    path = cursor ? `products.json?limit=250&page_info=${cursor}` : null;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
