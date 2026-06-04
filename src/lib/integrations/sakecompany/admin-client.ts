// Live Sake Company (supplier) Shopify Admin client. Server-only.
//
// Read-only: collections (exam / kit groupings), the products inside a
// collection, and per-variant stock (for low-stock thresholds). Credentials
// from sakeCompanyConfig (permanent offline OAuth token).
import "server-only";
import { sakeCompanyConfig } from "@/lib/integrations/config";

const API_VERSION = "2026-01"; // bumped: 2025-01 is past Shopify's support window (Jun 2026)

export interface ScCollection {
  id: number;
  title: string;
  handle: string;
  kind: "custom" | "smart";
}
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

/** All collections (custom + smart), sorted by title. */
export async function listCollections(): Promise<ScCollection[]> {
  const out: ScCollection[] = [];
  for (const kind of ["custom", "smart"] as const) {
    const resource = kind === "custom" ? "custom_collections" : "smart_collections";
    let path: string | null = `${resource}.json?limit=250&fields=id,title,handle`;
    while (path) {
      const { body, link } = await scGet(path);
      const page =
        (body as Record<string, Array<{ id: number; title: string; handle: string }>>)[
          resource
        ] ?? [];
      for (const c of page) out.push({ ...c, kind });
      const cursor = nextPageInfo(link);
      path = cursor ? `${resource}.json?limit=250&page_info=${cursor}` : null;
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Products inside a collection (works for custom + smart), with stock. */
export async function productsInCollection(collectionId: number): Promise<ScProduct[]> {
  const out: ScProduct[] = [];
  const fields = "id,title,product_type,vendor,tags,status,image,variants";
  let path: string | null = `products.json?collection_id=${collectionId}&limit=250&fields=${fields}`;
  while (path) {
    const { body, link } = await scGet(path);
    const page = (body as { products?: ScProduct[] }).products ?? [];
    out.push(...page);
    const cursor = nextPageInfo(link);
    path = cursor ? `products.json?limit=250&page_info=${cursor}` : null;
  }
  return out;
}

/** Total product count (for connection health checks). */
export async function productCount(): Promise<number> {
  const { body } = await scGet("products/count.json");
  return (body as { count: number }).count;
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
}

/** Full pickable catalog (all active products, flattened to variants). */
export async function listCatalog(): Promise<ScCatalogItem[]> {
  const domain = sakeCompanyConfig.storeDomain;
  const out: ScCatalogItem[] = [];
  const fields = "id,handle,title,vendor,status,image,variants";
  let path: string | null = `products.json?limit=250&status=active&fields=${fields}`;
  while (path) {
    const { body, link } = await scGet(path);
    const page = (body as { products?: (ScProduct & { handle: string })[] }).products ?? [];
    for (const p of page) {
      const single = p.variants.length <= 1;
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
        });
      }
    }
    const cursor = nextPageInfo(link);
    path = cursor ? `products.json?limit=250&page_info=${cursor}` : null;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
