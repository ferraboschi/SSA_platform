/**
 * Canonical value formatters. Pure leaf module — imports nothing.
 *
 * The whole app renders money one way from here: Italian grouping (forced from
 * four digits — CLDR's it-IT default only groups from five, so a bare
 * `toLocaleString` would render "1234" not "1.234"), comma decimals, and — for
 * `formatEuro` — the euro symbol AFTER the number with a single regular space
 * ("1.234 €", "123,44 €"). Route every money-rendering site through these so the
 * format stays consistent everywhere. Never let a call site pass cents where
 * euros are expected — the value shown must not change, only its string shape.
 *
 * Use `formatNumberIt` where the euro symbol is rendered separately (e.g. a KPI
 * `unit="€"` slot); use `formatEuro` where the symbol belongs inline.
 */

type EuroDecimals = "auto" | 0 | 2;

function fractionDigits(n: number, mode: EuroDecimals): number {
  if (mode === 0) return 0;
  if (mode === 2) return 2;
  // auto: whole euros show no decimals, precise amounts show exactly two.
  return Number.isInteger(n) ? 0 : 2;
}

/**
 * Format a number the canonical Italian way (grouped thousands, comma decimals),
 * WITHOUT a currency symbol. For amounts whose "€" is rendered elsewhere.
 *
 * @param opts.decimals `"auto"` (default: 0 for integers, else 2), `0`, or `2`.
 * NaN / ±Infinity fall back to "0".
 */
export function formatNumberIt(n: number, opts?: { decimals?: EuroDecimals }): string {
  if (!Number.isFinite(n)) return "0";
  const digits = fractionDigits(n, opts?.decimals ?? "auto");
  // `useGrouping: "always"` forces the thousands separator from four digits —
  // it-IT's CLDR default (minimumGroupingDigits 2) would leave "1234" ungrouped.
  return n.toLocaleString("it-IT", {
    useGrouping: "always",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Format an amount **already expressed in euros** the canonical Italian way,
 * with the euro symbol after the number ("1.234 €", "123,44 €").
 *
 * @param n      the amount in euros (NOT cents — divide cents/100 before calling)
 * @param opts.decimals
 *   - `"auto"` (default): 0 fraction digits for whole euros, 2 otherwise.
 *   - `0`: always whole euros (rounds).  `2`: always two decimals.
 *
 * Negative values format naturally ("-1.234 €"). NaN / ±Infinity → "0 €".
 */
export function formatEuro(n: number, opts?: { decimals?: EuroDecimals }): string {
  if (!Number.isFinite(n)) return "0 €";
  return formatNumberIt(n, opts) + " €";
}
