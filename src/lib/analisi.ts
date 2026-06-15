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

// "Now" anchor for due/overdue maths. Kept as a constant so the page is
// deterministic (pure) — bump it as the platform's reference date moves.
const ANALISI_TODAY = new Date(2026, 5, 2); // 2 Jun 2026

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

/** A course planned for the future (published but not yet held). */
function isPlanned(c: Course): boolean {
  return !c.cancelled && c.lifecycle !== "passato";
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
  byYear: { year: number; courses: number }[];
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

export function computeAnalisi(courses: Course[]): AnalisiData {
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
    const monthsSinceLast = monthsBetween(courseDate(last), ANALISI_TODAY);
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
      const monthsSinceLast = monthsBetween(courseDate(last), ANALISI_TODAY);
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
      if (bestIdx < 0) bestIdx = ANALISI_TODAY.getMonth();

      // Next calendar occurrence of bestIdx at/after today.
      let suggestedYear = ANALISI_TODAY.getFullYear();
      if (bestIdx < ANALISI_TODAY.getMonth()) suggestedYear += 1;

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
    cityStats,
    typeStats,
    recommendations,
    bestSeason,
    hasData: held.length > 0,
  };
}
