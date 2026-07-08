// Cached Sake Company catalog — the source for the product picker. Server-only.
// The supplier catalog changes slowly, so we cache it; stock numbers refresh on
// the revalidate interval (or when the "sake-catalog" tag is revalidated).
import "server-only";
import { unstable_cache } from "next/cache";
import { sakeCompanyConfig } from "@/lib/integrations/config";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { listCatalog, type ScCatalogItem } from "./admin-client";
import { getProductCosts } from "@/lib/integrations/airtable/prices";
import scB2bPrices from "./sc-b2b-prices.json";

export const SAKE_CATALOG_TAG = "sake-catalog";

// Last-known-good snapshot (settings_kv) — served when the live crawl fails or
// is too slow (getSakeCatalogSafe). Written fire-and-forget after every
// successful crawl, so tasting/stock data never silently disappears from the
// public educator page just because Shopify had a bad minute.
const SNAPSHOT_KEY = "sake_catalog_snapshot";

function persistSnapshot(items: ScCatalogItem[]): void {
  if (items.length === 0) return; // never overwrite a good snapshot with nothing
  const svc = getSupabaseServiceClient();
  void svc
    .from("settings_kv")
    .upsert({ key: SNAPSHOT_KEY, value: { items, at: new Date().toISOString() } }, { onConflict: "key" })
    .then(() => {}, () => {});
}

async function readSnapshot(): Promise<ScCatalogItem[]> {
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc.from("settings_kv").select("value").eq("key", SNAPSHOT_KEY).maybeSingle();
    return ((data?.value as { items?: ScCatalogItem[] })?.items ?? []) as ScCatalogItem[];
  } catch {
    return [];
  }
}

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
    // Load the Shopify catalog first. The Airtable cost/type merge is only an
    // ENHANCEMENT — if it fails (token/permissions/model), still return the
    // products, otherwise the whole product picker goes empty.
    //
    // A TOTAL listCatalog failure THROWS on purpose: unstable_cache does not
    // store thrown errors, so one bad crawl no longer poisons 10 minutes of
    // traffic with an empty catalog ("dati degustazione mancanti"). Callers
    // either .catch() or go through getSakeCatalogSafe (snapshot fallback).
    const items = await listCatalog();
    let costs: Awaited<ReturnType<typeof getProductCosts>> = new Map();
    try {
      costs = await getProductCosts();
    } catch {
      /* Airtable cost merge unavailable → return Shopify products as-is */
    }
    // Cost priority: SC B2B price (column W) → Airtable cost → Sake Company
    // Shopify list price (so nothing real shows 0 €). Type comes from Airtable.
    const merged = items.map((i) => {
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
    // Refresh the last-known-good snapshot (fire-and-forget; never blocks).
    persistSnapshot(merged);
    return merged;
  },
  // v11: ScCatalogItem gained region/abv/pairing (from metafields + body_html)
  // — bump so a stale-shaped cached entry never serves without them
  // (AGENTS.md convention).
  ["sake-catalog-v11"],
  { revalidate: 600, tags: [SAKE_CATALOG_TAG] },
);

/** How long a page is willing to wait for the LIVE catalog before serving the
 *  last-known-good snapshot instead. A cache HIT resolves in milliseconds; a
 *  cold-cache crawl of the whole SC store takes MINUTES (throttled Shopify
 *  REST) and must never block a public page for that long. */
const CATALOG_TIMEBOX_MS = 4000;

/** Catalog for LATENCY-SENSITIVE public pages (educator share link): the live
 *  cached catalog, time-boxed. On timeout or failure it serves the last
 *  successful snapshot from settings_kv (the crawl keeps running in the
 *  background to warm the cache for the next request). Never throws. */
export async function getSakeCatalogSafe(): Promise<ScCatalogItem[]> {
  const live = getSakeCatalog();
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), CATALOG_TIMEBOX_MS),
  );
  try {
    const winner = await Promise.race([live, timeout]);
    if (winner !== "timeout") return winner;
    // Too slow (cold crawl in progress) → snapshot now, cache warms behind.
    live.catch(() => {}); // don't let the loser become an unhandled rejection
    console.warn("[sake-catalog] live catalog slow — serving last-known-good snapshot");
    return await readSnapshot();
  } catch {
    console.warn("[sake-catalog] live catalog failed — serving last-known-good snapshot");
    return readSnapshot();
  }
}
