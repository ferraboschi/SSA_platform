// Live Sake Company (supplier) Shopify Admin client. Server-only.
//
// Read-only: collections (exam / kit groupings), the products inside a
// collection, and per-variant stock (for low-stock thresholds). Credentials
// from sakeCompanyConfig (permanent offline OAuth token).
import "server-only";
import { sakeCompanyConfig } from "@/lib/integrations/config";

const API_VERSION = "2025-01";

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

async function scGet(path: string): Promise<{ body: unknown; link: string | null }> {
  const res = await fetch(`${base()}/${path}`, {
    headers: { "X-Shopify-Access-Token": sakeCompanyConfig.adminToken as string },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Sake Company ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { body: await res.json(), link: res.headers.get("Link") };
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
