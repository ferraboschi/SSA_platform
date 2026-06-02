import "server-only";

// Live Supabase-backed DataSource.
//
// Implements src/lib/data/repository.ts against the Postgres schema in
// supabase/migrations/. The factory createSupabaseDataSource() returns a value
// satisfying DataSource; the provider auto-selects it when Supabase is
// configured and USE_SEED=false.
//
// Implementation strategy (incremental):
//   ✅ Implemented now: users(profiles), corsisti, educators(+quals),
//      material_templates(+children), settings_kv, notifications(registry).
//   ⏳ Stubbed (return []/null with a warn): courses + nested program/sake,
//      exams + exam_templates + results + live. These need richer joins +
//      careful mapping; they get filled in once we start importing real
//      courses (Task #21 Shopify) and real exams (Task #26).
//
// Stubbed repositories never throw — they return the "safe empty" shape — so
// every page in the app renders its empty state without crashing while we
// migrate sections one by one.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COURSE_TYPES,
  DEFAULT_THRESHOLDS,
  defaultMaterialCosts,
  EXAM_THRESHOLDS,
  NIHONSHU_CATS,
  SHOCHU_CATS,
  STATUS_META,
} from "@/lib/domain";
import type {
  Corsista,
  CorsistaEnrollment,
  Course,
  CourseCosts,
  CourseLifecycle,
  CourseStatus,
  CourseTypeKey,
  DashThresholds,
  DeliveryMode,
  Educator,
  ExamFamily,
  ExamQuestion,
  ExamQuestionType,
  ExamTemplate,
  Language,
  MaterialCosts,
  MaterialTemplate,
  Notebook,
  Notification,
  ProgramDay,
  Purchase,
  Sake,
  StockAlert,
  Student,
  User,
} from "@/lib/domain";
import type {
  CorsistaRepository,
  CourseRepository,
  DataSource,
  EducatorRepository,
  ExamRepository,
  ExamTemplateRepository,
  MaterialTemplateRepository,
  NotificationService,
  SettingsRepository,
  UserRepository,
} from "../repository";
import { computeNotifications } from "@/lib/notifications/registry";
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from "@/lib/integrations/supabase/server";

type DB = SupabaseClient;

// ============================================================================
// Row types — a hand-written subset of the schema (no codegen for now).
// ============================================================================

interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  role: "admin" | "manager";
  phone: string;
  city: string;
  position: string;
  photo_url: string | null;
  locale: Language;
}

interface EducatorRow {
  id: number;
  external_id: string | null;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  bio: string | null;
  photo_url: string | null;
  languages: string[];
  active: boolean;
}

interface EducatorQualRow {
  educator_id: number;
  course_type: CourseTypeKey;
}

interface CorsistaRow {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  has_whatsapp: boolean;
  city: string | null;
  first_seen_at: string | null;
  historical: boolean;
  review_note: string | null;
  merged_into?: number | null;
  diploma_numbers?: string[] | null;
  cluster?: string | null;
}

interface PurchaseRow {
  cluster: string | null;
  subtype: string | null;
  delivery: string | null;
  product_title: string | null;
  amount_cents: number;
  buyer_name: string | null;
  ordered_at: string | null;
}

interface CorsoEmbedded {
  id: number;
  short_title: string;
  full_title: string;
  type: CourseTypeKey;
  city: string;
  month: string;
  year: number;
  lifecycle: "pubblicato" | "bozza" | "archiviato" | "passato";
}

interface IscrizioneRow {
  id: number;
  corso_id: number;
  corsista_id: number;
  amount_cents: number;
  exam_result: "passed" | "retrial" | "failed" | null;
  historical: boolean;
  // PostgREST returns an embedded record as an array even when the relation
  // is many-to-one. We accept both shapes and normalize.
  corso?: CorsoEmbedded | CorsoEmbedded[] | null;
}

interface MaterialTemplateRow {
  id: number;
  external_id: string | null;
  name: string;
  type: CourseTypeKey;
  description: string | null;
  costs: Record<string, unknown>;
  uses: number;
  last_used_at: string | null;
  created_by: string | null;
}

// ============================================================================
// Mappers — DB row → domain object
// ============================================================================

function profileToUser(row: ProfileRow): User {
  const first = row.first_name ?? "";
  const last = row.last_name ?? "";
  const name = row.display_name || `${first} ${last}`.trim() || row.email;
  const initials = (
    (first[0] ?? "") + (last[0] ?? "")
  ).toUpperCase() || "?";
  return {
    id: row.id,
    first,
    last,
    name,
    role: row.role === "admin" ? "Admin" : "Manager",
    roleKey: row.role,
    email: row.email,
    phone: row.phone ?? "",
    city: row.city ?? "",
    position: row.position ?? "",
    initials,
    tone: row.role === "admin" ? "indigo" : "navy",
    photo: row.photo_url ?? undefined,
  };
}

function educatorRowToDomain(row: EducatorRow): Educator {
  const initials =
    row.full_name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return {
    id: row.external_id ?? `db-${row.id}`,
    name: row.full_name,
    role: "Educator",
    city: row.city ?? "",
    initials,
    bio: row.bio ?? "",
    years: 0,
    lang: (row.languages ?? []) as Language[],
    photo: row.photo_url ?? undefined,
  };
}

