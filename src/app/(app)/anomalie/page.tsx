import { getTranslations } from "@/lib/i18n/server";
import { requireNavAccess } from "@/lib/auth/guard";
import { supabaseConfig } from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getReviewedEmailClusters } from "@/lib/data/anomalie-actions";
import {
  AnomaliesClient,
  type EmailCluster,
  type RepaidCluster,
  type DupCourseGroup,
  type MissingCompanion,
  type FullDiscountCancelled,
  type CashOnCancelled,
  type OpenCredit,
} from "@/components/anomalie/AnomaliesClient";

export const dynamic = "force-dynamic";

interface AnomalyRow {
  id: number;
  email: string;
  full_name: string;
  review_note: string;
}
interface CorsistaLite {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  merged_into: number | null;
}

/** Normalize a name for grouping (lowercase, strip accents/punctuation). */
function normName(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  interface EnrRow {
    id: number;
    corsista_id: number;
    corso_id: number;
    amount_cents: number;
    discount_cents: number | null;
  }
  const enr: EnrRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from("corsi_iscrizioni")
      .select("id,corsista_id,corso_id,amount_cents,discount_cents")
      .range(from, from + 999);
    if (error || !page) break;
    enr.push(...(page as EnrRow[]));
    if (page.length < 1000) break;
  }
  const { data: corsiData } = await sb
    .from("corsi")
    .select("id,short_title,full_title,type,delivery_mode,month,year,city,lifecycle");
  type CorsoLite = {
    id: number;
    short_title: string | null;
    full_title: string | null;
    type: string;
    delivery_mode: string | null;
    month: string | null;
    year: number | null;
    city: string | null;
    lifecycle: string | null;
  };
  const corsoById = new Map<number, CorsoLite>(
    ((corsiData ?? []) as CorsoLite[]).map((c) => [c.id, c]),
  );
  const net = (r: EnrRow) => Math.max((r.amount_cents || 0) - (r.discount_cents || 0), 0);

  // Cluster: re-participation that was PAID (>1 net-paid enrollment of the same
  // course type). Per SSA rules a repeat of a course you already did is free.
  const byPerson = new Map<number, EnrRow[]>();
  for (const e of enr) (byPerson.get(e.corsista_id) ?? byPerson.set(e.corsista_id, []).get(e.corsista_id)!).push(e);
  const repaidClusters: RepaidCluster[] = [];
  for (const [cid, rows] of byPerson) {
    const byType = new Map<string, EnrRow[]>();
    for (const r of rows) {
      const t = corsoById.get(r.corso_id)?.type;
      if (!t) continue;
      (byType.get(t) ?? byType.set(t, []).get(t)!).push(r);
    }
    for (const [type, arr] of byType) {
      const paid = arr.filter((r) => net(r) > 0);
      if (paid.length < 2) continue; // first paid is legit; only extras are errors
      repaidClusters.push({
        corsistaId: cid,
        name: corsistaName.get(cid) || `#${cid}`,
        type,
        courses: paid
          .map((r) => ({
            title: corsoById.get(r.corso_id)?.short_title ?? `Corso ${r.corso_id}`,
            paid: Math.round(net(r) / 100),
          }))
          .sort((a, b) => b.paid - a.paid),
      });
    }
  }
  repaidClusters.sort((a, b) => b.courses.length - a.courses.length);

  // Cluster: duplicate courses — same real course recorded twice. Online courses
  // key on type+month+year (no city); in-person also on city (same month in two
  // cities is legitimate, not a duplicate).
  const dupKey = (c: CorsoLite) =>
    c.delivery_mode === "online"
      ? `${c.type}|online|${c.month}|${c.year}`
      : `${c.type}|${c.city}|${c.month}|${c.year}`;
  const groups = new Map<string, CorsoLite[]>();
  for (const c of corsoById.values()) {
    if (!c.month || !c.year) continue;
    (groups.get(dupKey(c)) ?? groups.set(dupKey(c), []).get(dupKey(c))!).push(c);
  }
  const enrollCount = new Map<number, number>();
  for (const e of enr) enrollCount.set(e.corso_id, (enrollCount.get(e.corso_id) ?? 0) + 1);
  const dupCourses: DupCourseGroup[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    dupCourses.push({
      label: `${list[0].type} · ${list[0].delivery_mode === "online" ? "Online" : list[0].city} · ${list[0].month} ${list[0].year}`,
      courses: list.map((c) => ({
        id: String(c.id),
        title: c.short_title ?? `Corso ${c.id}`,
        enrolled: enrollCount.get(c.id) ?? 0,
      })),
    });
  }
  dupCourses.sort((a, b) => b.courses.length - a.courses.length);

  // ── Probable DUPLICATE PEOPLE: same email or phone (certainly the same person)
  // or same full name (possible homonymy). Union-find over the three keys groups
  // all linked records into one cluster; the operator can merge them into one. ──
  const enrPerCorsista = new Map<number, number>();
  for (const e of enr) enrPerCorsista.set(e.corsista_id, (enrPerCorsista.get(e.corsista_id) ?? 0) + 1);
  const live = all.filter((c) => !c.merged_into);

  const normEmail = (s: string | null) => (s ?? "").trim().toLowerCase();
  const normPhone = (s: string | null) => {
    const d = (s ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");
    return d.length >= 6 ? d : "";
  };

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
  for (const c of live) (byCluster.get(find(c.id)) ?? byCluster.set(find(c.id), []).get(find(c.id))!).push(c);

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

  // ════════════════════════════════════════════════════════════════════════
  // Reconciliation rules (Phase 1–3). Each rule owns its extra query inside a
  // try/catch so a missing table/column (un-migrated env) degrades that rule
  // to an EMPTY list and never crashes the page.
  // ════════════════════════════════════════════════════════════════════════

  const isCancelled = (corsoId: number) =>
    corsoById.get(corsoId)?.lifecycle === "cancelled";
  const courseFull = (corsoId: number) =>
    corsoById.get(corsoId)?.full_title ??
    corsoById.get(corsoId)?.short_title ??
    `Corso ${corsoId}`;

  // ── Rule 1: Biglietto doppio senza 2° partecipante ──────────────────────
  // For each (corsista, course) holding ≥2 tickets (purchases cluster='corso'
  // matched on the course full_title, as in supabase/index.ts), if the number
  // of corsi_partecipanti rows for that ENROLLMENT is < ticketsBought − 1, the
  // co-attendee name is missing. Degrades to [] if corsi_partecipanti is gone.
  const missingCompanions: MissingCompanion[] = [];
  try {
    // Tickets bought per (corsista, course full_title). Group purchases the
    // same way index.ts does: cluster='corso', keyed on the course title.
    const purByCorsistaTitle = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("purchases")
        .select("corsista_id,product_title")
        .eq("cluster", "corso")
        .range(from, from + 999);
      if (error) throw error; // missing table/column → degrade to []
      const rows = (page ?? []) as { corsista_id: number; product_title: string | null }[];
      for (const p of rows) {
        if (p.corsista_id == null || !p.product_title) continue;
        const k = `${p.corsista_id}|${p.product_title}`;
        purByCorsistaTitle.set(k, (purByCorsistaTitle.get(k) ?? 0) + 1);
      }
      if (rows.length < 1000) break;
    }

    // Companion count per enrollment id.
    const companionsByIscr = new Map<number, number>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await sb
        .from("corsi_partecipanti")
        .select("iscrizione_id")
        .range(from, from + 999);
      if (error) throw error; // corsi_partecipanti missing → degrade to []
      const rows = (page ?? []) as { iscrizione_id: number | null }[];
      for (const p of rows) {
        if (p.iscrizione_id == null) continue;
        companionsByIscr.set(p.iscrizione_id, (companionsByIscr.get(p.iscrizione_id) ?? 0) + 1);
      }
      if (rows.length < 1000) break;
    }

    for (const e of enr) {
      const full = corsoById.get(e.corso_id)?.full_title;
      if (!full) continue;
      const ticketsBought = purByCorsistaTitle.get(`${e.corsista_id}|${full}`) ?? 0;
      if (ticketsBought < 2) continue; // a single seat needs no companion
      const have = companionsByIscr.get(e.id) ?? 0;
      const missing = ticketsBought - 1 - have;
      if (missing <= 0) continue;
      missingCompanions.push({
        corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
        courseTitle: courseFull(e.corso_id),
        ticketsBought,
        missing,
      });
    }
    missingCompanions.sort((a, b) => b.missing - a.missing);
  } catch {
    missingCompanions.length = 0; // any failure → empty list, never crash
  }

  // ── Rule 2: Sconto 100% su corso cancellato/inesistente ─────────────────
  // Fully-discounted enrollments (net 0, i.e. discount_cents ≥ amount_cents)
  // whose course is cancelled OR whose corso_id has no matching corsi row. A
  // legit 100%-off transfer sits on a VALID upcoming course → must NOT flag.
  // Uses only already-loaded maps → no extra query, degrades naturally.
  const fullDiscountCancelled: FullDiscountCancelled[] = [];
  try {
    for (const e of enr) {
      if ((e.discount_cents || 0) < (e.amount_cents || 0)) continue; // not 100% off
      const course = corsoById.get(e.corso_id);
      const missingCourse = !course;
      if (!missingCourse && course!.lifecycle !== "cancelled") continue; // valid course → skip
      fullDiscountCancelled.push({
        corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
        courseTitle: missingCourse ? "(corso mancante)" : courseFull(e.corso_id),
        amount: Math.round((e.amount_cents || 0) / 100),
      });
    }
    fullDiscountCancelled.sort((a, b) => b.amount - a.amount);
  } catch {
    fullDiscountCancelled.length = 0;
  }

  // ── Rule 3: Incasso su un corso cancellato ──────────────────────────────
  // A cancelled course that still holds PAID enrollments (isPaidRevenue) whose
  // money has NOT been moved to a credit — i.e. no corsi_crediti row keyed on
  // that enrollment (iscrizione_origine_id). Phase 3 sync normally auto-creates
  // the credit; this catches the gap (e.g. migration not yet run). Best-effort:
  // if corsi_crediti is missing, flag ALL paid-on-cancelled.
  const cashOnCancelled: CashOnCancelled[] = [];
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
    const isPaid = (id: number) => {
      const fs = finByIscr.has(id) ? finByIscr.get(id) : null;
      return fs == null || fs === "paid";
    };

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

    for (const e of enr) {
      if (!isCancelled(e.corso_id)) continue;
      if (net(e) <= 0) continue; // no money collected on this seat
      if (!isPaid(e.id)) continue; // only revenue actually collected
      if (creditedIscr.has(e.id)) continue; // already turned into a tracked credit
      cashOnCancelled.push({
        courseTitle: courseFull(e.corso_id),
        corsistaName: corsistaName.get(e.corsista_id) || `#${e.corsista_id}`,
        amount: Math.round(net(e) / 100),
      });
    }
    cashOnCancelled.sort((a, b) => b.amount - a.amount);
  } catch {
    cashOnCancelled.length = 0;
  }

  // ── Rule 4: Trasferimento senza destinazione ────────────────────────────
  // Open credits (corsi_crediti stato='aperto'): people owed a seat with no
  // destination assigned yet. Also surfaced in /crediti. Degrades to [] if the
  // table is missing.
  const openCredits: OpenCredit[] = [];
  try {
    const { data: credData, error: credErr } = await sb
      .from("corsi_crediti")
      .select("corsista_id,importo_cents,corso_origine_id,stato")
      .eq("stato", "aperto");
    if (credErr) throw credErr; // table/column missing → degrade to []
    for (const r of (credData ?? []) as {
      corsista_id: number | null;
      importo_cents: number | null;
      corso_origine_id: number | null;
      stato: string;
    }[]) {
      openCredits.push({
        corsistaName:
          (r.corsista_id != null && corsistaName.get(r.corsista_id)) || `#${r.corsista_id ?? "?"}`,
        amount: Math.round((r.importo_cents || 0) / 100),
        originCourseTitle: r.corso_origine_id != null ? courseFull(r.corso_origine_id) : "—",
      });
    }
    openCredits.sort((a, b) => b.amount - a.amount);
  } catch {
    openCredits.length = 0;
  }

  return (
    <AnomaliesClient
      items={items}
      emailClusters={emailClusters}
      repaidClusters={repaidClusters}
      dupCourses={dupCourses}
      missingCompanions={missingCompanions}
      fullDiscountCancelled={fullDiscountCancelled}
      cashOnCancelled={cashOnCancelled}
      openCredits={openCredits}
    />
  );
}
