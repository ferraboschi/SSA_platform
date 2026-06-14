// Product costs from the Airtable "Master product list" base. Server-only.
// Keyed by CODE (= the Sake Company SKU), so costs can be merged into the
// catalog and flow into course economics. Uses the same Airtable token as the
// exam base (granted access to this 2nd base).
import "server-only";
import { unstable_cache } from "next/cache";
import { airtableConfig } from "@/lib/integrations/config";

const TABLE = "tblilRsJLHIVJ1xju"; // "Master product list"
const F_CODE = "CODE";
// The COST SSA pays for a bottle = the all-in landed "TOTAL COST IN ITALY"
// (populated on every product), as chosen by the SSA owner.
const F_TOTAL_COST = "TOTAL COST IN ITALY";
const F_TYPE = "Product Type";

export interface ProductCost {
  cost: number | null; // euros; null when Airtable has no price for the SKU
  type: string | null;
}

// The "Master product list" base id. Falls back to the known value when the env
// var isn't configured on the host (it was missing on Render, which silently
// emptied every sake cost/type in the template). A base id is an identifier, not
// a secret — access is still gated by AIRTABLE_API_KEY.
const PRICES_BASE_FALLBACK = "appwCWGRd0jXOCxMA";
function baseId(): string | undefined {
  return process.env.AIRTABLE_PRICES_BASE_ID || PRICES_BASE_FALLBACK;
}

interface AtRecord {
  fields: Record<string, unknown>;
}

async function fetchAll(): Promise<Map<string, ProductCost>> {
  const token = airtableConfig.apiKey;
  const base = baseId();
  const out = new Map<string, ProductCost>();
  if (!token || !base) return out;

  const fieldsParam = [F_CODE, F_TOTAL_COST, F_TYPE]
    .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`)
    .join("&");
  let offset: string | undefined;
  do {
    const apiBase = process.env.AIRTABLE_API_URL || "https://api.airtable.com/v0";
    const url =
      `${apiBase}/${base}/${TABLE}?pageSize=100&${fieldsParam}` +
      (offset ? `&offset=${offset}` : "");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) break;
    const body = (await res.json()) as { records?: AtRecord[]; offset?: string };
    for (const r of body.records ?? []) {
      const code = String(r.fields[F_CODE] ?? "").trim();
      if (!code) continue;
      const totalCost = r.fields[F_TOTAL_COST];
      const cost =
        typeof totalCost === "number" && totalCost > 0
          ? Math.round(totalCost * 100) / 100
          : null;
      const type = (r.fields[F_TYPE] as string | undefined) ?? null;
      out.set(code, { cost, type });
    }
    offset = body.offset;
  } while (offset);
  return out;
}

/** Cached map: SKU/CODE → { cost (euros), type }. */
export const getProductCosts = unstable_cache(fetchAll, ["product-costs-v4"], {
  revalidate: 600,
  tags: ["product-costs"],
});
