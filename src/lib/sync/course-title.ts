// Pure course-title / metafield parser used by the Shopify sync to turn a ticket
// product into a platform course. Kept as a PURE LEAF module (no "server-only",
// no data layer) so it can be unit-tested against real Shopify titles — the sync
// silently dropping a valid course is the platform's worst failure mode.

import { MONTH_TO_NUM, parseItDate } from "@/lib/dates/italian-months";

export interface ParsedCourse {
  month: number;
  year: number;
  day: number | null;
  type: string;
  delivery: "online" | "in-person";
  city: string;
}

/** Detect a course type from free text (title or the tipologia metafield).
 *  Whitespace/punctuation-insensitive so "Master Class" / "Master-Class" match. */
export function detectType(text: string): string | null {
  const t = (text || "").toLowerCase();
  const compact = t.replace(/[^a-z0-9]+/g, "");
  if (t.includes("shochu")) return "shochu";
  if (t.includes("certificat") || t.includes("certified")) return "certificato";
  // "introdu" catches BOTH the noun "Introduzione" (used in real Shopify titles)
  // and the adjective "Introduttivo"/"introductory" — matching classifyLine. The
  // old "introdutt" missed every "Introduzione al Sake …" product → all skipped.
  if (t.includes("introdu")) return "introduttivo";
  if (compact.includes("masterclass")) return "masterclass";
  if (t.includes("mixolog")) return "mixology";
  return null;
}

// Course YEARS we ingest from Shopify. 2024 onward: 2024/2025/2026… courses are
// pure-Shopify (no manual "storico" rows for those years), so ingesting them adds
// no duplicates; pre-2024 is left to the historical import to avoid duplicating
// it. (Was 2026+, which silently dropped every valid 2024/2025 course.)
const YEAR_RE = /20(2[4-9]|3\d)/;

/** Parse a course-ticket title like "Corso ... - Giugno 2026, Vercelli". */
export function parseCourseTitle(title: string): ParsedCourse | null {
  const t = title.toLowerCase();
  const month = Object.keys(MONTH_TO_NUM).find((m) => t.includes(m));
  const yearMatch = t.match(YEAR_RE);
  const type = detectType(t);
  if (!month || !yearMatch || !type) return null;
  // Masterclasses are always run online; otherwise infer from the title.
  const delivery = type === "masterclass" || t.includes("online") ? "online" : "in-person";
  let city = title.includes(",") ? title.split(",").pop()!.trim() : "—";
  if (city.toLowerCase() === "online") city = "Online";
  return { month: MONTH_TO_NUM[month], year: Number(yearMatch[0]), day: null, type, delivery, city };
}

/**
 * Fallback parser for products whose TITLE has no month/year (e.g. masterclasses):
 * derive the course from the `custom.*` metafields — `tipologia_di_corso` (type),
 * `luogo_e_orari` (event day/month), `termine_iscrizioni` (deadline → year),
 * `luogo` (venue / Online). Returns null if no type or no month can be found.
 */
export function parseCourseFromMetafields(
  title: string,
  tags: string,
  mf: Record<string, string>,
): ParsedCourse | null {
  const type = detectType(mf.tipologia_di_corso || "") || detectType(title);
  if (!type) return null;

  const event = parseItDate(mf.luogo_e_orari || "");
  const deadline = parseItDate(mf.termine_iscrizioni || "");
  const month = event.month ?? deadline.month;
  if (!month) return null; // can't place on the calendar without a month
  const day = event.day;
  // Year: event date → deadline → infer (this/next year from the month).
  let year = event.year ?? deadline.year;
  if (!year) {
    const now = new Date();
    const cur0 = now.getMonth(); // 0-based
    year = month - 1 >= cur0 ? now.getFullYear() : now.getFullYear() + 1;
  }

  const luogo = (mf.luogo || "").trim();
  const tagsL = (tags || "").toLowerCase();
  const online =
    type === "masterclass" ||
    /online/.test(luogo.toLowerCase()) ||
    /online/.test(tagsL) ||
    /online/.test(title.toLowerCase());
  const city = online ? "Online" : luogo || "—";

  return { month, year, day, type, delivery: online ? "online" : "in-person", city };
}