function iscrizioneToEnrollment(row: IscrizioneRow): CorsistaEnrollment | null {
  const corso = Array.isArray(row.corso) ? row.corso[0] : row.corso;
  if (!corso) return null;
  return {
    courseId: String(corso.id),
    courseTitle: corso.short_title || corso.full_title,
    courseType: corso.type,
    city: corso.city,
    month: corso.month,
    year: corso.year,
    status: corso.lifecycle,
    amount: row.amount_cents / 100,
    examResult: row.exam_result,
    historical: row.historical || undefined,
  };
}

function purchaseRowToDomain(row: PurchaseRow): Purchase {
  return {
    cluster: row.cluster ?? "altro",
    subtype: row.subtype,
    delivery: row.delivery,
    productTitle: row.product_title ?? "",
    amount: row.amount_cents / 100,
    buyerName: row.buyer_name,
    orderedAt: row.ordered_at,
  };
}

function corsistaRowToDomain(
  row: CorsistaRow,
  enrollments: CorsistaEnrollment[],
  purchases: Purchase[] = [],
): Corsista {
  const enrollSpent = enrollments.reduce((s, e) => s + e.amount, 0);
  const purchSpent = purchases.reduce((s, p) => s + p.amount, 0);
  return {
    email: row.email,
    name: row.full_name,
    phone: row.phone ?? "",
    hasWhatsApp: row.has_whatsapp,
    city: row.city ?? "",
    firstSeen: row.first_seen_at ?? "",
    courses: enrollments,
    totalSpent: enrollSpent + purchSpent,
    isReturning: enrollments.length > 1,
    historical: row.historical || undefined,
    purchases,
    reviewNote: row.review_note,
    diplomaNumbers: row.diploma_numbers ?? [],
    cluster: row.cluster ?? null,
  };
}

// ── corsi (courses) ──────────────────────────────────────────────────────────
interface CorsoRow {
  id: number;
  external_id: string | null;
  handle: string;
  short_title: string;
  full_title: string;
  type: CourseTypeKey;
  type_label: string;
  delivery_mode: string;
  city: string;
  venue: string | null;
  month: string;
  year: number;
  start_date: string | null;
  price_cents: number;
  capacity: number;
  min_students: number;
  lifecycle: CourseLifecycle;
  status: string | null;
  educator_id: number | null;
  notebook: Record<string, unknown>;
  costs: Record<string, unknown>;
}

const VALID_STATUS: CourseStatus[] = [
  "in-traiettoria",
  "monitor",
  "rischio",
  "critico",
];

function computeStatus(
  enrolled: number,
  minStud: number,
  lifecycle: CourseLifecycle,
): CourseStatus {
  if (lifecycle === "passato" || lifecycle === "archiviato")
    return enrolled >= minStud ? "in-traiettoria" : "critico";
  const ratio = minStud > 0 ? enrolled / minStud : 1;
  if (ratio >= 1) return "in-traiettoria";
  if (ratio >= 0.66) return "monitor";
  if (ratio >= 0.33) return "rischio";
  return "critico";
}

function placeholderEducator(): Educator {
  return {
    id: "",
    name: "—",
    role: "Educator",
    city: "",
    initials: "—",
    bio: "",
    years: 0,
    lang: [],
  };
}

function corsoRowToDomain(
  row: CorsoRow,
  educator: Educator,
  enrolled: number,
  revenue: number,
  students: Student[],
  program: ProgramDay[],
): Course {
  // Guard against an off-enum `type` slipping in from imports (would crash
  // COURSE_TYPES[type].label consumers downstream).
  const safeType = (row.type in COURSE_TYPES ? row.type : "certificato") as CourseTypeKey;
  const t = COURSE_TYPES[safeType];
  const price = row.price_cents ? row.price_cents / 100 : t.price;
  const minStud = row.min_students || t.minStud;
  const costsRaw = (row.costs ?? {}) as Partial<CourseCosts>;
  const costs: CourseCosts = {
    educator: 600,
    gestione: 900,
    diplomi: 460,
    libri: 36,
    location: row.city === "Milano" ? 0 : 250,
    food: row.type === "certificato" ? 0 : 80,
    adv: 0,
    ...costsRaw,
  };
  const totalCost = Object.values(costs).reduce((s, n) => s + (n || 0), 0);
  const rev = revenue || enrolled * price * 0.85;
  const status: CourseStatus =
    row.status && VALID_STATUS.includes(row.status as CourseStatus)
      ? (row.status as CourseStatus)
      : computeStatus(enrolled, minStud, row.lifecycle);
  const nbRaw = (row.notebook ?? {}) as Record<string, unknown>;
  const nb = nbRaw as Partial<Notebook>;
  return {
    id: String(row.id),
    handle: row.handle,
    type: safeType,
    typeLabel: row.type_label || t.label,
    typeShort: t.short,
    typeColor: t.color,
    title: row.full_title,
    shortTitle: row.short_title,
    city: row.city,
    mode: row.delivery_mode === "online" ? "online" : "presenza",
    month: row.month,
    year: row.year,
    day: (() => {
      if (!row.start_date) return 1;
      const d = new Date(row.start_date);
      return Number.isNaN(d.getTime()) ? 1 : d.getUTCDate();
    })(),
    days: safeType === "certificato" ? 3 : 1,
    educator,
    capacity: row.capacity || 20,
    enrolled,
    minStudents: minStud,
    price,
    revenue: Math.round(rev),
    costs,
    totalCost,
    margin: Math.round(rev - totalCost),
    status,
    statusLabel: STATUS_META[status].label,
    statusTone: STATUS_META[status].tone,
    lifecycle: row.lifecycle,
    students,
    program,
    whatsappLink: "",
    shareLink: "",
    notebook: {
      adminNotes: nb.adminNotes ?? [],
      plannedAction: nb.plannedAction ?? null,
      tags: nb.tags ?? [],
      reasoning: nb.reasoning ?? "",
    },
    cancelled: Boolean(nbRaw.cancelled),
    cancelReason: (nbRaw.cancelReason as string | undefined) ?? null,
  };
}

