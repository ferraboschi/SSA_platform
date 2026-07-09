// Live Shopify Admin API client (REST 2025-01). Server-only.
//
// Thin fetch wrapper with cursor pagination (Link header). Used by the sync
// module to pull products (course tickets) and orders (purchases/enrollments).
// Reads credentials from shopifyConfig; throws if not configured so a misuse
// fails loudly rather than silently returning empty data.
import "server-only";
import { shopifyConfig } from "../config";

const API_VERSION = "2026-01"; // bumped: 2025-01 is past Shopify's support window (Jun 2026)

export interface AdminProductVariant {
  price: string | null;
  inventory_quantity: number | null;
}
export interface AdminProduct {
  id: number;
  title: string;
  // Real Shopify storefront handle (public product slug) — the enrol URL is
  // <storefrontBase>/products/<handle>. Not the app's re-slugged `corsi.handle`.
  handle: string;
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

// Shopify REST throttles to 2 calls/second per app+store (burst bucket of 40).
// A full sync makes hundreds of calls (per-product metafields!), so unpaced
// bursts die on 429 — which killed whole sync runs and silently emptied the
// catch-all metafield reads. All Shopify calls therefore go through one paced,
// 429-retrying fetch: calls are spaced MIN_GAP_MS apart process-wide, and a
// 429 waits out Retry-After before trying again.
const MIN_GAP_MS = 550;
const MAX_RETRIES_429 = 5;
const MAX_RETRIES_5XX = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastCallAt = 0;
let paceQueue: Promise<void> = Promise.resolve();

async function shopifyFetch(url: string, init?: RequestInit): Promise<Response> {
  // Take a pacing turn: fetch starts are serialized ≥ MIN_GAP_MS apart, shared
  // by every caller in the process (sync, scheduler, actions).
  const turn = paceQueue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  paceQueue = turn.catch(() => {});
  await turn;

  let attempt429 = 0;
  let attempt5xx = 0;
  for (;;) {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (res.status === 429 && attempt429 < MAX_RETRIES_429) {
      attempt429++;
      const retryAfter = Number(res.headers.get("Retry-After"));
      const delay =
        Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, 1500) +
        attempt429 * 500;
      await sleep(delay);
      lastCallAt = Date.now();
      continue;
    }
    if (res.status >= 500 && attempt5xx < MAX_RETRIES_5XX) {
      attempt5xx++;
      await sleep(1000 * attempt5xx);
      lastCallAt = Date.now();
      continue;
    }
    return res;
  }
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
  const res = await shopifyFetch(`${baseUrl()}/${path}`, {
    headers: { "X-Shopify-Access-Token": shopifyConfig.adminToken as string },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${res.status}: ${text.slice(0, 200)}`);
  }
  return { body: await res.json(), link: res.headers.get("Link") };
}

/** Granted API scopes for the current admin token — read-only diagnostic.
 *  Uses the UNVERSIONED /admin/oauth/access_scopes.json endpoint (definitive list
 *  of what the token can do). Needed to confirm `write_discounts` before wiring
 *  auto-created credit discount codes. Never mutates anything. */
export async function getGrantedScopes(): Promise<string[]> {
  const domain = shopifyConfig.storeDomain;
  const token = shopifyConfig.adminToken;
  if (!domain || !token) throw new Error("Shopify not configured");
  const res = await shopifyFetch(`https://${domain}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`Shopify access_scopes ${res.status}`);
  const body = (await res.json()) as { access_scopes?: { handle: string }[] };
  return (body.access_scopes ?? []).map((s) => s.handle);
}

/**
 * Minimal GraphQL Admin API client. Server-only; uses the SAME admin token as
 * the REST helpers. POSTs to `${baseUrl()}/graphql.json`. Throws on transport
 * failure (!res.ok) and on any GraphQL-level `errors` (so callers can catch and
 * degrade). Returns the `data` payload.
 */
export async function shopifyGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const res = await shopifyFetch(`${baseUrl()}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": shopifyConfig.adminToken as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };
  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `Shopify GraphQL errors: ${json.errors.map((e) => e.message ?? "unknown").join("; ")}`,
    );
  }
  return json.data;
}

/** A discount created via `createBasicCodeDiscount`. */
export interface CreatedDiscount {
  id: string;
  code: string;
}

/**
 * Create a one-time, fixed-amount discount code in Shopify (requires the
 * `write_discounts` scope — the caller must confirm capability first, e.g. via
 * `getGrantedScopes`). Amount is euros; Shopify expects a decimal string.
 * Throws on GraphQL/userErrors so the caller can keep the local code and degrade.
 */
export async function createBasicCodeDiscount(opts: {
  code: string;
  amountEuros: number;
  title: string;
  usageLimit?: number;
  startsAt?: string;
}): Promise<CreatedDiscount> {
  const mutation = `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) { codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { title codes(first:1){ nodes { code } } } } } userErrors { field message } } }`;

  const variables = {
    basicCodeDiscount: {
      title: opts.title,
      code: opts.code,
      customerSelection: { all: true },
      customerGets: {
        value: {
          discountAmount: {
            // Euros, 2 decimals, as a STRING (Shopify Money / Decimal scalar).
            amount: opts.amountEuros.toFixed(2),
            appliesOnEachItem: false,
          },
        },
        items: { all: true },
      },
      usageLimit: opts.usageLimit ?? 1,
      appliesOncePerCustomer: true,
      startsAt: opts.startsAt ?? new Date().toISOString(),
    },
  };

  const data = (await shopifyGraphql(mutation, variables)) as {
    discountCodeBasicCreate?: {
      codeDiscountNode?: { id?: string } | null;
      userErrors?: Array<{ field?: string[] | null; message?: string }>;
    };
  };
  const result = data.discountCodeBasicCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message ?? "unknown").join("; "));
  }
  const id = result?.codeDiscountNode?.id;
  if (!id) throw new Error("Shopify discountCodeBasicCreate returned no node id");
  return { id, code: opts.code };
}

/** All products (paginated). Only `limit` may accompany `page_info`. */
export async function listAllProducts(): Promise<AdminProduct[]> {
  const out: AdminProduct[] = [];
  const fields = "id,title,handle,product_type,status,tags,variants";
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
 * All `custom.*` metafields of a product as a flat { key: value } map. SSA stores
 * the course's real metadata here — `tipologia_di_corso`, `luogo_e_orari`
 * (event date), `termine_iscrizioni` (deadline, carries the year), `luogo`,
 * `sake_educator` — which is the source of truth for products (e.g. masterclasses)
 * whose title doesn't encode a month/year.
 */
export async function getProductCustomMetafields(
  productId: number | string,
): Promise<Record<string, string>> {
  try {
    const { body } = await adminGet(`products/${productId}/metafields.json`);
    const mfs =
      (body as { metafields?: Array<{ namespace: string; key: string; value: string }> })
        .metafields ?? [];
    const out: Record<string, string> = {};
    for (const m of mfs) {
      if (m.namespace === "custom" && m.key && typeof m.value === "string") {
        out[m.key] = m.value;
      }
    }
    return out;
  } catch {
    return {};
  }
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
