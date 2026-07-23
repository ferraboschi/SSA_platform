// Shopify admin deep-links. The store slug is account-specific, so it's
// env-configurable (NEXT_PUBLIC so it works in both server and client
// components); falls back to the SSA store when unset.

const STORE_SLUG = process.env.NEXT_PUBLIC_SHOPIFY_STORE_SLUG || "sakesommelierassociation";

/** Admin "Products" page, optionally pre-filtered by a search query. */
export function shopifyAdminProductsUrl(query?: string): string {
  const base = `https://admin.shopify.com/store/${STORE_SLUG}/products`;
  return query ? `${base}?query=${encodeURIComponent(query)}` : base;
}

/** Admin "Orders" page, optionally pre-filtered (e.g. by an order name/number)
 *  so staff can open the exact order to issue a refund. */
export function shopifyAdminOrdersUrl(query?: string): string {
  const base = `https://admin.shopify.com/store/${STORE_SLUG}/orders`;
  return query ? `${base}?query=${encodeURIComponent(query)}` : base;
}