// ── exam templates (question bank imported from Airtable) ────────────────────
interface ExamTemplateQuestionJson {
  prompt: string;
  weight?: number;
  choices: Array<{ text: string; correct: boolean }>;
}
interface ExamTemplateMiniTestJson {
  day: number;
  name?: string;
  topic?: string;
  duration?: number;
  questions?: ExamTemplateQuestionJson[];
}
interface ExamTemplateRow {
  id: number;
  family: string;
  name: string;
  data: {
    source?: string;
    questions?: ExamTemplateQuestionJson[];
    miniTests?: ExamTemplateMiniTestJson[];
  };
}

/** Default empty per-day tests when none are stored yet: Nihonshu=3, Shochu=2. */
function defaultMiniTests(family: ExamFamily): ExamTemplateMiniTestJson[] {
  const days = family === "shochu" ? 2 : 3;
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    name: `Test day ${i + 1}`,
    topic: "",
    duration: 10,
    questions: [],
  }));
}

function examTemplateRowToDomain(row: ExamTemplateRow): ExamTemplate {
  // DB exam_templates.family is 'certificato'|'shochu'; domain ExamFamily is
  // 'nihonshu'|'shochu' (nihonshu = the certified sake exam).
  const family: ExamFamily = row.family === "shochu" ? "shochu" : "nihonshu";
  const cats = family === "shochu" ? SHOCHU_CATS : NIHONSHU_CATS;
  const mapQuestions = (
    raw: ExamTemplateQuestionJson[],
    keyPrefix: string,
  ): ExamQuestion[] =>
    raw.map((q, i) => {
      const options = q.choices.map((c) => c.text);
      const correct = q.choices
        .map((c, idx) => (c.correct ? idx : -1))
        .filter((x) => x >= 0);
      const type: ExamQuestionType = correct.length > 1 ? "multi" : "single";
      return {
        id: `${keyPrefix}-${i}`,
        // No category data in the source bank; distribute round-robin so each
        // category shows some questions. Admins can re-categorise later.
        cat: cats[i % cats.length].id,
        type,
        important: false,
        lang: "it",
        text: q.prompt,
        points: q.weight ?? 1,
        options,
        correct,
      };
    });

  const questions = mapQuestions(row.data?.questions ?? [], `q-${row.id}`);
  const miniSource =
    row.data?.miniTests && row.data.miniTests.length > 0
      ? row.data.miniTests
      : defaultMiniTests(family);
  const miniTests = miniSource.map((m) => ({
    day: m.day,
    name: m.name ?? `Test day ${m.day}`,
    topic: m.topic ?? "",
    duration: m.duration ?? 10,
    questions: mapQuestions(m.questions ?? [], `q-${row.id}-d${m.day}`),
  }));

  return {
    family,
    label: row.name,
    finalExam: {
      name: row.name,
      cats,
      questions,
      totalQuestions: questions.length,
      duration: 60,
      thresholds: { pass: EXAM_THRESHOLDS.pass, retrial: EXAM_THRESHOLDS.retrial },
    },
    miniTests,
    feedback: { name: "Feedback", questions: [] },
  };
}

// material_template_days/sakes/extras come back via nested select.
interface MaterialTemplateWithChildren extends MaterialTemplateRow {
  days?: Array<{
    id: number;
    day_no: number;
    name: string;
    position: number;
    sakes?: Array<{
      id: number;
      code: string | null;
      name: string;
      type: string | null;
      sakagura: string | null;
      size_ml: number | null;
      cost_cents: number;
      qty: number;
      note: string | null;
      position: number;
    }>;
  }>;
  extras?: Array<{
    id: number;
    label: string;
    value_cents: number;
    per: "iscritto" | "corso";
  }>;
}

/** Coerce a display date string ("—", "12 Mar 2026", ISO) to ISO or null.
 *  Date-only strings are parsed as UTC midnight to avoid an off-by-one shift. */
