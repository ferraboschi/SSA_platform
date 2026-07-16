// Analisi e previsione — server-safe analytics over the real course history.
//
// Pure functions that turn `Course[]` into compact, serializable shapes for the
// "Analisi e previsione" page. The forecast layer crosses three signals the SSA
// already has full data for: course FREQUENCY (cadence per city×type), GEOGRAPHY
// (which cities pull demand) and SEASON (which months fill best). From those it
// proposes the next courses to schedule.

import type { Course, CourseTypeKey, DeliveryMode } from "@/lib/domain";
import { COURSE_TYPES } from "@/lib/domain/constants";
import { monthIndexIt, MONTH_NAMES_IT } from "@/lib/dates/italian-months";
import { isPaidRevenue, netPaidCents } from "@/lib/economics/revenue";

/** Months elapsed between two course-dates (signed, in whole months). */
function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function courseDate(c: Course): Date {
  return new Date(c.year, Math.max(0, monthIndexIt(c.month)), c.day || 1);
}

/** A course actually held (excludes planned, drafts and cancelled). */
function isHeld(c: Course): boolean {
  return !c.cancelled && c.lifecycle === "passato";
}

/** A course planned for the future: PUBLISHED and not yet held. Drafts
 *  ("bozza") are intentions, not plans — they must not count as scheduled. */
function isPlanned(c: Course): boolean {
  return !c.cancelled && c.lifecycle === "pubblicato";
}

// ===== Serializable output shapes =====

export interface AnalisiKpis {
  heldCourses: number;
  plannedCourses: number;
  totalEnrolled: number;
  avgFill: number; // 0–100
  totalRevenue: number;
  avgMargin: number; // 0–100, margin as % of revenue
  cities: number;
  recommendations: number;
}

export interface MonthStat {
  month: string; // IT key
  idx: number; // 0–11
  courses: number;
  enrolled: number;
  avgFill: number; // 0–100
  share: number; // share of enrolled vs peak month (0–100), for bar width
  isPeak: boolean;
  isDead: boolean;
}

export interface CityStat {
  city: string;
  courses: number;
  enrolled: number;
  avgFill: number; // 0–100
  revenue: number;
  lastMonth: string;
  lastYear: number;
  cadenceMonths: number | null; // avg months between editions (≥2 editions)
  topType: CourseTypeKey;
  topTypeLabel: string;
  monthsSinceLast: number;
  due: boolean; // overdue vs its own cadence
  share: number; // enrolled vs top city (0–100), for bar width
}

export interface TypeStat {
  type: CourseTypeKey;
  label: string;
  courses: number;
  enrolled: number;
  avgFill: number;
  revenue: number;
  byYear: { year: number; courses: number }[];
}

export interface YearMonthCell {
  courses: number;
  enrolled: number;
  /** Heat tier 0–4: 0 = never held, 4 = the busiest cell of the whole matrix.
   *  Discrete so the UI can map it onto the indigo token scale (no rgba). */
  tier: 0 | 1 | 2 | 3 | 4;
}

export interface YearMonthRow {
  year: number;
  /** 12 cells, index = month 0–11. */
  cells: YearMonthCell[];
  courses: number;
  enrolled: number;
}

export interface YoyMonth {
  month: string; // IT key
  idx: number; // 0–11
  year: number;
  courses: number;
  enrolled: number;
  prevYear: number;
  prevCourses: number;
  prevEnrolled: number;
  deltaCourses: number;
  deltaEnrolled: number;
}

/** Raw `purchases` row as fetched by the page (RLS-locked table, server read). */
export interface PurchaseAggRow {
  cluster: string | null;
  subtype: string | null;
  product_title: string | null;
  amount_cents: number | null;
  discount_cents: number | null;
  financial_status: string | null;
  ordered_at: string | null;
}

