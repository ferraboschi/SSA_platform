import { getTranslations } from "@/lib/i18n/server";
import { requireNavAccess } from "@/lib/auth/guard";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getReviewedEmailClusters } from "@/lib/data/anomalie-actions";
import { AnomaliesClient } from "@/components/anomalie/AnomaliesClient";
import {
  duplicatePeople,
  repaidClusters,
  duplicateCourses,
  missingCompanions,
  fullDiscountCancelled,
  cashOnCancelled,
  openCredits,
  type CorsistaLite,
  type EnrRow,
  type CorsoLite,
  type PurchaseCorsoRow,
  type PartecipanteRow,
  type CreditoRow,
} from "@/lib/anomalie/rules";

export const dynamic = "force-dynamic";

interface AnomalyRow {
  id: number;
  email: string;
  full_name: string;
  review_note: string;
}

export default async function Page() {
  await requireNavAccess("anomalie");
  const { t } = await getTranslations();

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="page">
        <div className="card card-pad">{t.anomalie.notConfigured}</div>
      </div>
    );
  }

  const sb = await getSupabaseServerClient();
  const { data } = await sb
    .from("corsisti")
    .select("id,email,full_name,review_note")
    .not("review_note", "is", null)
    .order("full_name");

  const items = ((data ?? []) as AnomalyRow[]).map((c) => ({
    id: c.id,
    email: c.email,
    name: c.full_name,
    note: c.review_note,
  }));

  // ── Load every corsista (paginated) for duplicate detection. ──
  const all: CorsistaLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsisti")
      .select("id,full_name,email,phone,merged_into")
      .range(from, from + 999);
    if (error || !page) break;
    all.push(...(page as CorsistaLite[]));
    if (page.length < 1000) break;
  }
  const reviewed = new Set(await getReviewedEmailClusters());

  // ── Enrollments + courses (for the next two clusters) ──
  const corsistaName = new Map<number, string>(
    all.map((c) => [c.id, c.full_name ?? ""]),
  );
  const enr: EnrRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsi_iscrizioni")
      .select("id,corsista_id,corso_id,amount_cents,discount_cents")
      .is("annullata_at", null) // removed-from-course seats aren't duplicates/cash-on-cancelled
      .range(from, from + 999);
    if (error || !page) break;
    enr.push(...(page as EnrRow[]));
    if (page.length < 1000) break;
  }
  const { data: corsiData } = await sb
    .from("corsi")
    .select("id,short_title,full_title,type,delivery_mode,month,year,city,lifecycle");
  const corsoById = new Map<number, CorsoLite>(
    ((corsiData ?? []) as CorsoLite[]).map((c) => [c.id, c]),
  );

  // Enrollment counts (per corsista → survivor/sort; per course → dup badge).
  const enrPerCorsista = new Map<number, number>();
  const enrollCount = new Map<number, number>();
  for (const e of enr) {
    enrPerCorsista.set(e.corsista_id, (enrPerCorsista.get(e.corsista_id) ?? 0) + 1);
    enrollCount.set(e.corso_id, (enrollCount.get(e.corso_id) ?? 0) + 1);
  }

  // ── Pure algorithms: re-participation paid twice + duplicate courses. ──
  const repaid = repaidClusters(enr, corsoById, corsistaName);
  const dupCourses = duplicateCourses(corsoById, enrollCount);

  // ── Probable DUPLICATE PEOPLE (union-find over email / phone / name). ──
  const emailClusters = duplicatePeople(all, enrPerCorsista, reviewed);

  // ════════════════════════════════════════════════════════════════════════
  // Reconciliation rules (Phase 1–3). Each rule owns its extra query inside a
  // try/catch so a missing table/column (un-migrated env) degrades that rule
  // to an EMPTY list and never crashes the page. The algorithm itself lives in
  // src/lib/anomalie/rules.ts (shared with reconcile.ts).
  // ════════════════════════════════════════════════════════════════════════

  // ── Rule 1: Biglietto doppio senza 2° partecipante ──────────────────────
  let missingCompanionsOut: ReturnType<typeof missingCompanions> = [];
  try {
    // Tickets bought (purchases cluster='corso', keyed on the course title as
    // supabase/index.ts does) and companions per enrollment.
    const purchases: PurchaseCorsoRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("purchases")
        .select("corsista_id,product_title")
        .eq("cluster", "corso")
        .range(from, from + 999);
      if (error) throw error; // missing table/column → degrade to []
      const rows = (page ?? []) as PurchaseCorsoRow[];
      purchases.push(...rows);
      if (rows.length < 1000) break;
    }

    const partecipanti: PartecipanteRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("corsi_partecipanti")
        .select("iscrizione_id")
        .range(from, from + 999);
      if (error) throw error; // corsi_partecipanti missing → degrade to []
      const rows = (page ?? []) as PartecipanteRow[];
      partecipanti.push(...rows);
      if (rows.length < 1000) break;
    }

    missingCompanionsOut = missingCompanions(
      enr,
      corsoById,
      corsistaName,
      purchases,
      partecipanti,
    );
  } catch {
    missingCompanionsOut = []; // any failure → empty list, never crash
  }

  // ── Rule 2: Sconto 100% su corso cancellato/inesistente ─────────────────
  // Uses only already-loaded maps → no extra query, degrades naturally.
  const fullDiscountCancelledOut = fullDiscountCancelled(enr, corsoById, corsistaName);

  // ── Rule 3: Incasso su un corso cancellato ──────────────────────────────
  let cashOnCancelledOut: ReturnType<typeof cashOnCancelled> = [];
  try {
    // financial_status per enrollment id — fetched defensively (the column may
    // be absent pre-enrichment; if so, treat all as paid, like isPaidRevenue).
    const finByIscr = new Map<number, string | null>();
    {
      const { data: finData, error: finErr } = await sb
        .from("corsi_iscrizioni")
        .select("id,financial_status");
      if (!finErr) {
        for (const r of (finData ?? []) as { id: number; financial_status: string | null }[]) {
          finByIscr.set(r.id, r.financial_status);
        }
      }
    }
    // Attach the per-enrollment financial_status so the pure rule can apply
    // isPaidRevenue — a missing id resolves to null (treated as paid), exactly
    // as the former inline predicate did.
    const enrWithFin: EnrRow[] = enr.map((e) => ({
      ...e,
      financial_status: finByIscr.has(e.id) ? finByIscr.get(e.id)! : null,
    }));

    // Enrollment ids that already have a credit keyed on their origin.
    const creditedIscr = new Set<number>();
    {
      const { data: credData, error: credErr } = await sb
        .from("corsi_crediti")
        .select("iscrizione_origine_id");
      // If the table is missing (pre-migration) we simply keep the set empty →
      // best-effort flags ALL paid-on-cancelled, per spec.
      if (!credErr) {
        for (const r of (credData ?? []) as { iscrizione_origine_id: number | null }[]) {
          if (r.iscrizione_origine_id != null) creditedIscr.add(r.iscrizione_origine_id);
        }
      }
    }

    cashOnCancelledOut = cashOnCancelled(enrWithFin, corsoById, corsistaName, creditedIscr);
  } catch {
    cashOnCancelledOut = [];
  }

  // ── Rule 4: Trasferimento senza destinazione ────────────────────────────
  let openCreditsOut: ReturnType<typeof openCredits> = [];
  try {
    const { data: credData, error: credErr } = await sb
      .from("corsi_crediti")
      .select("corsista_id,importo_cents,corso_origine_id,stato")
      .eq("stato", "aperto");
    if (credErr) throw credErr; // table/column missing → degrade to []
    openCreditsOut = openCredits(
      (credData ?? []) as CreditoRow[],
      corsoById,
      corsistaName,
    );
  } catch {
    openCreditsOut = [];
  }

  return (
    <AnomaliesClient
      items={items}
      emailClusters={emailClusters}
      repaidClusters={repaid}
      dupCourses={dupCourses}
      missingCompanions={missingCompanionsOut}
      fullDiscountCancelled={fullDiscountCancelledOut}
      cashOnCancelled={cashOnCancelledOut}
      openCredits={openCreditsOut}
    />
  );
}
