// Server-safe dashboard aggregations. Pure functions that turn domain data into
// the compact, serializable shapes the dashboard renders. Faithful to the
// prototype's page-dashboard.jsx computations.

import type { Corsista, Course, DashThresholds, Educator } from "@/lib/domain";
import type { CourseStatus, CourseTypeColor, CourseLifecycle } from "@/lib/domain";

// The prototype hero/reminders anchor "today" to 25 May 2026 (Monday, week 22).
export const DASH_TODAY = new Date(2026, 4, 25);
export const DASH_WEEK = 22;
const DAY_MS = 86_400_000;

// Course month names are stored in Italian; index against that fixed list.
const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
export const monthIndexIt = (month: string) => MONTHS_IT.indexOf(month);

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Localized long month name for a given Italian month key (capitalized).
export function monthLabel(monthKey: string, locale: string): string {
  const idx = monthIndexIt(monthKey);
  if (idx < 0) return monthKey;
  return capitalize(
    new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, idx, 1)),
  );
}

const courseStart = (c: Course) =>
  new Date(c.year, Math.max(0, monthIndexIt(c.month)), c.day || 1);

// ===== Serializable shapes =====

export interface DashboardKpis {
  activeCount: number;
  pastCount: number;
  totalEnrolled: number;
  totalCapacity: number;
  totalRevenue: number;
  totalMargin: number;
  atRiskCount: number;
}

export interface PipelineBarData {
  present: boolean;
  courseId?: string;
  shortTitle?: string;
  typeShort?: string;
  typeColor?: CourseTypeColor;
  day?: number;
  monthKey?: string;
  enrolled?: number;
  capacity?: number;
  revenue?: number;
  city?: string;
  educatorName?: string;
  status?: CourseStatus;
  fill: number;
}

export interface PipelineMonth {
  monthKey: string;
  count: number;
  revenue: number;
  enrolled: number;
  capacity: number;
  bars: PipelineBarData[];
}

export interface AttentionRow {
  id: string;
  day: number;
  typeShort: string;
  typeColor: CourseTypeColor;
  shortTitle: string;
  monthKey: string;
  city: string;
  educatorName: string;
  enrolled: number;
  capacity: number;
  minStudents: number;
  status: CourseStatus;
}

export interface RecentEnrollment {
  name: string;
  courseShortTitle: string;
  city: string;
  discountCode: string | null;
  amount: number;
}

export interface TopEducator {
  id: string;
  name: string;
  initials: string;
  role: string;
  city: string;
  courseCount: number;
  enrolled: number;
}

export interface CommunityStats {
  total: number;
  current: number;
  returning: number;
  returningPct: number;
  certified: number;
}

export interface ShipmentReminder {
  courseId: string;
  shortTitle: string;
  enrolled: number;
  shipBy: number;
}
export interface BookStockReminder {
  sku: string;
  qty: number;
  days: number;
}
export interface SakeExamReminder {
  courseId: string;
  shortTitle: string;
  stock: number;
  need: number;
}

export interface RemindersData {
  shipments: ShipmentReminder[];
  bookStock: BookStockReminder[];
  sakeExam: SakeExamReminder[];
  total: number;
}

export interface ReportCourse {
  id: string;
  day: number;
  monthKey: string;
  year: number;
  shortTitle: string;
  typeShort: string;
  typeColor: CourseTypeColor;
  educatorName: string | null;
  city: string;
  enrolled: number;
  capacity: number;
  margin: number;
  revenue: number;
  lifecycle: CourseLifecycle;
  examResults: { passed: number; retrial: number; failed: number } | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  pipeline: PipelineMonth[];
  pipelineMonthKeys: string[];
  attention: AttentionRow[];
  recent: RecentEnrollment[];
  topEducators: TopEducator[];
  community: CommunityStats;
  reminders: RemindersData;
  examLive: { id: string; shortTitle: string } | null;
  reportCourses: ReportCourse[];
}

function barTone(status?: CourseStatus): CourseStatus | undefined {
  return status;
}

