// Server-safe Corsi aggregations. Pure functions turning domain courses into the
// compact, serializable shapes the catalog and course-detail views render.
// Faithful to the prototype computations in page-corsi.jsx / page-corso.jsx.

import type {
  Course,
  CourseLifecycle,
  CourseStatus,
  CourseTypeColor,
  CourseTypeKey,
  DeliveryMode,
  MaterialCosts,
  MaterialTemplate,
  ProgramDay,
  Sake,
} from "@/lib/domain";
import { COURSE_TYPES } from "@/lib/domain/constants";
import { monthIndexIt } from "@/lib/dashboard";

export { monthIndexIt };

// The course-detail countdown anchors "today" to 25 May 2026, like the prototype.
const CORSO_TODAY = new Date(2026, 4, 25);
const DAY_MS = 86_400_000;

// Health-status rule keys, in escalation order. The human-readable rule/detail
// text lives in the i18n dictionary (corsi.statusRules); this is the canonical
// definition the server uses when assigning `status`.
export const STATUS_RULE_KEYS: CourseStatus[] = [
  "in-traiettoria",
  "monitor",
  "rischio",
  "critico",
];

// Lifecycle behind each catalog tab. The catalog is an ACTIVE view: only
// published courses + the separate "Bozze" drafts area. Passed + cancelled
// (+ any legacy archiviato) live in the Archivio section, not here.
export type CatalogTab = "attivi" | "bozze";
export const TAB_LIFECYCLE: Record<CatalogTab, CourseLifecycle> = {
  attivi: "pubblicato",
  bozze: "bozza",
};

// ── Shared lifecycle predicates (single source of truth for which surface a
// course belongs to). Active views (dashboard, pianificatore, corsi catalog) show
// ONLY active courses; drafts live in the separate Bozze area; passed + cancelled
// (+ any legacy archiviato) live in the Archivio section.
export const isActiveCourse = (lc: CourseLifecycle): boolean => lc === "pubblicato";
export const isDraftCourse = (lc: CourseLifecycle): boolean => lc === "bozza";
export const isArchivedCourse = (lc: CourseLifecycle): boolean =>
  lc === "passato" || lc === "cancelled" || lc === "archiviato";
/** The archive REASON tag shown in the Archivio section. */
export type ArchiveReason = "passed" | "cancelled";
export const archiveReason = (lc: CourseLifecycle): ArchiveReason =>
  lc === "cancelled" ? "cancelled" : "passed";

export type CourseSortKey =
  | "date"
  | "type"
  | "title"
  | "city"
  | "educator"
  | "enrolled"
  | "status"
  | "revenue"
  | "margin";

export type SortDir = "asc" | "desc";

// ===== Catalog projection =====

export interface CourseListItem {
  id: string;
  handle: string;
  type: CourseTypeKey;
  typeLabel: string;
  typeShort: string;
  typeColor: CourseTypeColor;
  shortTitle: string;
  city: string;
  mode: DeliveryMode;
  month: string;
  year: number;
  day: number;
  days: number;
  educatorId: string | null;
  educatorName: string;
  educatorInitials: string;
  enrolled: number;
  capacity: number;
  minStudents: number;
  status: CourseStatus;
  lifecycle: CourseLifecycle;
  revenue: number;
  margin: number;
  examPassed: number | null;
  /** Whether the operator has assigned a sake program/template to this course
   *  (a saved program overlay with at least one sake). Filled by the list page;
   *  defaults false elsewhere. */
  hasProgram: boolean;
}

export function toCourseListItem(c: Course): CourseListItem {
  return {
    id: c.id,
    handle: c.handle,
    type: c.type,
    typeLabel: c.typeLabel,
    typeShort: c.typeShort,
    typeColor: c.typeColor,
    shortTitle: c.shortTitle,
    city: c.city,
    mode: c.mode,
    month: c.month,
    year: c.year,
    day: c.day,
    days: c.days,
    educatorId: c.educator?.id ?? null,
    educatorName: c.educator?.name ?? "",
    educatorInitials: c.educator?.initials ?? "",
    enrolled: c.enrolled,
    capacity: c.capacity,
    minStudents: c.minStudents,
    status: c.status,
    lifecycle: c.lifecycle,
    revenue: c.revenue,
    margin: c.margin,
    examPassed: c.examResults?.passed ?? null,
    hasProgram: false,
  };
}

export interface CatalogFilterOptions {
  types: { key: CourseTypeKey; label: string }[];
  cities: string[];
  educators: { id: string; name: string }[];
}

