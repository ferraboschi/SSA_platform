// Pianificatore — pure planning core ported from the prototype's
// `pianificatore-core.js` (window.PL). Constants + date/session helpers +
// normalization for the rolling 12-month planner. No DOM, no globals: lookups
// (course types, educators) are passed in, so this runs on server and client.

import {
  COURSE_TYPES,
  type CourseTypeKey,
  type DeliveryMode,
} from "@/lib/domain";

// Month names are logical keys: the UI localizes via the i18n dictionary, but
// the planner's date math and prototype-faithful summaries use these directly.
export const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
export const MONTHS_SHORT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];
export const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

// "Today" anchored to the app's mock clock (matches dashboard / course detail).
export const TODAY = new Date(2026, 4, 25);

export interface TypeColor {
  solid: string;
  soft: string;
  ink: string;
}

// Per-type palette (3 brand tints + 2 derived) for chips, bars and dots.
export const TYPE_COLORS: Record<CourseTypeKey, TypeColor> = {
  certificato: { solid: "var(--azzurro)", soft: "var(--azzurro-bg)", ink: "var(--azzurro)" },
  introduttivo: { solid: "var(--oro)", soft: "var(--oro-bg)", ink: "#8A6E1A" },
  masterclass: { solid: "var(--indigo)", soft: "var(--indigo-50)", ink: "var(--indigo-600)" },
  shochu: { solid: "#2A9D8F", soft: "#E2F3F0", ink: "#1E7268" },
  mixology: { solid: "#B5559B", soft: "#F7E9F3", ink: "#8E3F77" },
};

// Default capacity for planned (not-yet-on-Shopify) courses.
export const DEFAULT_CAP: Record<CourseTypeKey, number> = {
  certificato: 20, introduttivo: 20, masterclass: 16, shochu: 18, mixology: 14,
};

// Session schedule by type + delivery mode: in-person = consecutive days,
// online = weekly appointments.
export const PRESENZA_DAYS: Record<CourseTypeKey, number> = {
  certificato: 3, introduttivo: 1, masterclass: 1, shochu: 2, mixology: 1,
};
export const ONLINE_SESSIONS: Record<CourseTypeKey, number> = {
  certificato: 9, introduttivo: 3, masterclass: 2, shochu: 4, mixology: 2,
};

// "Hub" cities excluded from coverage KPIs; non-physical channels excluded too.
export const HUB_CITIES = ["Milano", "Roma"];
export const NON_CITIES = ["Online"];

export const monthIdx = (name: string) => MONTHS.indexOf(name);
export const keyOf = (year: number, mIdx: number) => `${year}-${mIdx}`;

export interface WindowMonth {
  key: string;
  year: number;
  mIdx: number;
  name: string;
  short: string;
  isCurrent: boolean;
}

