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
      const [items, costs] = await Promise.all([listCatalog(), getProductCosts()]);
      // Merge cost + type from the Airtable "Master product list" by SKU.
      return items.map((i) => {
        const c = i.sku ? costs.get(i.sku) : undefined;
        return c ? { ...i, cost: c.cost, productType: c.type } : i;
      });
    } catch {
      return [];
    }
  },
  ["sake-catalog-v2"],
  { revalidate: 600, tags: [SAKE_CATALOG_TAG] },
);
