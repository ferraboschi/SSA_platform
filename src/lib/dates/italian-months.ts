// Single source of truth for Italian month names ↔ numbers.
// Consolidates the copies that previously lived in dashboard.ts, shell.ts,
// shell-data.ts and sync/shopify-sync.ts.

/** Capitalized month names, index 0 = Gennaio … 11 = Dicembre. */
export const MONTH_NAMES_IT: string[] = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/** Lowercase month name → 1-based number (gennaio = 1 … dicembre = 12). */
export const MONTH_TO_NUM: Record<string, number> = Object.fromEntries(
  MONTH_NAMES_IT.map((m, i) => [m.toLowerCase(), i + 1]),
);

/** 0-based index of a *capitalized* Italian month name; -1 if unknown. */
export const monthIndexIt = (month: string): number => MONTH_NAMES_IT.indexOf(month);

/** Parse an Italian date string like "14 settembre" / "4 Settembre 2026".
 *  Returns whatever it can find (any field may be null). Picks the EARLIEST
 *  month mentioned (the course date usually precedes any exam date), and the
 *  first standalone 1–2 digit number before it as the start day. */
export function parseItDate(
  text: string,
): { day: number | null; month: number | null; year: number | null } {
  const t = (text || "").toLowerCase();
  let monthName: string | null = null;
  let monthPos = Infinity;
  for (const m of Object.keys(MONTH_TO_NUM)) {
    const i = t.indexOf(m);
    if (i >= 0 && i < monthPos) {
      monthPos = i;
      monthName = m;
    }
  }
  const month = monthName ? MONTH_TO_NUM[monthName] : null;
  const yearMatch = t.match(/20(2[0-9]|3\d)/);
  const year = yearMatch ? Number(yearMatch[0]) : null;
  let day: number | null = null;
  if (monthName) {
    const prefix = t.slice(0, monthPos);
    const m = prefix.match(/(?<!\d)(\d{1,2})(?!\d)/);
    if (m) {
      const d = Number(m[1]);
      if (d >= 1 && d <= 31) day = d;
    }
  }
  return { day, month, year };
}