// 12 rolling months starting from the current month.
export function buildWindow(): WindowMonth[] {
  const out: WindowMonth[] = [];
  let y = TODAY.getFullYear();
  let m = TODAY.getMonth();
  for (let i = 0; i < 12; i++) {
    out.push({
      key: keyOf(y, m), year: y, mIdx: m,
      name: MONTHS[m], short: MONTHS_SHORT[m], isCurrent: i === 0,
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

// ---- Date / session helpers ----
const pad2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseYmd = (s: string) => {
  const p = (s || "").split("-").map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
};
export const sessionCount = (type: CourseTypeKey, mode: DeliveryMode) =>
  mode === "online" ? ONLINE_SESSIONS[type] || 1 : PRESENZA_DAYS[type] || 1;

// Generate session dates from a start date (ISO yyyy-mm-dd).
export function genDates(
  startYmd: string,
  type: CourseTypeKey,
  mode: DeliveryMode,
): string[] {
  const n = sessionCount(type, mode);
  const step = mode === "online" ? 7 : 1;
  const base = parseYmd(startYmd);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + step * i);
    out.push(ymd(d));
  }
  return out;
}

export const fmtDay = (s: string) => {
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
export const fmtDayFull = (s: string) => {
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

// week of month (0..4) from a day-of-month 1..31
export const weekOfMonth = (day: number) =>
  Math.min(4, Math.floor(((day || 1) - 1) / 7));

export function shopifyUrl(query?: string) {
  const base =
    "https://admin.shopify.com/store/sakesommelierassociation/products";
  return query ? `${base}?query=${encodeURIComponent(query)}` : base;
}

let _seq = 100;
export const nextId = () =>
  `pl-${++_seq}-${Math.random().toString(36).slice(2, 6)}`;

// ---- Planner items ----

export type PlannerKind = "real" | "planned";

export interface PlannerEducatorRef {
  id: string;
  name: string;
  initials: string;
}

export interface PlannerEducator extends PlannerEducatorRef {
  role: string;
  city: string;
  qualifications: CourseTypeKey[];
}

export interface PlannerSession {
  n: number;
  total: number;
  date: string;
}

export interface PlannerItem {
  id: string;
  kind: PlannerKind;
  type: CourseTypeKey;
  typeLabel: string;
  typeShort: string;
  city: string | null;
  educator: PlannerEducatorRef | null;
  educatorId: string | null;
  mode: DeliveryMode;
  dates: string[];
  sessions: PlannerSession[];
  year: number | null;
  mIdx: number | null;
  day: number | null;
  days: number;
  enrolled: number;
  capacity: number;
  status: string;
  lifecycle: string;
  note: string;
  shortTitle: string;
  placed: boolean;
}

// A planned course as persisted client-side (localStorage).
export interface PlannedCourse {
  id: string;
  type: CourseTypeKey;
  mode: DeliveryMode;
  city: string | null;
  educatorId: string | null;
  dates: string[];
  note?: string;
  // Set transiently while unplaced (drag to a month regenerates dates).
  mIdx?: number | null;
  year?: number | null;
  day?: number;
  capacity?: number;
}

// Persisted planner state (settings_kv key "planner_state"). Structurally
// compatible with the component's local PlSaved.
export interface PlannerSaved {
  view?: string;
  scenario?: boolean;
  targets?: Partial<Record<"intro" | "cert" | "citta" | "pass" | "somm", number>>;
  planned?: PlannedCourse[];
  thresholds?: Partial<Record<"conflictDays" | "canniDays", number>>;
}

// Minimal shape needed to normalize a real (Shopify) course into a planner item.
export interface RealCourseInput {
  id: string;
  type: CourseTypeKey;
  typeLabel: string;
  typeShort: string;
  city: string;
  mode: DeliveryMode;
  month: string;
  year: number;
  day: number;
  days: number;
  enrolled: number;
  capacity: number;
  status: string;
  lifecycle: string;
  shortTitle: string;
  educator: PlannerEducatorRef | null;
}

export function normalizeReal(c: RealCourseInput): PlannerItem {
  const mIdx = monthIdx(c.month);
  const mode: DeliveryMode = c.mode || (c.city === "Online" ? "online" : "presenza");
  const n = c.days || 1;
  const step = mode === "online" ? 7 : 1;
  const base = new Date(c.year, mIdx, c.day || 1);
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + step * i);
    dates.push(ymd(d));
  }
  return {
    id: c.id, kind: "real",
    type: c.type, typeLabel: c.typeLabel, typeShort: c.typeShort,
    city: c.city, educator: c.educator, educatorId: c.educator?.id ?? null,
    mode, dates, sessions: dates.map((d, i) => ({ n: i + 1, total: n, date: d })),
    year: c.year, mIdx, day: c.day || 1, days: n,
    enrolled: c.enrolled, capacity: c.capacity,
    status: c.status, lifecycle: c.lifecycle, note: "",
    shortTitle: c.shortTitle, placed: true,
  };
}

export function normalizePlanned(
  p: PlannedCourse,
  educators: PlannerEducator[],
): PlannerItem {
  const t = COURSE_TYPES[p.type];
  const edu = p.educatorId
    ? educators.find((e) => e.id === p.educatorId) ?? null
    : null;
  const mode: DeliveryMode = p.mode || "presenza";
  let dates = p.dates && p.dates.length ? p.dates.slice() : [];
  if (!dates.length && p.mIdx !== null && p.mIdx !== undefined) {
    dates = genDates(
      ymd(new Date(p.year || TODAY.getFullYear(), p.mIdx, p.day || 14)),
      p.type,
      mode,
    );
  }
  const placed = dates.length > 0;
  const first = placed ? parseYmd(dates[0]) : null;
  return {
    id: p.id, kind: "planned",
    type: p.type,
    typeLabel: t?.label || p.type,
    typeShort: t?.short || p.type.toUpperCase().slice(0, 5),
    city: p.city || null,
    educator: edu ? { id: edu.id, name: edu.name, initials: edu.initials } : null,
    educatorId: p.educatorId || null,
    mode, dates, sessions: dates.map((d, i) => ({ n: i + 1, total: dates.length, date: d })),
    year: first ? first.getFullYear() : null,
    mIdx: first ? first.getMonth() : null,
    day: first ? first.getDate() : null,
    days: dates.length, enrolled: 0,
    capacity: p.capacity || DEFAULT_CAP[p.type] || 16,
    note: p.note || "",
    status: "pianificato", lifecycle: "pianificato",
    shortTitle: t?.label || p.type, placed,
  };
}

// Compact summary of a course's dates ("12 Set", "12–14 Set", "4 appuntamenti…").
// `onlineUnit` localizes the online-appointment noun (e.g. "appuntamenti").
export function dateSummary(
  item: Pick<PlannerItem, "dates" | "mode">,
  onlineUnit = "",
): string {
  const ds = item.dates || [];
  if (!ds.length) return "";
  if (ds.length === 1) return fmtDay(ds[0]);
  if (item.mode === "online")
    return `${ds.length}${onlineUnit ? ` ${onlineUnit}` : ""} · dal ${fmtDay(ds[0])}`;
  const a = parseYmd(ds[0]);
  const b = parseYmd(ds[ds.length - 1]);
  if (a.getMonth() === b.getMonth())
    return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  return `${fmtDay(ds[0])} – ${fmtDay(ds[ds.length - 1])}`;
}

// Courses placed in a given (year, month) cell.
export function monthCourses(
  courses: PlannerItem[],
  year: number,
  mIdx: number,
): PlannerItem[] {
  return courses.filter((c) => c.placed && c.year === year && c.mIdx === mIdx);
}
