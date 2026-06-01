// Live Shopify Admin API client (REST 2025-01). Server-only.
//
// Thin fetch wrapper with cursor pagination (Link header). Used by the sync
// module to pull products (course tickets) and orders (purchases/enrollments).
// Reads credentials from shopifyConfig; throws if not configured so a misuse
// fails loudly rather than silently returning empty data.
import "server-only";
import { shopifyConfig } from "../config";

const API_VERSION = "2025-01";

export interface AdminProductVariant {
  price: string | null;
  inventory_quantity: number | null;
}
export interface AdminProduct {
  id: number;
  title: string;
  product_type: string | null;
  status: "active" | "draft" | "archived";
  tags: string;
  variants: AdminProductVariant[];
}
export interface AdminLineItem {
  id: number | null;
  product_id: number | null;
  title: string;
  price: string | null;
  quantity: number | null;
}
export interface AdminDiscountCode {
  code: string;
  amount: string;
  type: string;
}
export interface AdminAddress {
  phone?: string | null;
  city?: string | null;
}
export interface AdminCustomer {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  default_address?: AdminAddress | null;
}
export interface AdminOrder {
  id: number;
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  financial_status: string | null;
  cancelled_at: string | null;
  discount_codes: AdminDiscountCode[] | null;
  customer: AdminCustomer | null;
  line_items: AdminLineItem[];
}

function baseUrl(): string {
  const domain = shopifyConfig.storeDomain;
  const token = shopifyConfig.adminToken;
  if (!domain || !token) {
    throw new Error(
      "Shopify is not configured (set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN).",
    );
  }
  return `https://${domain}/admin/api/${API_VERSION}`;
}

/** Extract the `page_info` cursor of the rel="next" link, if any. */
function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(
    /<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/,
  );
  return m ? m[1] : null;
}

async function adminGet(
  path: string,
): Promise<{ body: unknown; link: string | null }> {
  const res = await fetch(`${baseUrl()}/${path}`, {
    headers: { "X-Shopify-Access-Token": shopifyConfig.adminToken as string },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${res.status}: ${text.slice(0, 200)}`);
  }
  return { body: await res.json(), link: res.headers.get("Link") };
}

/** All products (paginated). Only `limit` may accompany `page_info`. */
export async function listAllProducts(): Promise<AdminProduct[]> {
  const out: AdminProduct[] = [];
  const fields = "id,title,product_type,status,tags,variants";
  let path: string | null = `products.json?limit=250&fields=${fields}`;
  while (path) {
    const { body, link } = await adminGet(path);
    const page = (body as { products?: AdminProduct[] }).products ?? [];
    out.push(...page);
    const cursor = nextPageInfo(link);
    path = cursor ? `products.json?limit=250&page_info=${cursor}` : null;
  }
  return out;
}

/**
 * Orders updated since `sinceIso` (ISO timestamp). When omitted, pulls the
 * full order history. Cursor pages may only carry `limit` + `page_info`, so the
 * `updated_at_min` filter is applied on the first request only — Shopify keeps
 * the filter bound to the cursor for subsequent pages.
 */
export async function listOrdersUpdatedSince(
  sinceIso?: string,
): Promise<AdminOrder[]> {
  const out: AdminOrder[] = [];
  const fields =
    "id,name,email,created_at,updated_at,customer,line_items,financial_status,cancelled_at,discount_codes";
  const since = sinceIso ? `&updated_at_min=${encodeURIComponent(sinceIso)}` : "";
  let path: string | null = `orders.json?status=any&limit=250&fields=${fields}${since}`;
  while (path) {
    const { body, link } = await adminGet(path);
    const page = (body as { orders?: AdminOrder[] }).orders ?? [];
    out.push(...page);
    const cursor = nextPageInfo(link);
    path = cursor ? `orders.json?limit=250&page_info=${cursor}` : null;
  }
  return out;
}