// Comparators per sort key, faithful to the prototype `sorters` map.
const SORTERS: Record<CourseSortKey, (a: CourseListItem, b: CourseListItem) => number> = {
  date: (a, b) =>
    a.year - b.year || monthIndexIt(a.month) - monthIndexIt(b.month) || a.day - b.day,
  type: (a, b) => a.typeLabel.localeCompare(b.typeLabel),
  title: (a, b) => a.shortTitle.localeCompare(b.shortTitle),
  city: (a, b) => a.city.localeCompare(b.city),
  educator: (a, b) => a.educatorName.localeCompare(b.educatorName),
  enrolled: (a, b) =>
    (a.capacity ? a.enrolled / a.capacity : 0) - (b.capacity ? b.enrolled / b.capacity : 0),
  status: (a, b) =>
    STATUS_RULE_KEYS.indexOf(a.status) - STATUS_RULE_KEYS.indexOf(b.status),
  revenue: (a, b) => a.revenue - b.revenue,
  margin: (a, b) => a.margin - b.margin,
};

export function sortCourses(
  list: CourseListItem[],
  key: CourseSortKey,
  dir: SortDir,
): CourseListItem[] {
  const fn = SORTERS[key] || SORTERS.date;
  return [...list].sort((a, b) => (dir === "asc" ? fn(a, b) : fn(b, a)));
}

// ===== Iscritti model (course detail · Iscritti tab) =====
// Deterministic, seeded enrichment of the order list into editable enrolment
// rows: buyer, attendees, gift/multi flags, and name/email typo flags. Pure so
// it can seed client state identically on every render.

export interface Attendee {
  id: string;
  name: string;
  email: string;
  phone: string;
  isBuyer: boolean;
  isGift?: boolean;
  confirmed: boolean;
  pending?: boolean;
  typoName?: boolean;
  typoEmail?: boolean;
  hasWA?: boolean;
}

export interface IscrittoModel {
  id: string;
  buyer: {
    name: string;
    email: string;
    phone: string;
    hasWA: boolean;
    orderNumber: string;
    amount: number;
    discountCode: string | null;
  };
  seats: number;
  isGift: boolean;
  isMulti: boolean;
  attendees: Attendee[];
  totalAmount: number;
  flags: { typoName: boolean; typoEmail: boolean };
}

// Days-to-start for the detail countdown.
export function daysToStart(course: Pick<Course, "year" | "month" | "day">): number {
  const start = new Date(course.year, Math.max(0, monthIndexIt(course.month)), course.day);
  return Math.round((start.getTime() - CORSO_TODAY.getTime()) / DAY_MS);
}

// ===== Course detail · Programma & Economia =====
// Serializable slice the client section needs to seed its editable state.

export interface ProgrammaData {
  program: ProgramDay[];
  costGestione: number;
  costLocation: number;
  costFood: number;
  costAdv: number;
  revenue: number;
  price: number;
  enrolled: number;
  handle: string;
  type: CourseTypeKey;
}

export function toProgrammaData(c: Course): ProgrammaData {
  return {
    program: c.program,
    costGestione: c.costs.gestione,
    costLocation: c.costs.location,
    costFood: c.costs.food,
    costAdv: c.costs.adv,
    revenue: c.revenue,
    price: c.price,
    enrolled: c.enrolled,
    handle: c.handle,
    type: c.type,
  };
}

// Material template projection for the in-course template library modal.
export interface TemplateData {
  id: string;
  name: string;
  type: CourseTypeKey;
  typeLabel: string;
  typeColor: CourseTypeColor;
  description: string;
  lastUsed: string;
  uses: number;
  createdBy: string;
  days: { day: number; name: string; sakes: Sake[] }[];
  /** The template's cost structure, so applying it brings its costs to the course. */
  materiali: MaterialCosts;
}

export function toTemplateData(t: MaterialTemplate): TemplateData {
  const meta = COURSE_TYPES[t.type];
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    typeLabel: meta.label,
    typeColor: meta.color,
    description: t.description,
    lastUsed: t.lastUsed,
    uses: t.uses,
    createdBy: t.createdBy,
    days: t.days.map((d) => ({ day: d.day, name: d.name, sakes: d.sakes.map((s) => ({ ...s })) })),
    materiali: t.materiali,
  };
}

// ===== Course detail · Esame summary tab =====

export interface EsameData {
  type: CourseTypeKey;
  examDayNo: number | null;
  examDateLabel: string | null;
  done: boolean;
  live: boolean;
  miniDone: number;
  miniTotal: number;
  passed: number;
  resultsTotal: number;
  totalQuestions: number;
}

export function toEsameData(c: Course): EsameData {
  const meta = c.examMeta ?? null;
  const results = c.examResults2 ?? [];
  return {
    type: c.type,
    examDayNo: meta?.examDayNo ?? null,
    examDateLabel: meta?.examDateLabel ?? null,
    done: meta?.done ?? false,
    live: meta?.live ?? false,
    miniDone: meta ? meta.miniTests.filter((m) => m.status === "completato").length : 0,
    miniTotal: meta ? meta.miniTests.length : 0,
    passed: results.filter((r) => r.status === "passed").length,
    resultsTotal: results.length,
    totalQuestions: c.exam?.totalQuestions ?? 0,
  };
}