export interface ActivityStat {
  cluster: string;
  title: string;
  orders: number;
  revenue: number; // euros, net of discounts, paid orders only
  lastAt: string | null; // most recent ordered_at (ISO)
  share: number; // vs the top activity (0–100), for bar width
}

export interface PersonStat {
  email: string;
  name: string;
  courses: number;
  totalSpent: number;
}

export interface EducatorStat {
  id: string;
  name: string;
  courses: number;
  enrolled: number;
}

export type RecoPriority = "alta" | "media" | "bassa";

export interface Recommendation {
  city: string;
  type: CourseTypeKey;
  typeLabel: string;
  mode: DeliveryMode;
  suggestedMonth: string;
  suggestedYear: number;
  expectedEnrolled: number;
  fillRate: number; // 0–100
  editions: number;
  cadenceMonths: number | null;
  reason: string;
  priority: RecoPriority;
  score: number;
}

export interface AnalisiData {
  kpis: AnalisiKpis;
  seasonality: MonthStat[];
  yearMatrix: YearMonthRow[];
  yoy: YoyMonth[];
  cityStats: CityStat[];
  typeStats: TypeStat[];
  recommendations: Recommendation[];
  bestSeason: { type: CourseTypeKey; label: string; month: string }[];
  hasData: boolean;
}

const round = (n: number) => Math.round(n);
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
const typeLabel = (t: CourseTypeKey) => COURSE_TYPES[t]?.label ?? t;

/** Pick the modal (most frequent) value, tie-broken by the first seen. */
function modal<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

