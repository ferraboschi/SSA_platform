import "server-only";

import type {
  Course,
  CourseCompanion,
  Educator,
  ProgramDay,
  Sake,
} from "@/lib/domain";
import type { CourseRepository } from "../repository";
import {
  aggregateCourseEnrollments,
  buildStudentsFromEnrollments,
  countTicketsByCorsista,
  groupAppliedCreditsByCourse,
  sumAppliedCreditsForCourse,
} from "./aggregations";
import { corsoRowToDomain, placeholderEducator } from "./mappers";
import { paginateAll, selectWithFallback } from "./query-helpers";
import type { CorsoRow } from "./rows";
import type { RepoContext } from "./context";

type CoursesDeps = {
  loadEducatorsMap: (ctx: RepoContext) => Promise<Map<number, Educator>>;
};

export function makeCoursesRepo(
  ctx: RepoContext,
  deps: CoursesDeps,
): CourseRepository {
  const { sb, svc } = ctx;
  const { loadEducatorsMap } = deps;

  async function buildFullCourse(row: CorsoRow): Promise<Course> {
    const eduMap = await loadEducatorsMap(ctx);
    const educator =
      row.educator_id != null
        ? (eduMap.get(row.educator_id) ?? placeholderEducator())
        : placeholderEducator();

    // Students + revenue + exam outcomes from enrollments (with Shopify order /
    // discount / payment / ticket fields, populated by the sync). Falls back to
    // the base columns if the enrichment migration hasn't been applied yet, so
    // the iscritti list never disappears.
    const RICH_ISCR =
      "id,corsista_id,amount_cents,exam_result,order_name,order_date,discount_code,discount_cents,financial_status,line_item_id,seat_index,annullata_at,buyer_name,enrolled_email,corsista:corsisti(full_name,email,phone,has_whatsapp,placeholder)";
    const BASE_ISCR =
      "id,corsista_id,amount_cents,exam_result,corsista:corsisti(full_name,email,phone,has_whatsapp)";
    const iscr = (
      await selectWithFallback<unknown>(
        (columns) =>
          sb
            .from("corsi_iscrizioni")
            .select(columns)
            .eq("corso_id", row.id) as unknown as Promise<{
            data: unknown[] | null;
            error: unknown;
          }>,
        RICH_ISCR,
        BASE_ISCR,
      )
    ).data;
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
      /** Confirmed-email snapshot (set via /conferma) — absent on the BASE
       *  pre-migration fallback, undefined then and the aggregation falls
       *  back to corsisti.email, same as everywhere else this is resolved. */
      enrolled_email?: string | null;
      seats_override?: number | null;
      seat_index?: number | null;
      corsista:
        | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean; placeholder?: boolean }
        | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean; placeholder?: boolean }[]
        | null;
    };
    const rows = (iscr ?? []) as unknown as IscrJoin[];

    // Duplicate detection ("doppio"): how many course tickets each person holds,
    // from purchases matched on the course product title — SUMMING quantity so a
    // single order line for two people counts as two seats.
    const { data: pur } = await sb
      .from("purchases")
      .select("corsista_id,quantity")
      .eq("cluster", "corso")
      .eq("product_title", row.full_title);
    const ticketCount = countTicketsByCorsista(
      (pur ?? []) as { corsista_id: number; quantity?: number | null }[],
      row.full_title,
    );

    // Staff seat-count overrides — a SEPARATE query so a pre-migration DB
    // (seats_override column absent) degrades to "no overrides" without
    // dropping the rich roster fields (a two-tier fallback on the main select
    // would lose them all). Merge onto the rows before the aggregation reads
    // r.seats_override.
    {
      const { data: ovr, error: ovrErr } = await sb
        .from("corsi_iscrizioni")
        .select("id, seats_override")
        .eq("corso_id", row.id);
      if (!ovrErr && ovr) {
        const byId = new Map<number, number | null>(
          (ovr as { id: number; seats_override: number | null }[]).map((o) => [o.id, o.seats_override]),
        );
        for (const r of rows) r.seats_override = byId.get(r.id) ?? null;
      }
    }

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

    // Seats not on a dead order — deriveLifecycle's evidence that a past-dated
    // bozza really ran (a fully refunded course must not resurrect as held).
    const liveEnrolled = rows.filter(
      (r) => !["refunded", "voided", "cancelled"].includes((r.financial_status ?? "").toLowerCase()),
    ).length;

    const course = corsoRowToDomain(
      row,
      educator,
      students.length,
      revenue,
      students,
      program,
      recognizedCredits,
      liveEnrolled,
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
      type EnrollAggRow = {
        corso_id: number;
        amount_cents: number;
        discount_cents: number | null;
        financial_status?: string | null;
        exam_result?: "passed" | "retrial" | "failed" | null;
        annullata_at?: string | null;
      };
      const ENR_PAGE = 1000;
      // `financial_status` may not exist pre-enrichment migration → fall back to
      // the base columns (revenue then treats every enrollment as paid, as it
      // did before the paid-only rule was introduced).
      const AGG_RICH = "corso_id,amount_cents,discount_cents,exam_result,financial_status,annullata_at";
      const AGG_BASE = "corso_id,amount_cents,discount_cents,exam_result";
      let aggSelect = AGG_RICH;
      const enrollAggRows = await paginateAll<EnrollAggRow>(
        async (from, to) => {
          let { data: page, error: pErr } = await sb
            .from("corsi_iscrizioni")
            .select(aggSelect)
            .range(from, to);
          if (pErr && aggSelect === AGG_RICH) {
            aggSelect = AGG_BASE;
            ({ data: page, error: pErr } = await sb
              .from("corsi_iscrizioni")
              .select(aggSelect)
              .range(from, to));
          }
          return {
            data: (page ?? []) as unknown as EnrollAggRow[],
            error: pErr,
          };
        },
        { pageSize: ENR_PAGE },
      );
      const agg = aggregateCourseEnrollments(enrollAggRows);

      // Exam-outcome tally per course from the same enrollment scan. Without
      // this, list-level consumers (educator pass-rate, archivio, month report)
      // always saw examResults = null — only the single-course path filled it.
      const examAgg = new Map<number, { passed: number; retrial: number; failed: number }>();
      for (const r of enrollAggRows) {
        if (r.annullata_at) continue; // removed-from-course seat: not part of the tally
        if (!r.exam_result) continue;
        const e =
          examAgg.get(r.corso_id) ??
          examAgg.set(r.corso_id, { passed: 0, retrial: 0, failed: 0 }).get(r.corso_id)!;
        e[r.exam_result] += 1;
      }

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

      const eduMap = await loadEducatorsMap(ctx);
      let courses = corsoRows.map((r) => {
        const a = agg.get(r.id) ?? { n: 0, nLive: 0, rev: 0 };
        const edu =
          r.educator_id != null
            ? (eduMap.get(r.educator_id) ?? placeholderEducator())
            : placeholderEducator();
        const credits = (creditsByCourse.get(r.id) ?? 0) / 100;
        const course = corsoRowToDomain(r, edu, a.n, a.rev, [], [], credits, a.nLive);
        const exams = examAgg.get(r.id);
        if (exams) course.examResults = exams;
        return course;
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

  return coursesRepo;
}