function toTimestampOrNull(s: string | null | undefined): string | null {
  if (!s || s === "—") return null;
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
  const d = new Date(isoDateOnly ? `${s.trim()}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Render a timestamptz back to a friendly display string ("12 mar 2026"). */
function formatLastUsed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(d)
    .replace(".", "");
}

function materialTemplateRowToDomain(
  row: MaterialTemplateWithChildren,
): MaterialTemplate {
  const costs = (row.costs ?? {}) as Partial<MaterialCosts>;
  const def = defaultMaterialCosts(row.type);
  return {
    id: row.external_id ?? `db-${row.id}`,
    name: row.name,
    type: row.type,
    description: row.description ?? "",
    days: (row.days ?? [])
      .sort((a, b) => a.position - b.position || a.day_no - b.day_no)
      .map((d) => ({
        day: d.day_no,
        name: d.name,
        sakes: (d.sakes ?? [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            code: s.code ?? "",
            name: s.name,
            type: s.type ?? "",
            sakagura: s.sakagura ?? "",
            size: s.size_ml ?? 0,
            cost: s.cost_cents / 100,
            qty: s.qty,
            note: s.note ?? undefined,
          })),
      })),
    materiali: {
      educatorPerDay: costs.educatorPerDay ?? def.educatorPerDay,
      gestionePerDay: costs.gestionePerDay ?? def.gestionePerDay,
      diplomaPerStudent: costs.diplomaPerStudent ?? def.diplomaPerStudent,
      libroPerStudent: costs.libroPerStudent ?? def.libroPerStudent,
      location: costs.location ?? 0,
      foodPairing: costs.foodPairing ?? 0,
      cocktailFee: costs.cocktailFee ?? 0,
      accommodation: costs.accommodation ?? 0,
      transport: costs.transport ?? 0,
      adv: costs.adv ?? 0,
      extra: (row.extras ?? []).map((x) => ({
        id: `ex-${x.id}`,
        label: x.label,
        value: x.value_cents / 100,
        per: x.per,
      })),
    },
    lastUsed: formatLastUsed(row.last_used_at),
    uses: row.uses,
    createdBy: row.created_by ?? "",
  };
}

// ============================================================================
// Factory
// ============================================================================

export async function createSupabaseDataSource(): Promise<DataSource> {
  // Server client — bound to the current request's session. Used for reads.
  // Service client — bypasses RLS. Used for mutations from server actions
  // that act on behalf of the operator (notifications log, admin settings,
  // and imports run by trusted scripts).
  const sb: DB = await getSupabaseServerClient();
  const svc: DB = getSupabaseServiceClient();

  // ─── users ─────────────────────────────────────────────────────────────
  const usersRepo: UserRepository = {
    async list() {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .order("first_name");
      if (error) throw error;
      return (data as ProfileRow[]).map(profileToUser);
    },

    async getById(id) {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? profileToUser(data as ProfileRow) : null;
    },

    async getCurrent() {
      const { data: authData } = await sb.auth.getUser();
      if (!authData.user) {
        // No session yet — return a synthetic placeholder so SSR pages don't
        // crash while we wire up auth (Task #18).
        return {
          id: "anonymous",
          first: "",
          last: "",
          name: "—",
          role: "Manager",
          roleKey: "manager",
          email: "",
          phone: "",
          city: "",
          position: "",
          initials: "?",
          tone: "neutral",
        };
      }
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? profileToUser(data as ProfileRow)
        : profileToUser({
            id: authData.user.id,
            email: authData.user.email ?? "",
            first_name: "",
            last_name: "",
            display_name: null,
            role: "manager",
            phone: "",
            city: "",
            position: "",
            photo_url: null,
            locale: "IT",
          });
    },

    async setCurrent() {
      // Switching user is a sign-in flow — handled by Supabase Auth, not here.
      throw new Error(
        "setCurrent is not supported with Supabase auth — use sign-in/out instead.",
      );
    },

    async updateProfile(id, patch) {
      const update: Record<string, unknown> = {};
      if (patch.first !== undefined) update.first_name = patch.first;
      if (patch.last !== undefined) update.last_name = patch.last;
      if (patch.email !== undefined) update.email = patch.email;
      if (patch.phone !== undefined) update.phone = patch.phone;
      if (patch.city !== undefined) update.city = patch.city;
      if (patch.position !== undefined) update.position = patch.position;
      if (patch.photo !== undefined) update.photo_url = patch.photo ?? null;

      const { data, error } = await svc
        .from("profiles")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return profileToUser(data as ProfileRow);
    },
  };

  // ─── educators ─────────────────────────────────────────────────────────
  // Cache quals once per request to avoid N+1 on educator lists.
  let qualsByEducator: Map<number, CourseTypeKey[]> | null = null;
  async function loadQuals() {
    if (qualsByEducator) return qualsByEducator;
    const { data, error } = await sb
      .from("educator_qualifications")
      .select("*");
    if (error) throw error;
    const map = new Map<number, CourseTypeKey[]>();
    for (const r of data as EducatorQualRow[]) {
      const list = map.get(r.educator_id) ?? [];
      list.push(r.course_type);
      map.set(r.educator_id, list);
    }
    qualsByEducator = map;
    return map;
  }

  async function resolveEducatorRow(externalOrDbId: string) {
    const isDb = externalOrDbId.startsWith("db-");
    const numericId = isDb ? Number(externalOrDbId.slice(3)) : NaN;
    const query = sb.from("educators").select("*");
    const { data, error } = isDb
      ? await query.eq("id", numericId).maybeSingle()
      : await query.eq("external_id", externalOrDbId).maybeSingle();
    if (error) throw error;
    return data as EducatorRow | null;
  }

  const educatorsRepo: EducatorRepository = {
    async list() {
      const { data, error } = await sb
        .from("educators")
        .select("*")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return (data as EducatorRow[]).map(educatorRowToDomain);
    },

    async getById(id) {
      const row = await resolveEducatorRow(id);
      return row ? educatorRowToDomain(row) : null;
    },

    async getQualifications(id) {
      const row = await resolveEducatorRow(id);
      if (!row) return [];
      const map = await loadQuals();
      return map.get(row.id) ?? [];
    },

    async setQualifications(id, types) {
      const row = await resolveEducatorRow(id);
      if (!row) throw new Error(`Educator not found: ${id}`);
      await svc
        .from("educator_qualifications")
        .delete()
        .eq("educator_id", row.id);
      if (types.length > 0) {
        const rows = types.map((t) => ({
          educator_id: row.id,
          course_type: t,
        }));
        const { error } = await svc
          .from("educator_qualifications")
          .insert(rows);
        if (error) throw error;
      }
      qualsByEducator = null;
    },

    async qualifiedFor(type) {
      const { data, error } = await sb
        .from("educators")
        .select("*, educator_qualifications!inner(course_type)")
        .eq("active", true)
        .eq("educator_qualifications.course_type", type);
      if (error) throw error;
      return (data as EducatorRow[]).map(educatorRowToDomain);
    },
  };

  // ─── corsisti ───────────────────────────────────────────────────────────
  const enrollmentSelect = `
    id,
    corso_id,
    corsista_id,
    amount_cents,
    exam_result,
    historical,
    corso:corsi (
      id, short_title, full_title, type, city, month, year, lifecycle
    )
  `;

  const corsistiRepo: CorsistaRepository = {
    async list() {
      const { data: corsistiData, error: e1 } = await sb
        .from("corsisti")
        .select("*")
        .order("full_name");
      if (e1) throw e1;
      const { data: iscrData, error: e2 } = await sb
        .from("corsi_iscrizioni")
        .select(enrollmentSelect);
      if (e2) throw e2;

      const enrollByCorsista = new Map<number, CorsistaEnrollment[]>();
      for (const i of (iscrData ?? []) as IscrizioneRow[]) {
        const e = iscrizioneToEnrollment(i);
        if (!e) continue;
        const list = enrollByCorsista.get(i.corsista_id) ?? [];
        list.push(e);
        enrollByCorsista.set(i.corsista_id, list);
      }

      return (corsistiData as CorsistaRow[])
        .filter((c) => !c.merged_into) // hide records folded into another
        .map((c) => corsistaRowToDomain(c, enrollByCorsista.get(c.id) ?? []));
    },

    async getByEmail(email) {
      const { data: c, error } = await sb
        .from("corsisti")
        .select("*")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      if (!c) return null;
      const row = c as CorsistaRow;
      const { data: iscr, error: e2 } = await sb
        .from("corsi_iscrizioni")
        .select(enrollmentSelect)
        .eq("corsista_id", row.id);
      if (e2) throw e2;
      const enrolls = ((iscr ?? []) as IscrizioneRow[])
        .map(iscrizioneToEnrollment)
        .filter((x): x is CorsistaEnrollment => x !== null);

      const { data: purch } = await sb
        .from("purchases")
        .select("cluster,subtype,delivery,product_title,amount_cents,buyer_name,ordered_at")
        .eq("corsista_id", row.id)
        .order("ordered_at", { ascending: false });
      const purchases = ((purch ?? []) as PurchaseRow[]).map(purchaseRowToDomain);

      return corsistaRowToDomain(row, enrolls, purchases);
    },
  };

  // ─── material templates ────────────────────────────────────────────────
  const materialSelect = `
    *,
    days:material_template_days (
      id, day_no, name, position,
      sakes:material_template_sakes (
        id, code, name, type, sakagura, size_ml, cost_cents, qty, note, position
      )
    ),
    extras:material_template_extras (
      id, label, value_cents, per
    )
  `;

  const materialRepo: MaterialTemplateRepository = {
    async list() {
      const { data, error } = await sb
        .from("material_templates")
        .select(materialSelect)
        .order("name");
      if (error) throw error;
      return (data as MaterialTemplateWithChildren[]).map(
        materialTemplateRowToDomain,
      );
    },

    async getById(id) {
      const isDb = id.startsWith("db-");
      const numericId = isDb ? Number(id.slice(3)) : NaN;
      const query = sb.from("material_templates").select(materialSelect);
      const { data, error } = isDb
        ? await query.eq("id", numericId).maybeSingle()
        : await query.eq("external_id", id).maybeSingle();
      if (error) throw error;
      return data
        ? materialTemplateRowToDomain(data as MaterialTemplateWithChildren)
        : null;
    },

    async save(template) {
      const externalId = template.id.startsWith("db-") ? null : template.id;
      const numericId = template.id.startsWith("db-")
        ? Number(template.id.slice(3))
        : null;

      const payload = {
        external_id: externalId,
        name: template.name,
        type: template.type,
        description: template.description,
        costs: {
          educatorPerDay: template.materiali.educatorPerDay,
          gestionePerDay: template.materiali.gestionePerDay,
          diplomaPerStudent: template.materiali.diplomaPerStudent,
          libroPerStudent: template.materiali.libroPerStudent,
          location: template.materiali.location,
          foodPairing: template.materiali.foodPairing,
          cocktailFee: template.materiali.cocktailFee,
          accommodation: template.materiali.accommodation,
          transport: template.materiali.transport,
          adv: template.materiali.adv,
        },
        uses: template.uses,
        // `lastUsed` is a display string ("—", "12 Mar 2026"); the column is a
        // timestamptz. Coerce to a valid ISO timestamp or null — otherwise
        // Postgres rejects placeholders (error 22007) and the whole save fails.
        last_used_at: toTimestampOrNull(template.lastUsed),
      };

      const upsertResult = numericId
        ? await svc
            .from("material_templates")
            .update(payload)
            .eq("id", numericId)
            .select("id")
            .single()
        : await svc
            .from("material_templates")
            .upsert(payload, { onConflict: "external_id" })
            .select("id")
            .single();
      if (upsertResult.error) throw upsertResult.error;
      const templateId = (upsertResult.data as { id: number }).id;

      // Children: replace strategy (simple, correct, robust to renumbering).
      await svc
        .from("material_template_days")
        .delete()
        .eq("template_id", templateId);
      await svc
        .from("material_template_extras")
        .delete()
        .eq("template_id", templateId);

      for (let i = 0; i < template.days.length; i++) {
        const d = template.days[i];
        const { data: dayInsert, error } = await svc
          .from("material_template_days")
          .insert({
            template_id: templateId,
            day_no: d.day,
            name: d.name,
            position: i,
          })
          .select("id")
          .single();
        if (error) throw error;
        const dayId = (dayInsert as { id: number }).id;
        if (d.sakes.length > 0) {
          const sakeRows = d.sakes.map((s, j) => ({
            day_id: dayId,
            code: s.code,
            name: s.name,
            type: s.type,
            sakagura: s.sakagura,
            size_ml: Math.round(s.size) || 0,
            cost_cents: Math.round(s.cost * 100),
            qty: Math.max(1, Math.round(s.qty) || 1),
            note: s.note ?? null,
            position: j,
          }));
          const { error: sakeErr } = await svc
            .from("material_template_sakes")
            .insert(sakeRows);
          if (sakeErr) throw sakeErr;
        }
      }
      if (template.materiali.extra && template.materiali.extra.length > 0) {
        const extraRows = template.materiali.extra.map((x) => ({
          template_id: templateId,
          label: x.label,
          value_cents: Math.round(x.value * 100),
          per: x.per,
        }));
        const { error: extraErr } = await svc
          .from("material_template_extras")
          .insert(extraRows);
        if (extraErr) throw extraErr;
      }
    },

    async remove(id) {
      const isDb = id.startsWith("db-");
      const numericId = isDb ? Number(id.slice(3)) : NaN;
      const q = svc.from("material_templates").delete();
      const { error } = isDb
        ? await q.eq("id", numericId)
        : await q.eq("external_id", id);
      if (error) throw error;
    },
  };

  // ─── settings ──────────────────────────────────────────────────────────
  const settingsRepo: SettingsRepository = {
    async getThresholds() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "dash_thresholds")
        .maybeSingle();
      if (error) throw error;
      const value = (data?.value as Partial<DashThresholds> | undefined) ?? {};
      return { ...DEFAULT_THRESHOLDS, ...value };
    },

    async setThresholds(patch) {
      const current = await this.getThresholds();
      const next = { ...current, ...patch };
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "dash_thresholds", value: next },
          { onConflict: "key" },
        );
      if (error) throw error;
      return next;
    },

    async getDismissedNotifications() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "dismissed_notifications")
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as { ids?: string[] } | undefined;
      return value?.ids ?? [];
    },

    async setNotificationDismissed(id, dismissed) {
      const current = new Set(await this.getDismissedNotifications());
      if (dismissed) current.add(id);
      else current.delete(id);
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "dismissed_notifications", value: { ids: [...current] } },
          { onConflict: "key" },
        );
      if (error) throw error;
    },

    async getStockAlerts() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "stock_alerts")
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as { alerts?: StockAlert[] } | undefined;
      return value?.alerts ?? [];
    },

    async setStockAlerts(alerts) {
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "stock_alerts", value: { alerts } },
          { onConflict: "key" },
        );
      if (error) throw error;
    },
  };

  // ─── stubs (return safe empty shape until live mapping lands) ──────────
  // Numeric educator id → domain Educator (for joining onto courses).
  let eduByNumId: Map<number, Educator> | null = null;
  async function loadEducatorsMap() {
    if (eduByNumId) return eduByNumId;
    const { data } = await sb.from("educators").select("*");
    const map = new Map<number, Educator>();
    for (const e of (data ?? []) as EducatorRow[])
      map.set(e.id, educatorRowToDomain(e));
    eduByNumId = map;
    return map;
  }

  async function buildFullCourse(row: CorsoRow): Promise<Course> {
    const eduMap = await loadEducatorsMap();
    const educator =
      row.educator_id != null
        ? (eduMap.get(row.educator_id) ?? placeholderEducator())
        : placeholderEducator();

    // Students + revenue + exam outcomes from enrollments (with Shopify order /
    // discount / payment / ticket fields, populated by the sync). Falls back to
    // the base columns if the enrichment migration hasn't been applied yet, so
    // the iscritti list never disappears.
    const RICH_ISCR =
      "corsista_id,amount_cents,exam_result,order_name,order_date,discount_code,discount_cents,financial_status,line_item_id,buyer_name,corsista:corsisti(full_name,email,phone,has_whatsapp)";
    const BASE_ISCR =
      "corsista_id,amount_cents,exam_result,corsista:corsisti(full_name,email,phone,has_whatsapp)";
    const richRes = await sb
      .from("corsi_iscrizioni")
      .select(RICH_ISCR)
      .eq("corso_id", row.id);
    const iscr = richRes.error
      ? (
          await sb
            .from("corsi_iscrizioni")
            .select(BASE_ISCR)
            .eq("corso_id", row.id)
        ).data
      : richRes.data;
    type IscrJoin = {
      corsista_id: number;
      amount_cents: number;
      exam_result: "passed" | "retrial" | "failed" | null;
      order_name: string | null;
      order_date: string | null;
      discount_code: string | null;
      discount_cents: number | null;
      financial_status: string | null;
      line_item_id: number | null;
      buyer_name: string | null;
      corsista:
        | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean }
        | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean }[]
        | null;
    };
    const rows = (iscr ?? []) as unknown as IscrJoin[];

    // Duplicate detection ("doppio"): how many course tickets each person holds,
    // from purchases matched on the course product title.
    const ticketCount = new Map<number, number>();
    const { data: pur } = await sb
      .from("purchases")
      .select("corsista_id")
      .eq("cluster", "corso")
      .eq("product_title", row.full_title);
    for (const p of (pur ?? []) as { corsista_id: number }[]) {
      ticketCount.set(p.corsista_id, (ticketCount.get(p.corsista_id) ?? 0) + 1);
    }

    let revenue = 0;
    const examResults = { passed: 0, retrial: 0, failed: 0 };
    const students: Student[] = rows.map((r) => {
      if (r.exam_result) examResults[r.exam_result]++;
      const c = Array.isArray(r.corsista) ? r.corsista[0] : r.corsista;
      // amount_cents is the gross line price; discount_cents is the discount
      // value. Net paid = gross − discount (clamped at 0 for 100%-off codes).
      const gross = (r.amount_cents || 0) / 100;
      const discountValue = (r.discount_cents || 0) / 100;
      const paid = Math.max(gross - discountValue, 0);
      revenue += paid;
      const participant = c?.full_name ?? "—";
      const buyer = r.buyer_name;
      const mismatch = Boolean(
        buyer && buyer.trim().toLowerCase() !== participant.trim().toLowerCase(),
      );
      const tickets = ticketCount.get(r.corsista_id) ?? 1;
      return {
        name: participant,
        email: c?.email ?? "",
        phone: c?.phone ?? "",
        orderNumber: r.order_name ?? "",
        orderDate: r.order_date ?? "",
        amount: paid,
        grossAmount: gross,
        discountCode: r.discount_code,
        discountValue,
        paymentStatus: r.financial_status,
        ticketCode: r.line_item_id != null ? String(r.line_item_id) : null,
        buyerName: buyer,
        isDuplicate: tickets > 1,
        tickets,
        hasWhatsApp: c?.has_whatsapp ?? false,
        nameMismatch: mismatch,
        registrationName: mismatch ? buyer : null,
      };
    });

    // Program from days + sake.
    const { data: giorni } = await sb
      .from("corsi_giorni")
      .select(
        "day_no,name,sakes:corsi_sake(code,name,type,sakagura,size_ml,cost_cents,qty,note,position)",
      )
      .eq("corso_id", row.id)
      .order("day_no");
    type GiornoJoin = {
      day_no: number;
      name: string;
      sakes?: Array<{
        code: string | null;
        name: string;
        type: string | null;
        sakagura: string | null;
        size_ml: number | null;
        cost_cents: number;
        qty: number;
        note: string | null;
        position: number;
      }>;
    };
    const program: ProgramDay[] = ((giorni ?? []) as GiornoJoin[]).map((g) => ({
      day: g.day_no,
      name: g.name,
      sakes: (g.sakes ?? [])
        .sort((a, b) => a.position - b.position)
        .map<Sake>((s) => ({
          code: s.code ?? "",
          name: s.name,
          type: s.type ?? "",
          sakagura: s.sakagura ?? "",
          size: s.size_ml ?? 0,
          cost: s.cost_cents / 100,
          qty: s.qty,
          note: s.note ?? undefined,
        })),
    }));

    const course = corsoRowToDomain(row, educator, students.length, revenue, students, program);
    const totalExam = examResults.passed + examResults.retrial + examResults.failed;
    if (totalExam > 0) course.examResults = examResults;
    return course;
  }

  const coursesRepo: CourseRepository = {
    async list(filter) {
      let q = sb.from("corsi").select("*");
      if (filter?.lifecycle) {
        const lc = Array.isArray(filter.lifecycle) ? filter.lifecycle : [filter.lifecycle];
        q = q.in("lifecycle", lc);
      }
      if (filter?.type) {
        const ty = Array.isArray(filter.type) ? filter.type : [filter.type];
        q = q.in("type", ty);
      }
      const { data, error } = await q
        .order("year", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const corsoRows = (data ?? []) as CorsoRow[];

      // Aggregate enrolled + revenue per course (one pass over enrollments).
      const { data: iscr } = await sb
        .from("corsi_iscrizioni")
        .select("corso_id,amount_cents,discount_cents")
        .limit(5000);
      const agg = new Map<number, { n: number; rev: number }>();
      for (const i of (iscr ?? []) as {
        corso_id: number;
        amount_cents: number;
        discount_cents: number | null;
      }[]) {
        const a = agg.get(i.corso_id) ?? { n: 0, rev: 0 };
        a.n++;
        // Net paid = gross − discount (mirror buildFullCourse), never negative.
        a.rev += Math.max((i.amount_cents || 0) - (i.discount_cents || 0), 0) / 100;
        agg.set(i.corso_id, a);
      }

      const eduMap = await loadEducatorsMap();
      let courses = corsoRows.map((r) => {
        const a = agg.get(r.id) ?? { n: 0, rev: 0 };
        const edu =
          r.educator_id != null
            ? (eduMap.get(r.educator_id) ?? placeholderEducator())
            : placeholderEducator();
        return corsoRowToDomain(r, edu, a.n, a.rev, [], []);
      });

      if (filter?.status) {
        const st = Array.isArray(filter.status) ? filter.status : [filter.status];
        courses = courses.filter((c) => st.includes(c.status));
      }
      return courses;
    },

    async getById(id) {
      const { data, error } = await sb
        .from("corsi")
        .select("*")
        .eq("id", Number(id))
        .maybeSingle();
      if (error) throw error;
      return data ? buildFullCourse(data as CorsoRow) : null;
    },

    async getByHandle(handle) {
      const { data, error } = await sb
        .from("corsi")
        .select("*")
        .eq("handle", handle)
        .maybeSingle();
      if (error) throw error;
      return data ? buildFullCourse(data as CorsoRow) : null;
    },

    async update(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.lifecycle !== undefined) upd.lifecycle = patch.lifecycle;
      if (patch.status !== undefined) upd.status = patch.status;
      if (patch.notebook !== undefined) upd.notebook = patch.notebook;
      if (patch.capacity !== undefined) upd.capacity = patch.capacity;
      const { data, error } = await svc
        .from("corsi")
        .update(upd)
        .eq("id", Number(id))
        .select("*")
        .single();
      if (error) throw error;
      return buildFullCourse(data as CorsoRow);
    },
  };

  const examsRepo: ExamRepository = {
    async getByCourseId() {
      return null;
    },
    async resultsByCourseId() {
      return [];
    },
    async liveByCourseId() {
      return [];
    },
  };

  const examTemplatesRepo: ExamTemplateRepository = {
    async list() {
      const { data, error } = await sb
        .from("exam_templates")
        .select("id,family,name,data")
        .order("id");
      if (error) throw error;
      return (data as ExamTemplateRow[]).map(examTemplateRowToDomain);
    },
    async getByFamily(family) {
      const { data, error } = await sb
        .from("exam_templates")
        .select("id,family,name,data")
        .eq("family", family)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? examTemplateRowToDomain(data as ExamTemplateRow) : null;
    },
  };

  // ─── notifications ─────────────────────────────────────────────────────
  // Once coursesRepo returns real data, the same registry powers Supabase
  // notifications automatically — no other change needed.
  const notificationsService: NotificationService = {
    async list(): Promise<Notification[]> {
      const courses = await coursesRepo.list();
      const quals = await loadQuals();
      // Resolve the educator's domain id (external_id slug OR "db-<n>") back to
      // the numeric educators.id that quals is keyed by. Without this, every
      // course taught by an external_id educator falsely fired educator-mismatch.
      const eduMap = await loadEducatorsMap(); // Map<number, Educator>
      const numIdByDomainId = new Map<string, number>();
      for (const [numId, edu] of eduMap) numIdByDomainId.set(edu.id, numId);
      const isQualified = (educatorDomainId: string, type: CourseTypeKey) => {
        const numId = educatorDomainId.startsWith("db-")
          ? Number(educatorDomainId.slice(3))
          : numIdByDomainId.get(educatorDomainId);
        if (numId == null || Number.isNaN(numId)) return false;
        return (quals.get(numId) ?? []).includes(type);
      };
      const current = await usersRepo.getCurrent();
      const dismissed = new Set(await settingsRepo.getDismissedNotifications());
      const notifs = computeNotifications({ courses, isQualified });
      return notifs.map((n) => ({
        ...n,
        email: n.email || current.email,
        dismissed: dismissed.has(n.id),
      }));
    },
  };

  return {
    users: usersRepo,
    corsisti: corsistiRepo,
    educators: educatorsRepo,
    materialTemplates: materialRepo,
    courses: coursesRepo,
    exams: examsRepo,
    examTemplates: examTemplatesRepo,
    settings: settingsRepo,
    notifications: notificationsService,
  };
}
