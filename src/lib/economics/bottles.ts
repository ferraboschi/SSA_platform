// Bottle logistics — single source of truth for the pour-volume rule and the
// live bottle-cost rollup. Shared by the course economics section
// (ProgrammaEconomiaSection), the material-template editor and the sake
// exports.
//
// The rule is VOLUME-based (owner, batch 7): every student gets ~48ml of each
// sake (720ml serves 15 people), so the bottles needed depend on the bottle
// FORMAT: 15 people → 720ml: 1, 500ml: 2, 300ml: 3 — always rounded UP.
// When the format is unknown we assume 720ml, which reproduces the historical
// "one bottle per 15 students" behaviour exactly.
//
// Pure leaf module: imports nothing, so it is safe to use anywhere and testable
// in isolation.

export const ML_PER_PERSON = 48;
export const DEFAULT_BOTTLE_ML = 720;

export interface BottleSake {
  code?: string | null;
  name?: string | null;
  cost: number;
}

export interface BottleDay {
  sakes: BottleSake[];
}

/** Bottle format in ml, when stated. The Sake Company SKU encodes it in the
 *  numeric suffix ("S075-0720" → 720ml, "SR01-0500" → 500ml); product names
 *  usually carry it too ("Akita Kaori 720ml"). Returns null when unknown. */
export function parseVolumeMl(name?: string | null, sku?: string | null): number | null {
  const fromSku = sku?.match(/-0*(\d{3,4})$/);
  if (fromSku) {
    const v = Number(fromSku[1]);
    if (v >= 100 && v <= 5000) return v;
  }
  const fromName = name?.match(/(\d{3,4})\s*ml\b/i);
  if (fromName) {
    const v = Number(fromName[1]);
    if (v >= 100 && v <= 5000) return v;
  }
  return null;
}

/** Bottles of one SKU needed for `enrolled` students at 48ml/person, rounded
 *  up, min 1 once there is a single student. Unknown format → 720ml. */
export function bottlesForStudents(enrolled: number, sizeMl?: number | null): number {
  const n = Math.max(0, enrolled);
  if (n === 0) return 0;
  const size = sizeMl && sizeMl > 0 ? sizeMl : DEFAULT_BOTTLE_ML;
  return Math.max(1, Math.ceil((n * ML_PER_PERSON) / size));
}

/** Total live bottle cost across all program days: per-SKU bottles (format-
 *  aware) × each SKU's live catalog cost, falling back to the stored per-sake
 *  cost when the SKU has no code or isn't in the catalog. */
export function bottleCost(
  days: BottleDay[],
  catBySku: ReadonlyMap<string, { cost?: number; name?: string | null }>,
  enrolled: number,
): number {
  return days.reduce(
    (s, d) =>
      s +
      d.sakes.reduce((ss, sk) => {
        const item = sk.code ? catBySku.get(sk.code) : undefined;
        const live = item?.cost || sk.cost;
        const bottles = bottlesForStudents(enrolled, parseVolumeMl(item?.name ?? sk.name, sk.code));
        return ss + bottles * live;
      }, 0),
    0,
  );
}
