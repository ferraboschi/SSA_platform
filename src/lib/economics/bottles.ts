// Bottle logistics — single source of truth for the "one bottle covers ~15
// students" rule and the live bottle-cost rollup. Shared by the course economics
// section (ProgrammaEconomiaSection) and the material-template editor, which
// previously each hand-rolled the identical formula.
//
// Pure leaf module: imports nothing, so it is safe to use anywhere and testable
// in isolation.

export interface BottleSake {
  code?: string | null;
  cost: number;
}

export interface BottleDay {
  sakes: BottleSake[];
}

/** Bottles needed per SKU for `enrolled` students — one bottle per ~15 (rounded
 *  up), and always at least one once there is a single student. */
export function bottlesForStudents(enrolled: number): number {
  const n = Math.max(0, enrolled);
  return Math.ceil(n / 15) || (n > 0 ? 1 : 0);
}

/** Total live bottle cost across all program days: `bottlesPerSku` × each SKU's
 *  live catalog cost, falling back to the stored per-sake cost when the SKU has
 *  no code or isn't in the catalog. */
export function bottleCost(
  days: BottleDay[],
  catBySku: ReadonlyMap<string, { cost?: number }>,
  bottlesPerSku: number,
): number {
  return days.reduce(
    (s, d) =>
      s +
      d.sakes.reduce((ss, sk) => {
        const live = (sk.code && catBySku.get(sk.code)?.cost) || sk.cost;
        return ss + bottlesPerSku * live;
      }, 0),
    0,
  );
}
