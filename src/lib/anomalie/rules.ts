// ============================================================================
// Anomalie — PURE reconciliation ALGORITHMS.
//
// This module owns the 7 anomaly-detection algorithms that used to live inline
// in src/app/(app)/anomalie/page.tsx. It is a PURE LEAF: it does NO IO (no
// Supabase, no fetch, no server-only) — every function takes already-fetched,
// plain typed rows and returns the exact typed array the page renders. That
// makes the algorithms unit-testable and lets both the PAGE (live view) and
// reconcile.ts (sync-time counts) share ONE source of truth instead of two
// copies that must be kept in lock-step by hand.
//
// Every money predicate routes through '@/lib/economics/revenue'
// (isPaidRevenue / netPaidCents / netPaidEuros) — the single revenue rule.
//
// Output shapes are re-exported from the AnomaliesClient result interfaces so
// the page can hand the arrays straight to <AnomaliesClient> unchanged.
// ============================================================================

import { isPaidRevenue, netPaidCents } from "@/lib/economics/revenue";
import type {
  EmailCluster,
  RepaidCluster,
  DupCourseGroup,
  MissingCompanion,
  FullDiscountCancelled,
  CashOnCancelled,
  OpenCredit,
} from "@/components/anomalie/AnomaliesClient";

// ── Input row types (plain, already-fetched shapes) ─────────────────────────

/** A corsista row, as fetched for duplicate-person detection. */
export interface CorsistaLite {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  merged_into: number | null;
}

/** An enrollment row (corsi_iscrizioni). `financial_status` is optional: a
 *  null/missing value is treated as paid (legacy / pre-enrichment rows). */
export interface EnrRow {
  id: number;
  corsista_id: number;
  corso_id: number;
  amount_cents: number | null;
  discount_cents: number | null;
  financial_status?: string | null;
}

/** A course row (corsi), as fetched for the course-side rules. */
export interface CorsoLite {
  id: number;
  short_title: string | null;
  full_title: string | null;
  type: string;
  delivery_mode: string | null;
  month: string | null;
  year: number | null;
  city: string | null;
  lifecycle: string | null;
}

/** A purchases row (cluster='corso'), for the double-ticket rule. */
export interface PurchaseCorsoRow {
  corsista_id: number | null;
  product_title: string | null;
}

/** A corsi_partecipanti row (companion), for the double-ticket rule. */
export interface PartecipanteRow {
  iscrizione_id: number | null;
}

/** A corsi_crediti row, for open-credit / cash-on-cancelled rules. */
export interface CreditoRow {
  corsista_id: number | null;
  importo_cents: number | null;
  corso_origine_id: number | null;
  stato: string;
}

// ── Shared helpers (identical semantics to the former inline locals) ─────────

