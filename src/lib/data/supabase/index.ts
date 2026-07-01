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
//
// Row types live in ./rows; pure DB-row→domain mappers live in ./mappers.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_THRESHOLDS } from "@/lib/domain";
import type {
  CorsistaEnrollment,
  Course,
  CourseCompanion,
  CourseTypeKey,
  DashThresholds,
  Educator,
  Notification,
  ProgramDay,
  Sake,
  StockAlert,
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
import {
  aggregateCourseEnrollments,
  buildStudentsFromEnrollments,
  countTicketsByCorsista,
  groupAppliedCreditsByCourse,
  sumAppliedCreditsForCourse,
} from "./aggregations";
import {
  corsistaRowToDomain,
  corsoRowToDomain,
  educatorRowToDomain,
  examTemplateRowToDomain,
  examTemplateToData,
  iscrizioneToEnrollment,
  materialTemplateRowToDomain,
  placeholderEducator,
  profileToUser,
  purchaseRowToDomain,
} from "./mappers";
import type {
  CorsistaRow,
  CorsoRow,
  EducatorQualRow,
  EducatorRow,
  ExamTemplateRow,
  IscrizioneRow,
  MaterialTemplateWithChildren,
  ProfileRow,
  PurchaseRow,
} from "./rows";

type DB = SupabaseClient;

// Revenue is money COLLECTED, so it counts only fully-paid orders. The rule
// (isPaidRevenue) and the net-paid formula (gross − discount, clamped at 0)
// live in @/lib/economics/revenue — the single source of truth.

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
      let authUser = null;
      try {
        const { data: authData } = await sb.auth.getUser();
        authUser = authData.user;
      } catch {
        authUser = null;
      }
      if (!authUser) {
        // No session — return a ZERO-CAPABILITY placeholder so SSR pages don't
        // crash, but every role check denies it. (Pages are already redirected
        // to /login by the (app) layout; server actions self-authorize on this.)
        return {
          id: "anonymous",
          first: "",
          last: "",
          name: "—",
          role: "Ospite",
          roleKey: "guest",
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
        .eq("id", authUser.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? profileToUser(data as ProfileRow)
        : profileToUser({
            id: authUser.id,
            email: authUser.email ?? "",
            first_name: "",
            last_name: "",
            display_name: null,
            // Least privilege: a signed-in user whose profile row hasn't been
            // created yet (race with the AFTER INSERT trigger) must NOT default
            // to manager — that would be a transient privilege escalation.
            role: "guest",
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
  const enrollmentCorso = `corso:corsi (
      id, short_title, full_title, type, city, month, year, lifecycle
    )`;
  // `exam_score_pct` may not exist pre-migration → fall back without it.
  const enrollmentSelect = `id, corso_id, corsista_id, amount_cents, discount_cents, exam_result, exam_score_pct, historical, ${enrollmentCorso}`;
  const enrollmentSelectBase = `id, corso_id, corsista_id, amount_cents, discount_cents, exam_result, historical, ${enrollmentCorso}`;

  // Official certificate PDFs (Supabase Storage), keyed "<corsistaId>-<corsoId>".
  // Stored in settings_kv by the import; cached per request.
  let _certMap: Map<string, string> | null = null;
  async function loadCertMap() {
    if (_certMap) return _certMap;
    const m = new Map<string, string>();
    try {
      const { data } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "exam_certificates")
        .maybeSingle();
      const items =
        (data?.value as { items?: { corsistaId: number; corsoId: number; url: string }[] })
          ?.items ?? [];
      for (const it of items) m.set(`${it.corsistaId}-${it.corsoId}`, it.url);
    } catch {
      /* settings_kv unavailable — no certificates */
    }
    _certMap = m;
    return m;
  }

  const corsistiRepo: CorsistaRepository = {
    async list() {
      const { data: corsistiData, error: e1 } = await sb
        .from("corsisti")
        .select("*")
        .order("full_name");
      if (e1) throw e1;

      // PAGINATE — PostgREST caps a single request (~1000 rows) and there are
      // >6500 enrollments; a flat select silently truncated the per-corsista
      // enrollment lists (and their spend totals). Page in 1000-row batches.
      const certMap = await loadCertMap();
      const enrollByCorsista = new Map<number, CorsistaEnrollment[]>();
      const ISCR_PAGE = 1000;
      let iscrSelect = enrollmentSelect; // drops to base if exam_score_pct absent
      for (let from = 0; ; from += ISCR_PAGE) {
        let { data: page, error: e2 } = await sb
          .from("corsi_iscrizioni")
          .select(iscrSelect)
          .range(from, from + ISCR_PAGE - 1);
        if (e2 && iscrSelect === enrollmentSelect) {
          // pre-migration: retry without exam_score_pct
          iscrSelect = enrollmentSelectBase;
          ({ data: page, error: e2 } = await sb
            .from("corsi_iscrizioni")
            .select(iscrSelect)
            .range(from, from + ISCR_PAGE - 1));
        }
        if (e2) throw e2;
        const rows = (page ?? []) as unknown as IscrizioneRow[];
        for (const i of rows) {
          const e = iscrizioneToEnrollment(i);
          if (!e) continue;
          e.certificateUrl = certMap.get(`${i.corsista_id}-${i.corso_id}`) ?? null;
          const list = enrollByCorsista.get(i.corsista_id) ?? [];
          list.push(e);
          enrollByCorsista.set(i.corsista_id, list);
        }
        if (rows.length < ISCR_PAGE) break;
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
      let res = await sb
        .from("corsi_iscrizioni")
        .select(enrollmentSelect)
        .eq("corsista_id", row.id);
      if (res.error) {
        // pre-migration: retry without exam_score_pct
        res = (await sb
          .from("corsi_iscrizioni")
          .select(enrollmentSelectBase)
          .eq("corsista_id", row.id)) as typeof res;
      }
      if (res.error) throw res.error;
      const iscr = res.data;
      const certMap = await loadCertMap();
      const enrolls = ((iscr ?? []) as IscrizioneRow[])
        .map((i) => {
          const e = iscrizioneToEnrollment(i);
          if (e) e.certificateUrl = certMap.get(`${i.corsista_id}-${i.corso_id}`) ?? null;
          return e;
        })
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
        // NOTE: `last_used_at` is intentionally NOT written here. The domain
        // `lastUsed` is a humanized display string ("02 giu 2026") that does
        // NOT round-trip into a timestamptz — writing it back would null/shift
        // the column on every edit. Omitting it preserves the DB value on
        // updates; new templates default to null. The "last used" timestamp is
        // owned by the usage path (when a course adopts the template).
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
            size_ml: Math.round(Number(s.size)) || 0,
            // NaN-safe: a sake with an undefined/empty cost must not blow up the
            // whole template save (which re-inserts every sake on each edit).
            cost_cents: Math.round((Number(s.cost) || 0) * 100),
            qty: Math.max(1, Math.round(Number(s.qty)) || 1),
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
      "id,corsista_id,amount_cents,exam_result,order_name,order_date,discount_code,discount_cents,financial_status,line_item_id,buyer_name,corsista:corsisti(full_name,email,phone,has_whatsapp)";
    const BASE_ISCR =
      "id,corsista_id,amount_cents,exam_result,corsista:corsisti(full_name,email,phone,has_whatsapp)";
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
      id: number;
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
    const { data: pur } = await sb
      .from("purchases")
      .select("corsista_id")
      .eq("cluster", "corso")
      .eq("product_title", row.full_title);
    const ticketCount = countTicketsByCorsista(
      (pur ?? []) as { corsista_id: number }[],
      row.full_title,
    );

    // Companion attendees ("doppio") per enrollment. Degrades gracefully to an
    // empty map if the corsi_partecipanti table/migration is not yet applied.
    const companionsByIscr = new Map<number, CourseCompanion[]>();
    {
      const { data: partData, error: partErr } = await sb
        .from("corsi_partecipanti")
        .select("id, iscrizione_id, full_name, phone")
        .eq("corso_id", row.id);
      if (!partErr) {
        for (const p of (partData ?? []) as {
          id: number;
          iscrizione_id: number | null;
          full_name: string | null;
          phone: string | null;
        }[]) {
          if (p.iscrizione_id == null) continue;
          (companionsByIscr.get(p.iscrizione_id) ??
            companionsByIscr.set(p.iscrizione_id, []).get(p.iscrizione_id)!).push({
            id: p.id,
            name: p.full_name ?? "",
            phone: p.phone ?? "",
          });
        }
      }
    }

    // Roster + collected revenue + exam tally, computed from the enrollment rows.
    // The euro-space per-student net (gross − discountValue), the isPaidRevenue
    // gate, and each student's companions all live in the pure aggregation.
    const { students, revenue, examResults } = buildStudentsFromEnrollments(
      rows,
      ticketCount,
      companionsByIscr,
    );

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

    // Transfer credits APPLIED to this course (deferred liability from a
    // cancelled course, moved here). Recognised as revenue only when this course
    // is delivered — the mapper gates that on lifecycle "passato". Read via the
    // SERVICE client: corsi_crediti is service-role only (RLS, no policy), so the
    // request-bound `sb` would see zero rows. Degrades to 0 if the table isn't
    // there yet (pre-migration).
    let recognizedCredits = 0;
    {
      const { data: credRows, error: credErr } = await svc
        .from("corsi_crediti")
        .select("importo_cents")
        .eq("corso_destinazione_id", row.id)
        .eq("stato", "applicato");
      if (!credErr) {
        recognizedCredits = sumAppliedCreditsForCourse(
          (credRows ?? []) as { importo_cents: number | null }[],
        );
      }
    }

    const course = corsoRowToDomain(
      row,
      educator,
      students.length,
      revenue,
      students,
      program,
      recognizedCredits,
    );
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

      // Aggregate enrolled + revenue per course. PAGINATE — there are >6500
      // enrollments and PostgREST caps a single request (~1000 rows), so a flat
      // .limit() silently truncated totals and undercounted revenue/headcount.
      // Fetch every page (in order), then roll up once via the pure aggregation.
      const enrollAggRows: {
        corso_id: number;
        amount_cents: number;
        discount_cents: number | null;
        financial_status?: string | null;
      }[] = [];
      const ENR_PAGE = 1000;
      // `financial_status` may not exist pre-enrichment migration → fall back to
      // the base columns (revenue then treats every enrollment as paid, as it
      // did before the paid-only rule was introduced).
      const AGG_RICH = "corso_id,amount_cents,discount_cents,financial_status";
      const AGG_BASE = "corso_id,amount_cents,discount_cents";
      let aggSelect = AGG_RICH;
      for (let from = 0; ; from += ENR_PAGE) {
        let { data: page, error: pErr } = await sb
          .from("corsi_iscrizioni")
          .select(aggSelect)
          .range(from, from + ENR_PAGE - 1);
        if (pErr && aggSelect === AGG_RICH) {
          aggSelect = AGG_BASE;
          ({ data: page, error: pErr } = await sb
            .from("corsi_iscrizioni")
            .select(aggSelect)
            .range(from, from + ENR_PAGE - 1));
        }
        if (pErr) throw pErr;
        const rows = (page ?? []) as unknown as {
          corso_id: number;
          amount_cents: number;
          discount_cents: number | null;
          financial_status?: string | null;
        }[];
        for (const i of rows) enrollAggRows.push(i);
        if (rows.length < ENR_PAGE) break;
      }
      const agg = aggregateCourseEnrollments(enrollAggRows);

      // Applied transfer credits per destination course (euros), fetched once via
      // the SERVICE client (corsi_crediti is service-role only — RLS with no
      // policy — so the request-bound `sb` would see nothing). The mapper only
      // recognises them as revenue on a DELIVERED ("passato") destination.
      // Degrades to an empty map if corsi_crediti is missing.
      let creditsByCourse = new Map<number, number>();
      {
        const { data: credRows, error: credErr } = await svc
          .from("corsi_crediti")
          .select("corso_destinazione_id,importo_cents")
          .eq("stato", "applicato")
          .not("corso_destinazione_id", "is", null);
        if (!credErr) {
          creditsByCourse = groupAppliedCreditsByCourse(
            (credRows ?? []) as {
              corso_destinazione_id: number | null;
              importo_cents: number | null;
            }[],
          );
        }
      }

      const eduMap = await loadEducatorsMap();
      let courses = corsoRows.map((r) => {
        const a = agg.get(r.id) ?? { n: 0, rev: 0 };
        const edu =
          r.educator_id != null
            ? (eduMap.get(r.educator_id) ?? placeholderEducator())
            : placeholderEducator();
        const credits = (creditsByCourse.get(r.id) ?? 0) / 100;
        return corsoRowToDomain(r, edu, a.n, a.rev, [], [], credits);
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
      // DB family is 'certificato'|'shochu'; domain is 'nihonshu'|'shochu'.
      const dbFamily = family === "shochu" ? "shochu" : "certificato";
      const { data, error } = await sb
        .from("exam_templates")
        .select("id,family,name,data")
        .eq("family", dbFamily)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? examTemplateRowToDomain(data as ExamTemplateRow) : null;
    },
    async save(template) {
      const dbFamily = template.family === "shochu" ? "shochu" : "certificato";
      // Locate the existing row for this family (service client bypasses RLS).
      const { data: existing } = await svc
        .from("exam_templates")
        .select("id,data")
        .eq("family", dbFamily)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prev = (existing?.data ?? {}) as ExamTemplateRow["data"];
      // Merge so we keep non-content metadata (count/source/version) if present.
      const nextData = { ...prev, ...examTemplateToData(template) };
      if (existing?.id) {
        const { error } = await svc
          .from("exam_templates")
          .update({ data: nextData })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await svc
          .from("exam_templates")
          .insert({ family: dbFamily, name: template.label, data: nextData });
        if (error) throw error;
      }
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