export function computeAnalisi(courses: Course[], today: Date = new Date()): AnalisiData {
  const held = courses.filter(isHeld);
  const planned = courses.filter(isPlanned);

  // ---- KPIs ----
  const totalEnrolled = held.reduce((s, c) => s + c.enrolled, 0);
  const totalCapacity = held.reduce((s, c) => s + c.capacity, 0);
  const totalRevenue = held.reduce((s, c) => s + c.revenue, 0);
  const totalMargin = held.reduce((s, c) => s + c.margin, 0);

  // ---- Seasonality (per month) ----
  const monthAgg = MONTH_NAMES_IT.map((m, idx) => ({ month: m, idx, courses: 0, enrolled: 0, fillSum: 0 }));
  for (const c of held) {
    const idx = monthIndexIt(c.month);
    if (idx < 0) continue;
    const a = monthAgg[idx];
    a.courses += 1;
    a.enrolled += c.enrolled;
    a.fillSum += safeDiv(c.enrolled, c.capacity) * 100;
  }
  const peakEnrolled = Math.max(1, ...monthAgg.map((a) => a.enrolled));
  // Peaks: months in the top tier of demand; dead: held months with the least.
  const activeMonths = monthAgg.filter((a) => a.courses > 0);
  const enrolledSorted = [...activeMonths].sort((a, b) => b.enrolled - a.enrolled);
  const peakSet = new Set(enrolledSorted.slice(0, 3).filter((a) => a.enrolled > 0).map((a) => a.idx));
  const deadSet = new Set(
    monthAgg.filter((a) => a.courses === 0).map((a) => a.idx),
  );
  const seasonality: MonthStat[] = monthAgg.map((a) => ({
    month: a.month,
    idx: a.idx,
    courses: a.courses,
    enrolled: a.enrolled,
    avgFill: round(safeDiv(a.fillSum, a.courses)),
    share: round(safeDiv(a.enrolled, peakEnrolled) * 100),
    isPeak: peakSet.has(a.idx),
    isDead: deadSet.has(a.idx),
  }));

  // ---- Geography (per city) ----
  const byCity = new Map<string, Course[]>();
  for (const c of held) {
    const key = c.city || "—";
    (byCity.get(key) ?? byCity.set(key, []).get(key)!).push(c);
  }
  const cityStatsRaw = [...byCity.entries()].map(([city, list]) => {
    const sorted = [...list].sort((a, b) => courseDate(a).getTime() - courseDate(b).getTime());
    const enrolled = list.reduce((s, c) => s + c.enrolled, 0);
    const revenue = list.reduce((s, c) => s + c.revenue, 0);
    const fillSum = list.reduce((s, c) => s + safeDiv(c.enrolled, c.capacity) * 100, 0);
    const last = sorted[sorted.length - 1];
    // cadence = avg gap (months) across consecutive editions
    let cadence: number | null = null;
    if (sorted.length >= 2) {
      let gaps = 0;
      for (let i = 1; i < sorted.length; i++) {
        gaps += monthsBetween(courseDate(sorted[i - 1]), courseDate(sorted[i]));
      }
      cadence = Math.round(gaps / (sorted.length - 1));
    }
    const monthsSinceLast = monthsBetween(courseDate(last), today);
    const topType = (modal(list.map((c) => c.type)) ?? last.type) as CourseTypeKey;
    return {
      city,
      list,
      sorted,
      courses: list.length,
      enrolled,
      revenue,
      avgFill: round(safeDiv(fillSum, list.length)),
      lastMonth: last.month,
      lastYear: last.year,
      cadenceMonths: cadence,
      topType,
      topTypeLabel: typeLabel(topType),
      monthsSinceLast,
      due: cadence != null && monthsSinceLast >= cadence,
    };
  });
  const topCityEnrolled = Math.max(1, ...cityStatsRaw.map((c) => c.enrolled));
  const cityStats: CityStat[] = cityStatsRaw
    .map((c) => ({
      city: c.city,
      courses: c.courses,
      enrolled: c.enrolled,
      avgFill: c.avgFill,
      revenue: c.revenue,
      lastMonth: c.lastMonth,
      lastYear: c.lastYear,
      cadenceMonths: c.cadenceMonths,
      topType: c.topType,
      topTypeLabel: c.topTypeLabel,
      monthsSinceLast: c.monthsSinceLast,
      due: c.due,
      share: round(safeDiv(c.enrolled, topCityEnrolled) * 100),
    }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // ---- Type stats (growth by year) ----
  const byType = new Map<CourseTypeKey, Course[]>();
  for (const c of held) {
    (byType.get(c.type) ?? byType.set(c.type, []).get(c.type)!).push(c);
  }
  const typeStats: TypeStat[] = [...byType.entries()]
    .map(([type, list]) => {
      const yearMap = new Map<number, number>();
      for (const c of list) yearMap.set(c.year, (yearMap.get(c.year) ?? 0) + 1);
      const fillSum = list.reduce((s, c) => s + safeDiv(c.enrolled, c.capacity) * 100, 0);
      return {
        type,
        label: typeLabel(type),
        courses: list.length,
        enrolled: list.reduce((s, c) => s + c.enrolled, 0),
        avgFill: round(safeDiv(fillSum, list.length)),
        revenue: round(list.reduce((s, c) => s + c.revenue, 0)),
        byYear: [...yearMap.entries()]
          .map(([year, courses]) => ({ year, courses }))
          .sort((a, b) => a.year - b.year),
      };
    })
    .sort((a, b) => b.courses - a.courses);

  // ---- Best season per type (the month each type fills best) ----
  const bestSeason = [...byType.entries()]
    .map(([type, list]) => {
      const mm = new Map<number, { enr: number; n: number }>();
      for (const c of list) {
        const idx = monthIndexIt(c.month);
        if (idx < 0) continue;
        const e = mm.get(idx) ?? { enr: 0, n: 0 };
        e.enr += c.enrolled;
        e.n += 1;
        mm.set(idx, e);
      }
      let bestIdx = -1;
      let bestAvg = -1;
      for (const [idx, v] of mm) {
        const avg = safeDiv(v.enr, v.n);
        if (avg > bestAvg) {
          bestAvg = avg;
          bestIdx = idx;
        }
      }
      return bestIdx >= 0
        ? { type, label: typeLabel(type), month: MONTH_NAMES_IT[bestIdx] }
        : null;
    })
    .filter((x): x is { type: CourseTypeKey; label: string; month: string } => x !== null);

  // ---- Forecast / recommendations (city × type × season) ----
  // Already-planned future courses, to avoid recommending a duplicate.
  const plannedKeys = new Set(planned.map((c) => `${c.city}|${c.type}`));

  const recommendations: Recommendation[] = [];
  for (const [city, list] of byCity) {
    const byT = new Map<CourseTypeKey, Course[]>();
    for (const c of list) (byT.get(c.type) ?? byT.set(c.type, []).get(c.type)!).push(c);

    for (const [type, eds] of byT) {
      if (plannedKeys.has(`${city}|${type}`)) continue; // already scheduled ahead
      const sorted = [...eds].sort((a, b) => courseDate(a).getTime() - courseDate(b).getTime());
      const last = sorted[sorted.length - 1];
      const editions = sorted.length;
      const avgEnrolled = safeDiv(eds.reduce((s, c) => s + c.enrolled, 0), editions);
      const fillRate = round(
        safeDiv(eds.reduce((s, c) => s + safeDiv(c.enrolled, c.capacity) * 100, 0), editions),
      );

      // cadence: real if ≥2 editions, else assume yearly for a proven single run
      let cadence: number | null = null;
      if (editions >= 2) {
        let gaps = 0;
        for (let i = 1; i < sorted.length; i++) {
          gaps += monthsBetween(courseDate(sorted[i - 1]), courseDate(sorted[i]));
        }
        cadence = Math.max(1, Math.round(gaps / (editions - 1)));
      }
      const assumedCadence = cadence ?? 12;
      const monthsSinceLast = monthsBetween(courseDate(last), today);
      const dueIn = assumedCadence - monthsSinceLast; // <=0 → overdue

      // Only surface combos that are due now or coming due within 3 months.
      if (dueIn > 3) continue;
      // Need a minimum of real demand to be worth a recommendation.
      if (avgEnrolled < 3) continue;

      // Best month for this city×type (highest avg enrollment), fallback last.
      const mm = new Map<number, { enr: number; n: number }>();
      for (const c of eds) {
        const idx = monthIndexIt(c.month);
        if (idx < 0) continue;
        const e = mm.get(idx) ?? { enr: 0, n: 0 };
        e.enr += c.enrolled;
        e.n += 1;
        mm.set(idx, e);
      }
      let bestIdx = monthIndexIt(last.month);
      let bestAvg = -1;
      for (const [idx, v] of mm) {
        const avg = safeDiv(v.enr, v.n);
        if (avg > bestAvg) {
          bestAvg = avg;
          bestIdx = idx;
        }
      }
      if (bestIdx < 0) bestIdx = today.getMonth();

      // Next calendar occurrence of bestIdx at/after today.
      let suggestedYear = today.getFullYear();
      if (bestIdx < today.getMonth()) suggestedYear += 1;

      const mode = (modal(eds.map((c) => c.mode)) ?? last.mode) as DeliveryMode;

      const overdue = dueIn <= 0;
      const priority: RecoPriority =
        overdue && avgEnrolled >= 8 ? "alta" : overdue || avgEnrolled >= 8 ? "media" : "bassa";

      const score =
        avgEnrolled * 2 + fillRate / 10 + (overdue ? 20 : Math.max(0, 6 - dueIn) * 2) + editions;

      const reasonParts: string[] = [];
      reasonParts.push(
        editions > 1
          ? `${editions} edizioni passate, in media ${round(avgEnrolled)} iscritti`
          : `Edizione consolidata (${round(avgEnrolled)} iscritti)`,
      );
      if (cadence != null) reasonParts.push(`cadenza ~${cadence} mesi`);
      reasonParts.push(
        overdue
          ? `ultima ${last.month} ${last.year} (${monthsSinceLast} mesi fa) → in ritardo`
          : `prossima finestra tra ${dueIn} mes${dueIn === 1 ? "e" : "i"}`,
      );

      recommendations.push({
        city,
        type,
        typeLabel: typeLabel(type),
        mode,
        suggestedMonth: MONTH_NAMES_IT[bestIdx],
        suggestedYear,
        expectedEnrolled: round(avgEnrolled),
        fillRate,
        editions,
        cadenceMonths: cadence,
        reason: reasonParts.join(" · "),
        priority,
        score: round(score),
      });
    }
  }
  recommendations.sort((a, b) => b.score - a.score);

  const kpis: AnalisiKpis = {
    heldCourses: held.length,
    plannedCourses: planned.length,
    totalEnrolled,
    avgFill: round(safeDiv(totalEnrolled, totalCapacity) * 100),
    totalRevenue: round(totalRevenue),
    avgMargin: round(safeDiv(totalMargin, totalRevenue) * 100),
    cities: byCity.size,
    recommendations: recommendations.length,
  };

  return {
    kpis,
    seasonality,
    yearMatrix: computeYearMatrix(held),
    yoy: computeYoyGrowth(courses, today),
    cityStats,
    typeStats,
    recommendations,
    bestSeason,
    hasData: held.length > 0,
  };
}

// ===== Year × month matrix ("Mesi più frequentati — storico") =====

/** Per-year 12-month heat matrix over held courses. Heat = each cell's enrolled
 *  share of the single busiest cell across ALL years, quantized to 4 tiers so
 *  the UI can render it with the discrete indigo token scale. */
export function computeYearMatrix(held: Course[]): YearMonthRow[] {
  const byYear = new Map<number, { courses: number; enrolled: number }[]>();
  for (const c of held) {
    const idx = monthIndexIt(c.month);
    if (idx < 0) continue;
    const cells =
      byYear.get(c.year) ??
      byYear
        .set(c.year, Array.from({ length: 12 }, () => ({ courses: 0, enrolled: 0 })))
        .get(c.year)!;
    cells[idx].courses += 1;
    cells[idx].enrolled += c.enrolled;
  }
  const peak = Math.max(1, ...[...byYear.values()].flat().map((c) => c.enrolled));
  return [...byYear.entries()]
    .map(([year, cells]) => ({
      year,
      cells: cells.map((c) => ({
        ...c,
        tier: (c.courses === 0
          ? 0
          : Math.min(4, Math.max(1, Math.ceil((c.enrolled / peak) * 4)))) as YearMonthCell["tier"],
      })),
      courses: cells.reduce((s, c) => s + c.courses, 0),
      enrolled: cells.reduce((s, c) => s + c.enrolled, 0),
    }))
    .sort((a, b) => a.year - b.year);
}

// ===== YoY growth ("quali mesi crescono di meno") =====

/** Each of the last 12 COMPLETE months (current month excluded) vs the same
 *  month one year earlier, over held courses. Months with no activity in either
 *  year are skipped. Sorted WEAKEST first (lowest enrolled delta) so shrinking
 *  months surface at the top. */
export function computeYoyGrowth(courses: Course[], today: Date): YoyMonth[] {
  const held = courses.filter(isHeld);
  const agg = new Map<string, { courses: number; enrolled: number }>();
  for (const c of held) {
    const idx = monthIndexIt(c.month);
    if (idx < 0) continue;
    const key = `${c.year}-${idx}`;
    const e = agg.get(key) ?? { courses: 0, enrolled: 0 };
    e.courses += 1;
    e.enrolled += c.enrolled;
    agg.set(key, e);
  }
  const out: YoyMonth[] = [];
  for (let back = 12; back >= 1; back--) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const year = d.getFullYear();
    const idx = d.getMonth();
    const cur = agg.get(`${year}-${idx}`) ?? { courses: 0, enrolled: 0 };
    const prev = agg.get(`${year - 1}-${idx}`) ?? { courses: 0, enrolled: 0 };
    if (cur.courses === 0 && prev.courses === 0) continue;
    out.push({
      month: MONTH_NAMES_IT[idx],
      idx,
      year,
      courses: cur.courses,
      enrolled: cur.enrolled,
      prevYear: year - 1,
      prevCourses: prev.courses,
      prevEnrolled: prev.enrolled,
      deltaCourses: cur.courses - prev.courses,
      deltaEnrolled: cur.enrolled - prev.enrolled,
    });
  }
  return out.sort((a, b) => a.deltaEnrolled - b.deltaEnrolled);
}

// ===== Non-course activity ranking (eventi, libri, merchandise) =====

/** Rank NON-course products by net paid revenue (financial_status null/'paid';
 *  net = max(amount − discount, 0), the platform-wide revenue rule).
 *  NOTE: discount_cents is the ORDER-level discount copied onto every line for
 *  legacy rows, so a multi-line order can over-subtract per product — accepted
 *  for ranking purposes (same rule applied uniformly to every product). */
export function rankActivities(rows: PurchaseAggRow[], top = 10): ActivityStat[] {
  const byKey = new Map<
    string,
    { cluster: string; title: string; orders: number; cents: number; lastAt: string | null }
  >();
  for (const r of rows) {
    const cluster = (r.cluster ?? "").trim();
    if (!cluster || cluster === "corso") continue;
    if (!isPaidRevenue(r.financial_status)) continue;
    const title = (r.product_title ?? "").trim() || "—";
    const key = `${cluster}|${title}`;
    const e =
      byKey.get(key) ?? { cluster, title, orders: 0, cents: 0, lastAt: null };
    e.orders += 1;
    e.cents += netPaidCents(r);
    if (r.ordered_at && (!e.lastAt || r.ordered_at > e.lastAt)) e.lastAt = r.ordered_at;
    byKey.set(key, e);
  }
  const ranked = [...byKey.values()]
    .sort((a, b) => b.cents - a.cents || b.orders - a.orders)
    .slice(0, top);
  const topCents = Math.max(1, ...ranked.map((e) => e.cents));
  return ranked.map((e) => ({
    cluster: e.cluster,
    title: e.title,
    orders: e.orders,
    revenue: round(e.cents / 100),
    lastAt: e.lastAt,
    share: round((e.cents / topCents) * 100),
  }));
}

// ===== People rankings =====

/** Top corsisti by courses attended. Placeholder seats ("@ssa.placeholder")
 *  are synthetic multi-ticket rows, not people — excluded. Structural input so
 *  the full Corsista domain object is accepted but not required. */
export function rankCorsisti(
  corsisti: { email: string; name: string; totalSpent: number; courses: unknown[] }[],
  top = 10,
): PersonStat[] {
  return corsisti
    .filter((c) => !c.email.endsWith("@ssa.placeholder"))
    .map((c) => ({
      email: c.email,
      name: c.name,
      courses: c.courses.length,
      totalSpent: round(c.totalSpent),
    }))
    .filter((c) => c.courses > 0)
    .sort((a, b) => b.courses - a.courses || b.totalSpent - a.totalSpent)
    .slice(0, top);
}

/** Top educators by held courses (grouped by name — the id joins the profile
 *  link when available; the placeholder educator "—" is skipped). */
export function rankEducators(courses: Course[], top = 10): EducatorStat[] {
  const held = courses.filter(isHeld);
  const byName = new Map<string, EducatorStat>();
  for (const c of held) {
    const name = (c.educator?.name ?? "").trim();
    if (!name || name === "—") continue;
    const e = byName.get(name) ?? { id: c.educator.id, name, courses: 0, enrolled: 0 };
    e.courses += 1;
    e.enrolled += c.enrolled;
    if (!e.id && c.educator.id) e.id = c.educator.id;
    byName.set(name, e);
  }
  return [...byName.values()]
    .sort((a, b) => b.courses - a.courses || b.enrolled - a.enrolled)
    .slice(0, top);
}