/** Normalize a name for grouping (lowercase, strip accents/punctuation). */
export function normName(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const normEmail = (s: string | null) => (s ?? "").trim().toLowerCase();
const normPhone = (s: string | null) => {
  const d = (s ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");
  return d.length >= 6 ? d : "";
};

function courseFull(corsoById: Map<number, CorsoLite>, corsoId: number): string {
  return (
    corsoById.get(corsoId)?.full_title ??
    corsoById.get(corsoId)?.short_title ??
    `Corso ${corsoId}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Rule A — Probable DUPLICATE PEOPLE (union-find over email / phone / name).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Group live (non-merged) corsisti that share an email or phone (near-certain
 * same person) or a multi-word full name (possible homonymy) into clusters, via
 * union-find over the three keys. `reviewed` holds cluster keys the operator
 * already dismissed. `enrPerCorsista` counts enrollments per corsista (used to
 * pick the suggested survivor and to sort members). Ordering + shape are
 * identical to the former inline block.
 */
export function duplicatePeople(
  all: CorsistaLite[],
  enrPerCorsista: Map<number, number>,
  reviewed: Set<string>,
): EmailCluster[] {
  const live = all.filter((c) => !c.merged_into);

  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const c of live) parent.set(c.id, c.id);

  // Link records that share an email, a phone, or a (multi-word) full name.
  const emailIdx = new Map<string, number[]>();
  const phoneIdx = new Map<string, number[]>();
  const nameIdx = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, id: number) => {
    if (!k) return;
    (m.get(k) ?? m.set(k, []).get(k)!).push(id);
  };
  for (const c of live) {
    push(emailIdx, normEmail(c.email), c.id);
    push(phoneIdx, normPhone(c.phone), c.id);
    const n = normName(c.full_name);
    if (n && n.split(" ").length >= 2) push(nameIdx, n, c.id);
  }
  for (const idx of [emailIdx, phoneIdx, nameIdx]) {
    for (const ids of idx.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const byCluster = new Map<number, CorsistaLite[]>();
  for (const c of live)
    (byCluster.get(find(c.id)) ?? byCluster.set(find(c.id), []).get(find(c.id))!).push(c);

  const norm = (s: string | null, fn: (x: string | null) => string) => fn(s);
  const hasShared = (members: CorsistaLite[], get: (c: CorsistaLite) => string) => {
    const seen = new Set<string>();
    for (const m of members) {
      const k = get(m);
      if (k && seen.has(k)) return true;
      if (k) seen.add(k);
    }
    return false;
  };

  const emailClusters: EmailCluster[] = [];
  for (const [, members] of byCluster) {
    if (members.length < 2) continue;
    const reasons: string[] = [];
    if (hasShared(members, (m) => norm(m.email, normEmail))) reasons.push("email");
    if (hasShared(members, (m) => norm(m.phone, normPhone))) reasons.push("phone");
    if (hasShared(members, (m) => normName(m.full_name))) reasons.push("name");
    if (reasons.length === 0) continue;
    const key = "dup-" + members.map((m) => m.id).sort((a, b) => a - b).join("-");
    if (reviewed.has(key)) continue;
    // Suggested survivor = the record with the most enrollments (ties → lowest id).
    const survivor = [...members].sort(
      (a, b) => (enrPerCorsista.get(b.id) ?? 0) - (enrPerCorsista.get(a.id) ?? 0) || a.id - b.id,
    )[0];
    emailClusters.push({
      nameKey: key,
      name: members.find((m) => m.full_name)?.full_name ?? key,
      reasons,
      confidence: reasons.includes("email") || reasons.includes("phone") ? "alta" : "media",
      survivorId: survivor.id,
      members: members
        .map((m) => ({
          id: m.id,
          name: m.full_name ?? "",
          email: m.email ?? "",
          phone: m.phone ?? "",
          enrollments: enrPerCorsista.get(m.id) ?? 0,
        }))
        .sort((a, b) => b.enrollments - a.enrollments || a.id - b.id),
    });
  }
  // Strongest + biggest first.
  emailClusters.sort(
    (a, b) =>
      (a.confidence === "alta" ? 0 : 1) - (b.confidence === "alta" ? 0 : 1) ||
      b.members.length - a.members.length,
  );
  return emailClusters;
}

// ════════════════════════════════════════════════════════════════════════════
// Rule B — Re-participation that was PAID (should be free).
// ════════════════════════════════════════════════════════════════════════════

/**
 * A corsista with >1 net-paid enrollment of the SAME course type. The first
 * paid attendance is legit; only the extras are errors (a repeat of a course
 * you already did is free per SSA rules).
 */
export function repaidClusters(
  enr: EnrRow[],
  corsoById: Map<number, CorsoLite>,
  corsistaName: Map<number, string>,
): RepaidCluster[] {
  const byPerson = new Map<number, EnrRow[]>();
  for (const e of enr)
    (byPerson.get(e.corsista_id) ?? byPerson.set(e.corsista_id, []).get(e.corsista_id)!).push(e);
  const out: RepaidCluster[] = [];
  for (const [cid, rows] of byPerson) {
    const byType = new Map<string, EnrRow[]>();
    for (const r of rows) {
      const t = corsoById.get(r.corso_id)?.type;
      if (!t) continue;
      (byType.get(t) ?? byType.set(t, []).get(t)!).push(r);
    }
    for (const [type, arr] of byType) {
      const paid = arr.filter((r) => netPaidCents(r) > 0);
      if (paid.length < 2) continue; // first paid is legit; only extras are errors
      out.push({
        corsistaId: cid,
        name: corsistaName.get(cid) || `#${cid}`,
        type,
        courses: paid
          .map((r) => ({
            title: corsoById.get(r.corso_id)?.short_title ?? `Corso ${r.corso_id}`,
            paid: Math.round(netPaidCents(r) / 100),
          }))
          .sort((a, b) => b.paid - a.paid),
      });
    }
  }
  out.sort((a, b) => b.courses.length - a.courses.length);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Rule C — DUPLICATE COURSES (same real course recorded twice).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Same real course recorded twice. Online courses key on type+month+year (no
 * city); in-person also on city (same month in two cities is legitimate, not a
 * duplicate). `enrollCount` gives the enrolled count shown per course.
 */
