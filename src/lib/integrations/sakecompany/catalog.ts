// Cached Sake Company catalog — the source for the product picker. Server-only.
// The supplier catalog changes slowly, so we cache it; stock numbers refresh on
// the revalidate interval (or when the "sake-catalog" tag is revalidated).
import "server-only";
import { unstable_cache } from "next/cache";
import { sakeCompanyConfig } from "@/lib/integrations/config";
import { listCatalog, type ScCatalogItem } from "./admin-client";
import { getProductCosts } from "@/lib/integrations/airtable/prices";
import scB2bPrices from "./sc-b2b-prices.json";

export const SAKE_CATALOG_TAG = "sake-catalog";

// PRIMARY cost source: the SC "B2B Price no VAT" (column W of MASTER PRODUCT
// PRICING.xlsx), keyed by SKU. Committed snapshot — re-run the import script when
// the spreadsheet changes. Falls back to Airtable / Shopify price below.
const B2B_PRICES: Record<string, number> = scB2bPrices as Record<string, number>;
function b2bPrice(sku: string | undefined): number | undefined {
  if (!sku) return undefined;
  return B2B_PRICES[sku] ?? B2B_PRICES[sku.replace(/-C\d+$/i, "")];
}

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
      // Cost priority: SC B2B price (column W) → Airtable cost → Sake Company
      // Shopify list price (so nothing real shows 0 €). Type comes from Airtable.
      return items.map((i) => {
        const sku = i.sku ?? undefined;
        let c = sku ? costs.get(sku) : undefined;
        // Carton/variant suffixes (e.g. "S075-1800-C06") aren't in the master
        // list — fall back to the base SKU ("S075-1800") so they still price.
        if (!c && sku) {
          const baseSku = sku.replace(/-C\d+$/i, "");
          if (baseSku !== sku) c = costs.get(baseSku);
        }
        const w = b2bPrice(sku);
        const cost = w != null ? w : c?.cost != null ? c.cost : i.price;
        const productType = c?.type ?? i.productType;
        if (cost == null && productType == null) return i;
        return { ...i, ...(cost != null ? { cost } : {}), productType };
      });
    } catch {
      return [];
    }
  },
  // v10: ScCatalogItem gained aroma/notes (parsed from body_html) — bump so a
  // stale-shaped cached entry never serves without them (AGENTS.md convention).
  ["sake-catalog-v10"],
  { revalidate: 600, tags: [SAKE_CATALOG_TAG] },
);
