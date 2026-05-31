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
import { DEFAULT_THRESHOLDS } from "@/lib/domain";
import type {
  Corsista,
  CorsistaEnrollment,
  CourseTypeKey,
  DashThresholds,
  Educator,
  Language,
  MaterialTemplate,
  Notification,
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

function corsistaRowToDomain(
  row: CorsistaRow,
  enrollments: CorsistaEnrollment[],
): Corsista {
  const totalSpent = enrollments.reduce((s, e) => s + e.amount, 0);
  return {
    email: row.email,
    name: row.full_name,
    phone: row.phone ?? "",
    hasWhatsApp: row.has_whatsapp,
    city: row.city ?? "",
    firstSeen: row.first_seen_at ?? "",
    courses: enrollments,
    totalSpent,
    isReturning: enrollments.length > 1,
    historical: row.historical || undefined,
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

function materialTemplateRowToDomain(
  row: MaterialTemplateWithChildren,
): MaterialTemplate {
  const costs = (row.costs ?? {}) as Partial<{
    educatorPerDay: number;
    diplomaPerStudent: number;
    libroPerStudent: number;
  }>;
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
      educatorPerDay: costs.educatorPerDay ?? 0,
      diplomaPerStudent: costs.diplomaPerStudent ?? 0,
      libroPerStudent: costs.libroPerStudent ?? 0,
      extra: (row.extras ?? []).map((x) => ({
        id: `ex-${x.id}`,
        label: x.label,
        value: x.value_cents / 100,
        per: x.per,
      })),
    },
    lastUsed: row.last_used_at ?? "",
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

      return (corsistiData as CorsistaRow[]).map((c) =>
        corsistaRowToDomain(c, enrollByCorsista.get(c.id) ?? []),
      );
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
      return corsistaRowToDomain(row, enrolls);
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
          diplomaPerStudent: template.materiali.diplomaPerStudent,
          libroPerStudent: template.materiali.libroPerStudent,
        },
        uses: template.uses,
        last_used_at: template.lastUsed || null,
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
            size_ml: s.size,
            cost_cents: Math.round(s.cost * 100),
            qty: s.qty,
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
  };

  // ─── stubs (return safe empty shape until live mapping lands) ──────────
  const coursesRepo: CourseRepository = {
    async list() {
      return [];
    },
    async getById() {
      return null;
    },
    async getByHandle() {
      return null;
    },
    async update() {
      throw new Error(
        "Supabase courseRepo.update is not yet implemented (Task #21 Shopify sync).",
      );
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
      return [];
    },
    async getByFamily() {
      return null;
    },
  };

  // ─── notifications ─────────────────────────────────────────────────────
  // Once coursesRepo returns real data, the same registry powers Supabase
  // notifications automatically — no other change needed.
  const notificationsService: NotificationService = {
    async list(): Promise<Notification[]> {
      const courses = await coursesRepo.list();
      const quals = await loadQuals();
      const isQualified = (educatorExternalId: string, type: CourseTypeKey) => {
        const isDb = educatorExternalId.startsWith("db-");
        const numId = isDb ? Number(educatorExternalId.slice(3)) : NaN;
        if (!isDb) return false; // educators carry external_id mapping
        return (quals.get(numId) ?? []).includes(type);
      };
      const current = await usersRepo.getCurrent();
      const notifs = computeNotifications({ courses, isQualified });
      return notifs.map((n) => ({
        ...n,
        email: n.email || current.email,
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
