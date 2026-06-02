// Product costs from the Airtable "Master product list" base. Server-only.
// Keyed by CODE (= the Sake Company SKU), so costs can be merged into the
// catalog and flow into course economics. Uses the same Airtable token as the
// exam base (granted access to this 2nd base).
import "server-only";
import { unstable_cache } from "next/cache";
import { airtableConfig } from "@/lib/integrations/config";

const TABLE = "tblilRsJLHIVJ1xju"; // "Master product list"
const F_CODE = "CODE";
const F_COST = "SC Network price from ITA stock";
const F_TYPE = "Product Type";

export interface ProductCost {
  cost: number; // euros
  type: string | null;
}

function baseId(): string | undefined {
  return process.env.AIRTABLE_PRICES_BASE_ID;
}

interface AtRecord {
  fields: Record<string, unknown>;
}

async function fetchAll(): Promise<Map<string, ProductCost>> {
  const token = airtableConfig.apiKey;
  const base = baseId();
  const out = new Map<string, ProductCost>();
  if (!token || !base) return out;

  const fieldsParam = [F_CODE, F_COST, F_TYPE]
    .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`)
    .join("&");
  let offset: string | undefined;
  do {
    const url =
      `https://api.airtable.com/v0/${base}/${TABLE}?pageSize=100&${fieldsParam}` +
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
      const rawCost = r.fields[F_COST];
      const cost = typeof rawCost === "number" ? Math.round(rawCost * 100) / 100 : 0;
      const type = (r.fields[F_TYPE] as string | undefined) ?? null;
      out.set(code, { cost, type });
    }
    offset = body.offset;
  } while (offset);
  return out;
}

/** Cached map: SKU/CODE → { cost (euros), type }. */
export const getProductCosts = unstable_cache(fetchAll, ["product-costs-v1"], {
  revalidate: 600,
  tags: ["product-costs"],
});