export function buildDashboard(
  courses: Course[],
  corsisti: Corsista[],
  educators: Educator[],
  thresholds: DashThresholds,
): DashboardData {
  const active = courses.filter((c) => c.lifecycle === "pubblicato");
  const past = courses.filter((c) => c.lifecycle === "passato");

  const totalEnrolled = active.reduce((s, c) => s + c.enrolled, 0);
  const totalCapacity = active.reduce((s, c) => s + c.capacity, 0);
  const totalRevenue = active.reduce((s, c) => s + c.revenue, 0);
  const totalMargin = active.reduce((s, c) => s + c.margin, 0);
  const atRisk = active.filter((c) => c.status === "rischio" || c.status === "critico");

  // Pipeline: 6 months starting at May (prototype window).
  const pipelineMonthKeys = ["Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre"];
  const pipeline: PipelineMonth[] = pipelineMonthKeys.map((monthKey) => {
    const cs = active.filter((c) => c.month === monthKey);
    const count = cs.length;
    const bars: PipelineBarData[] = [...Array(count || 1)].map((_, j) => {
      const c = cs[j];
      if (!c) return { present: false, fill: 0 };
      return {
        present: true,
        courseId: c.id,
        shortTitle: c.shortTitle,
        typeShort: c.typeShort,
        typeColor: c.typeColor,
        day: c.day,
        monthKey: c.month,
        enrolled: c.enrolled,
        capacity: c.capacity,
        revenue: c.revenue,
        city: c.city,
        educatorName: c.educator?.name,
        status: barTone(c.status),
        fill: c.capacity ? c.enrolled / c.capacity : 0,
      };
    });
    return {
      monthKey,
      count,
      revenue: cs.reduce((s, c) => s + c.revenue, 0),
      enrolled: cs.reduce((s, c) => s + c.enrolled, 0),
      capacity: cs.reduce((s, c) => s + c.capacity, 0),
      bars,
    };
  });

  const attention: AttentionRow[] = atRisk.map((c) => ({
    id: c.id,
    day: c.day,
    typeShort: c.typeShort,
    typeColor: c.typeColor,
    shortTitle: c.shortTitle,
    monthKey: c.month,
    city: c.city,
    educatorName: c.educator?.name ?? "",
    enrolled: c.enrolled,
    capacity: c.capacity,
    minStudents: c.minStudents,
    status: c.status,
  }));

  // Recent enrolments across active courses, newest first.
  const recentRaw: { name: string; courseShortTitle: string; city: string; discountCode: string | null; amount: number; orderDate: string }[] = [];
  active.forEach((c) =>
    c.students.forEach((s) =>
      recentRaw.push({
        name: s.name,
        courseShortTitle: c.shortTitle,
        city: c.city,
        discountCode: s.discountCode,
        amount: s.amount,
        orderDate: s.orderDate,
      }),
    ),
  );
  recentRaw.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  const recent: RecentEnrollment[] = recentRaw.slice(0, 7).map(({ orderDate, ...rest }) => {
    void orderDate;
    return rest;
  });

  const topEducators: TopEducator[] = educators.slice(0, 4).map((e) => {
    const eCourses = courses.filter((c) => c.educator?.id === e.id);
    return {
      id: e.id,
      name: e.name,
      initials: e.initials,
      role: e.role,
      city: e.city,
      courseCount: eCourses.length,
      enrolled: eCourses.reduce((s, c) => s + c.enrolled, 0),
    };
  });

  const returning = corsisti.filter((s) => s.isReturning).length;
  const community: CommunityStats = {
    total: corsisti.length,
    current: corsisti.filter((s) => !s.historical).length,
    returning,
    returningPct: corsisti.length ? Math.round((returning / corsisti.length) * 100) : 0,
    certified: corsisti.filter((s) => s.courses.some((c) => c.examResult === "passed")).length,
  };

  // ===== Operational reminders =====
  const shipments: ShipmentReminder[] = active
    .filter((c) => c.mode === "online")
    .map((c) => {
      const days = Math.round((courseStart(c).getTime() - DASH_TODAY.getTime()) / DAY_MS);
      return { course: c, daysToStart: days, shipBy: days - thresholds.shipDays };
    })
    .filter((r) => r.daysToStart > 0 && r.daysToStart <= 25)
    .sort((a, b) => a.shipBy - b.shipBy)
    .slice(0, 3)
    .map((r) => ({
      courseId: r.course.id,
      shortTitle: r.course.shortTitle,
      enrolled: r.course.enrolled,
      shipBy: r.shipBy,
    }));

  // Book stock is mock/hardcoded in the prototype (no inventory source yet).
  const bookStock: BookStockReminder[] = [
    { sku: "Manuale SSA v3", qty: 12, days: 5 },
    { sku: "Booklet Introduttivo", qty: 38, days: 12 },
    { sku: "Manuale Shochu", qty: 4, days: 2 },
  ].filter((b) => b.qty < thresholds.bookMin);

  const sakeExam: SakeExamReminder[] = active
    .filter((c) => c.exam)
    .slice(0, 1)
    .map((c) => {
      const need = c.exam?.totalQuestions || 30;
      return {
        courseId: c.id,
        shortTitle: c.shortTitle,
        need,
        stock: Math.round(need * (thresholds.sakeExamPct / 100)),
      };
    });

  // Two fixed "other" ops (mock) — counted toward the open total.
  const otherOpsCount = 2;
  const total = shipments.length + bookStock.length + sakeExam.length + otherOpsCount;

  const liveCourse = courses.find((c) => c.examLive && c.examLive.length > 0);
  const examLive = liveCourse ? { id: liveCourse.id, shortTitle: liveCourse.shortTitle } : null;

  const reportCourses: ReportCourse[] = courses.map((c) => ({
    id: c.id,
    day: c.day,
    monthKey: c.month,
    year: c.year,
    shortTitle: c.shortTitle,
    typeShort: c.typeShort,
    typeColor: c.typeColor,
    educatorName: c.educator?.name ?? null,
    city: c.city,
    enrolled: c.enrolled,
    capacity: c.capacity,
    margin: c.margin,
    revenue: c.revenue,
    lifecycle: c.lifecycle,
    examResults: c.examResults ?? null,
  }));

  return {
    kpis: {
      activeCount: active.length,
      pastCount: past.length,
      totalEnrolled,
      totalCapacity,
      totalRevenue,
      totalMargin,
      atRiskCount: atRisk.length,
    },
    pipeline,
    pipelineMonthKeys,
    attention,
    recent,
    topEducators,
    community,
    reminders: { shipments, bookStock, sakeExam, total },
    examLive,
    reportCourses,
  };
}
