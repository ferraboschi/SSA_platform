// Cached Sake Company catalog — the source for the product picker. Server-only.
// The supplier catalog changes slowly, so we cache it; stock numbers refresh on
// the revalidate interval (or when the "sake-catalog" tag is revalidated).
import "server-only";
import { unstable_cache } from "next/cache";
import { sakeCompanyConfig } from "@/lib/integrations/config";
import { listCatalog, type ScCatalogItem } from "./admin-client";
import { getProductCosts } from "@/lib/integrations/airtable/prices";

export const SAKE_CATALOG_TAG = "sake-catalog";

export const getSakeCatalog = unstable_cache(
  async (): Promise<ScCatalogItem[]> => {
    if (!sakeCompanyConfig.isConfigured) return [];
    try {
      // Load the Shopify catalog first. The Airtable cost/type merge is only an
      // ENHANCEMENT — if it fails (token/permissions/model), still return the
      // products, otherwise the whole product picker goes empty.
      const items = await listCatalog();
      let costs: Awaited<ReturnType<typeof getProductCosts>> = new Map();
      try {
        costs = await getProductCosts();
      } catch {
        /* Airtable cost merge unavailable → return Shopify products as-is */
      }
      // Merge cost + type from the Airtable "Master product list" by SKU.
      return items.map((i) => {
        const sku = i.sku ?? undefined;
        let c = sku ? costs.get(sku) : undefined;
        // Carton/variant suffixes (e.g. "S075-1800-C06") aren't in the master
        // list — fall back to the base SKU ("S075-1800") so they still price.
        if (!c && sku) {
          const baseSku = sku.replace(/-C\d+$/i, "");
          if (baseSku !== sku) c = costs.get(baseSku);
        }
        if (!c) return i;
        // Attach the type always; only override cost when Airtable has a price
        // (a missing/null price must not clobber any stored supplier cost).
        return c.cost != null
          ? { ...i, cost: c.cost, productType: c.type }
          : { ...i, productType: c.type };
      });
    } catch {
      return [];
    }
  },
  ["sake-catalog-v5"],
  { revalidate: 600, tags: [SAKE_CATALOG_TAG] },
);
