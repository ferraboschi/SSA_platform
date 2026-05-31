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
  MaterialTemplate,
  ProgramDay,
  Sake,
  Student,
} from "@/lib/domain";
import { COURSE_TYPES } from "@/lib/domain/constants";
import { monthIndexIt } from "@/lib/dashboard";

export { monthIndexIt };

// The course-detail countdown anchors "today" to 25 May 2026, like the prototype.
export const CORSO_TODAY = new Date(2026, 4, 25);
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

// Lifecycle behind each catalog tab.
export type CatalogTab = "attivi" | "bozze" | "archiviati" | "passati";
export const TAB_LIFECYCLE: Record<CatalogTab, CourseLifecycle> = {
  attivi: "pubblicato",
  bozze: "bozza",
  archiviati: "archiviato",
  passati: "passato",
};

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
}

export function toCourseListItem(c: Course): CourseListItem {
  return {
    id: c.id,
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

const GIFT_NAMES_BANK = [
  "Luca Verdi", "Emma Conti", "Filippo Marini", "Sara Romano", "Davide Greco",
  "Alice Costa", "Matteo Galli", "Anna Bruni", "Riccardo Sala", "Beatrice Caruso",
];

const seedOf = (k: string) => {
  let s = 0;
  for (const ch of k) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(s);
};

export function buildIscrittiModel(students: Student[]): IscrittoModel[] {
  return students.map((s, i) => {
    const k = seedOf(s.email + i);
    const isMulti = i > 0 && k % 11 === 0;
    const isGift = !isMulti && i > 0 && k % 14 === 0;
    const typoName = !isGift && k % 17 === 0;
    const typoEmail = !isGift && !typoName && k % 19 === 0;
    const seats = isMulti ? 2 : 1;
    const attendees: Attendee[] = [];
    if (isGift) {
      attendees.push({
        id: `att-${i}-gift`, name: "", email: "", phone: "",
        isBuyer: false, isGift: true, confirmed: false, pending: true,
      });
    } else {
      attendees.push({
        id: `att-${i}-self`, name: s.name, email: s.email, phone: s.phone,
        isBuyer: true, confirmed: !typoName && !typoEmail,
        typoName, typoEmail, hasWA: s.hasWhatsApp,
      });
      if (isMulti) {
        attendees.push({
          id: `att-${i}-plus`, name: GIFT_NAMES_BANK[k % GIFT_NAMES_BANK.length],
          email: "", phone: "", isBuyer: false, confirmed: false, pending: true,
        });
      }
    }
    return {
      id: `isc-${i}`,
      buyer: {
        name: s.name, email: s.email, phone: s.phone, hasWA: s.hasWhatsApp,
        orderNumber: s.orderNumber, amount: s.amount, discountCode: s.discountCode,
      },
      seats, isGift, isMulti, attendees,
      totalAmount: s.amount * seats,
      flags: { typoName, typoEmail },
    };
  });
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
