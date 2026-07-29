import "server-only";

import type { CorsistaEnrollment, PossibleDuplicate } from "@/lib/domain";
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
      let row = c as CorsistaRow;
      // Follow a merge: a merged record is an empty shell (its enrollments,
      // purchases and history moved to the survivor). Opening it must show the
      // consolidated profile, never a misleading "0 corsi". Walk the chain with
      // a hop guard so a bad cycle can never loop forever.
      const seen = new Set<number>([row.id]);
      while (row.merged_into != null && !seen.has(row.merged_into)) {
        seen.add(row.merged_into);
        const { data: surv } = await sb
          .from("corsisti")
          .select("*")
          .eq("id", row.merged_into)
          .maybeSingle();
        if (!surv) break;
        row = surv as CorsistaRow;
      }
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

      const domain = corsistaRowToDomain(row, enrolls, purchases);
      domain.possibleDuplicates = await findLookAlikes(sb, row, enrolls.length);
      return domain;
    },
  };

  return corsistiRepo;
}

type Sb = RepoContext["sb"];
type CandRow = { id: number; email: string; full_name: string | null; phone: string | null };

/**
 * Live look-alikes of a corsista: other NON-merged records sharing the exact
 * phone or (case-insensitive) full name. Surfaced ON the profile so the operator
 * can merge (or dismiss) at the point of encounter — never auto-merged. Pairs
 * the operator marked "non è duplicato" (settings_kv reviewed_email_clusters,
 * same key format duplicatePeople uses) are skipped. Best-effort: any failure
 * yields no banner rather than breaking the profile.
 */
async function findLookAlikes(
  sb: Sb,
  row: CorsistaRow,
  selfEnrollments: number,
): Promise<PossibleDuplicate[]> {
  try {
    const phone = (row.phone ?? "").trim();
    const name = (row.full_name ?? "").trim();
    if (!phone && !name) return [];
    // Two targeted lookups (avoids .or() escaping issues with names/phones).
    const found = new Map<number, CandRow>();
    const collect = (rows: CandRow[] | null) => {
      for (const c of rows ?? []) if (c.id !== row.id) found.set(c.id, c);
    };
    if (phone) {
      const { data } = await sb
        .from("corsisti")
        .select("id,email,full_name,phone")
        .is("merged_into", null)
        .eq("phone", phone)
        .limit(20);
      collect(data as CandRow[] | null);
    }
    if (name) {
      const { data } = await sb
        .from("corsisti")
        .select("id,email,full_name,phone")
        .is("merged_into", null)
        .ilike("full_name", name)
        .limit(20);
      collect(data as CandRow[] | null);
    }
    if (found.size === 0) return [];

    // Pairs already dismissed as "not a duplicate".
    const { data: rv } = await sb
      .from("settings_kv")
      .select("value")
      .eq("key", "reviewed_email_clusters")
      .maybeSingle();
    const dismissed = new Set<string>(((rv?.value as { names?: string[] } | null)?.names) ?? []);

    // Active-seat counts for self + candidates → suggested survivor (the richer).
    const ids = [row.id, ...found.keys()];
    const { data: enrRows } = await sb
      .from("corsi_iscrizioni")
      .select("corsista_id")
      .is("annullata_at", null)
      .in("corsista_id", ids);
    const cnt = new Map<number, number>();
    for (const r of (enrRows ?? []) as { corsista_id: number }[])
      cnt.set(r.corsista_id, (cnt.get(r.corsista_id) ?? 0) + 1);
    const selfCnt = cnt.get(row.id) ?? selfEnrollments;

    const normPhone = (s: string | null) => (s ?? "").replace(/[^\d+]/g, "");
    const normName = (s: string | null) => (s ?? "").toLowerCase().trim();
    const out: PossibleDuplicate[] = [];
    for (const c of found.values()) {
      const key = "dup-" + [row.id, c.id].sort((a, b) => a - b).join("-");
      if (dismissed.has(key)) continue;
      const samePhone = !!phone && normPhone(c.phone) === normPhone(row.phone);
      const sameName = !!name && normName(c.full_name) === normName(row.full_name);
      if (!samePhone && !sameName) continue;
      const cCnt = cnt.get(c.id) ?? 0;
      const survivor = selfCnt >= cCnt ? { id: row.id, email: row.email } : { id: c.id, email: c.email };
      out.push({
        candidateId: c.id,
        name: c.full_name ?? c.email,
        email: c.email,
        reason:
          samePhone && sameName ? "stesso nome e telefono" : samePhone ? "stesso telefono" : "stesso nome",
        survivorId: survivor.id,
        dupId: survivor.id === row.id ? c.id : row.id,
        survivorEmail: survivor.email,
        dismissKey: key,
      });
    }
    return out.slice(0, 5);
  } catch {
    return [];
  }
}