export function duplicateCourses(
  corsoById: Map<number, CorsoLite>,
  enrollCount: Map<number, number>,
): DupCourseGroup[] {
  const dupKey = (c: CorsoLite) =>
    c.delivery_mode === "online"
      ? `${c.type}|online|${c.month}|${c.year}`
      : `${c.type}|${c.city}|${c.month}|${c.year}`;
  const groups = new Map<string, CorsoLite[]>();
  for (const c of corsoById.values()) {
    if (!c.month || !c.year) continue;
    (groups.get(dupKey(c)) ?? groups.set(dupKey(c), []).get(dupKey(c))!).push(c);
  }
  const out: DupCourseGroup[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    out.push({
      label: `${list[0].type} · ${list[0].delivery_mode === "online" ? "Online" : list[0].city} · ${list[0].month} ${list[0].year}`,
      courses: list.map((c) => ({
        id: String(c.id),
        title: c.short_title ?? `Corso ${c.id}`,
        enrolled: enrollCount.get(c.id) ?? 0,
      })),
    });
  }
  out.sort((a, b) => b.courses.length - a.courses.length);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase-rule 1 — Biglietto doppio senza 2° partecipante (doppio-no-2nd).
// ════════════════════════════════════════════════════════════════════════════

/**
 * For each (corsista, course) holding ≥2 tickets (purchases cluster='corso',
 * grouped on the course full_title exactly as supabase/index.ts does), if the
 * number of corsi_partecipanti rows for that ENROLLMENT is < ticketsBought − 1,
 * a co-attendee name is missing.
 */
export function missingCompanions(
  enr: EnrRow[],
  corsoById: Map<number, CorsoLite>,
  corsistaName: Map<number, string>,
  purchases: PurchaseCorsoRow[],
  partecipanti: PartecipanteRow[],
): MissingCompanion[] {
  // Tickets bought per (corsista, course full_title).
  const purByCorsistaTitle = new Map<string, number>();
  for (const p of purchases) {
    if (p.corsista_id == null || !p.product_title) continue;
    const k = `${p.corsista_id}|${p.product_title}`;
    purByCorsistaTitle.set(k, (purByCorsistaTitle.get(k) ?? 0) + 1);
  }

  // Companion count per enrollment id.
  const companionsByIscr = new Map<number, number>();
  for (const p of partecipanti) {
    if (p.iscrizione_id == null) continue;
    companionsByIscr.set(p.iscrizione_id, (companionsByIscr.get(p.iscrizione_id) ?? 0) + 1);
  }

  const out: MissingCompanion[] = [];
  for (const e of enr) {
    const full = corsoById.get(e.corso_id)?.full_title;
    if (!full) continue;
    const ticketsBought = purByCorsistaTitle.get(`${e.corsista_id}|${full}`) ?? 0;
    if (ticketsBought < 2) continue; // a single seat needs no companion
    const have = companionsByIscr.get(e.id) ?? 0;
    const missing = ticketsBought - 1 - have;
    if (missing <= 0) continue;
    out.push({
      corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
      courseTitle: courseFull(corsoById, e.corso_id),
      ticketsBought,
      missing,
    });
  }
  out.sort((a, b) => b.missing - a.missing);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase-rule 2 — Sconto 100% su corso cancellato/inesistente (cancelled-100off).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Fully-discounted enrollments (net 0, i.e. discount ≥ amount) whose course is
 * cancelled OR whose corso_id has no matching corsi row. A legit 100%-off
 * transfer sits on a VALID upcoming course → must NOT flag.
 */
export function fullDiscountCancelled(
  enr: EnrRow[],
  corsoById: Map<number, CorsoLite>,
  corsistaName: Map<number, string>,
): FullDiscountCancelled[] {
  const out: FullDiscountCancelled[] = [];
  for (const e of enr) {
    if (netPaidCents(e) > 0) continue; // not 100% off (net > 0)
    const course = corsoById.get(e.corso_id);
    const missingCourse = !course;
    if (!missingCourse && course!.lifecycle !== "cancelled") continue; // valid course → skip
    out.push({
      corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
      courseTitle: missingCourse ? "(corso mancante)" : courseFull(corsoById, e.corso_id),
      amount: Math.round((e.amount_cents || 0) / 100),
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase-rule 3 — Incasso su un corso cancellato (cash-on-cancelled).
// ════════════════════════════════════════════════════════════════════════════

/**
 * A cancelled course still holding PAID enrollments (isPaidRevenue on the
 * enrollment's financial_status) whose money has NOT been moved to a credit —
 * i.e. no corsi_crediti row keyed on that enrollment (iscrizione_origine_id).
 * `creditedIscr` is the set of enrollment ids already turned into a credit
 * (empty when the credits table is missing → best-effort flags all paid-on-
 * cancelled).
 */
export function cashOnCancelled(
  enr: EnrRow[],
  corsoById: Map<number, CorsoLite>,
  corsistaName: Map<number, string>,
  creditedIscr: Set<number>,
): CashOnCancelled[] {
  const isCancelled = (corsoId: number) => corsoById.get(corsoId)?.lifecycle === "cancelled";
  const out: CashOnCancelled[] = [];
  for (const e of enr) {
    if (!isCancelled(e.corso_id)) continue;
    if (netPaidCents(e) <= 0) continue; // no money collected on this seat
    if (!isPaidRevenue(e.financial_status)) continue; // only revenue actually collected
    if (creditedIscr.has(e.id)) continue; // already turned into a tracked credit
    out.push({
      courseTitle: courseFull(corsoById, e.corso_id),
      corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
      amount: Math.round(netPaidCents(e) / 100),
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase-rule 4 — Trasferimento senza destinazione (open-credits).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Open credits (corsi_crediti stato='aperto'): people owed a seat with no
 * destination assigned yet. Caller pre-filters to stato='aperto' rows.
 */
export function openCredits(
  credits: CreditoRow[],
  corsoById: Map<number, CorsoLite>,
  corsistaName: Map<number, string>,
): OpenCredit[] {
  const out: OpenCredit[] = [];
  for (const r of credits) {
    out.push({
      corsistaName:
        (r.corsista_id != null && corsistaName.get(r.corsista_id)) || `#${r.corsista_id ?? "?"}`,
      amount: Math.round((r.importo_cents || 0) / 100),
      originCourseTitle:
        r.corso_origine_id != null ? courseFull(corsoById, r.corso_origine_id) : "—",
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}
