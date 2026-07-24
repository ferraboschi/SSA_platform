import "server-only";

import type { CorsistaEnrollment } from "@/lib/domain";
import type { CorsistaRepository } from "../repository";
import {
  corsistaRowToDomain,
  iscrizioneToEnrollment,
  purchaseRowToDomain,
} from "./mappers";
import { paginateAll, selectWithFallback } from "./query-helpers";
import type { CorsistaRow, IscrizioneRow, PurchaseRow } from "./rows";
import type { RepoContext } from "./context";

export function makeCorsistiRepo(ctx: RepoContext): CorsistaRepository {
  const { sb } = ctx;

  const enrollmentCorso = `corso:corsi (
      id, short_title, full_title, type, city, month, year, lifecycle
    )`;
  // `exam_score_pct`/`financial_status` may not exist pre-migration → fall
  // back without them (every row then counts as paid, the legacy rule).
  const enrollmentSelect = `id, corso_id, corsista_id, amount_cents, discount_cents, financial_status, exam_result, exam_score_pct, historical, annullata_at, ${enrollmentCorso}`;
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
      const iscrRows = await paginateAll<IscrizioneRow>(
        async (from, to) => {
          let { data: page, error: e2 } = await sb
            .from("corsi_iscrizioni")
            .select(iscrSelect)
            .range(from, to);
          if (e2 && iscrSelect === enrollmentSelect) {
            // pre-migration: retry without exam_score_pct
            iscrSelect = enrollmentSelectBase;
            ({ data: page, error: e2 } = await sb
              .from("corsi_iscrizioni")
              .select(iscrSelect)
              .range(from, to));
          }
          return {
            data: (page ?? []) as unknown as IscrizioneRow[],
            error: e2,
          };
        },
        { pageSize: ISCR_PAGE },
      );
      for (const i of iscrRows) {
        // Removed-from-course seats leave the person's spend/history/returning
        // rollup — same rule as the course-detail readers (and a transfer would
        // otherwise double-count: origin annullata + new dest both 'paid').
        if ((i as { annullata_at?: string | null }).annullata_at) continue;
        const e = iscrizioneToEnrollment(i);
        if (!e) continue;
        e.certificateUrl = certMap.get(`${i.corsista_id}-${i.corso_id}`) ?? null;
        const list = enrollByCorsista.get(i.corsista_id) ?? [];
        list.push(e);
        enrollByCorsista.set(i.corsista_id, list);
      }

      return (corsistiData as CorsistaRow[])
        .filter((c) => !c.merged_into) // hide records folded into another
        // Hide multi-ticket PLACEHOLDER attendees ("Posto N — da completare"):
        // real enrollment seats, not real people until completed, so they must
        // not inflate the corsisti list/count. (Field absent pre-migration → kept.)
        .filter((c) => !(c as { placeholder?: boolean }).placeholder)
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
      // pre-migration: retry without exam_score_pct if the rich select errors.
      const res = await selectWithFallback<IscrizioneRow>(
        (columns) =>
          sb
            .from("corsi_iscrizioni")
            .select(columns)
            .eq("corsista_id", row.id) as unknown as Promise<{
            data: IscrizioneRow[] | null;
            error: unknown;
          }>,
        enrollmentSelect,
        enrollmentSelectBase,
      );
      if (res.error) throw res.error;
      const iscr = res.data;
      const certMap = await loadCertMap();
      const enrolls = ((iscr ?? []) as IscrizioneRow[])
        .filter((i) => !(i as { annullata_at?: string | null }).annullata_at)
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

  return corsistiRepo;
}
