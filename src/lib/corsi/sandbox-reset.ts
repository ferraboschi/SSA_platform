import "server-only";

// Full reset of the test courses: wipes every trace produced by exam/appello
// trials so educators (and the owner's test runs) always start from a clean
// slate. Two scopes:
//   • the PRIMARY sandbox ("Corso test di tre giorni") — wiped AND restored to
//     its canonical demo roster + fresh dates + re-seeded program;
//   • every OTHER test-fixture course in SANDBOX_COURSE_HANDLES (e.g.
//     "TEST — Verifica Esame") — its exam artifacts are wiped and its
//     enrollments' results cleared, but its own roster is left in place.
// Everything is keyed on a test-course id — real courses are untouchable from
// here by construction.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvCasPatch } from "@/lib/data/kv-cas";
import { MONTH_NAMES_IT } from "@/lib/dates/italian-months";
import { setLinkEpoch } from "@/lib/exam-links/lifecycle";
import { seedCourseProgramDays } from "./program-seed";
import { SANDBOX_COURSE_HANDLE, SANDBOX_COURSE_HANDLES } from "./sandbox";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

// The demo roster (fictitious/staff people): resolved by corsisti.email so the
// reset keeps working if row ids ever change. enrolledEmail is pre-confirmed
// so personal exam links work immediately after a reset.
const CANONICAL_ROSTER = [
  { corsistaEmail: "lorenzo-test@ef-ti.com", enrolledEmail: "lorenzo@ef-ti.com" },
  { corsistaEmail: "order@wagyucompany.com", enrolledEmail: "order@wagyucompany.com" },
  { corsistaEmail: "info@sakecompany.com", enrolledEmail: "corsi@sakesommelierassociation.it" },
];

export interface SandboxResetSummary {
  /** Totals ACROSS every test course reset (so the UI's "already clean" check
   *  is honest when nothing was left anywhere). */
  submissions: number;
  progress: number;
  presenze: number;
  partecipanti: number;
  iscrizioniRestored: number;
  /** Secondary test-fixture courses whose exam artifacts were also wiped. */
  otherCoursesWiped: number;
}

async function deleteByCourse(svc: Svc, table: string, corsoId: number): Promise<number> {
  const { data, error } = await svc
    .from(table)
    .delete()
    .eq("corso_id", corsoId)
    .select("corso_id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data?.length ?? 0;
}

/** Remove the sandbox entry from a shared per-course overlay blob (CAS-safe). */
async function dropOverlayEntry(svc: Svc, key: string, corsoId: number): Promise<void> {
  await kvCasPatch<{ items?: Record<string, unknown> }>(svc, key, (cur) => {
    const items = cur?.items ?? {};
    if (!(String(corsoId) in items)) return "abort";
    const next = { ...items };
    delete next[String(corsoId)];
    return { ...cur, items: next };
  });
}

interface WipeCounts {
  submissions: number;
  progress: number;
  presenze: number;
  partecipanti: number;
}

/**
 * Wipe EVERY exam-trial artifact of ONE course: outstanding links (epoch bump
 * first, so open pages stop repopulating), submissions, progress, roll-call,
 * companions, sessions, links, transfer credits, and the per-course settings_kv
 * leftovers (AI-correction drafts/run, send-log, closures, certificate esiti).
 * Shared by the primary sandbox reset and the secondary fixture wipe so the two
 * can never drift apart.
 */
async function wipeExamArtifacts(svc: Svc, id: number): Promise<WipeCounts> {
  // Kill outstanding links FIRST (course-wide epoch = now): exam pages still
  // open stop heartbeating and old links die, so nothing repopulates the state
  // wiped below.
  if (!(await setLinkEpoch(id))) {
    throw new Error("Reset interrotto: impossibile invalidare i link esistenti.");
  }

  // exam_submissions has ON DELETE SET NULL on corso_id, so it MUST be purged
  // explicitly; the others are belt & braces (their course FKs cascade, but the
  // corso row here is never deleted).
  const submissions = await deleteByCourse(svc, "exam_submissions", id);
  const progress = await deleteByCourse(svc, "exam_progress", id);
  await deleteByCourse(svc, "exam_student_links", id);
  await deleteByCourse(svc, "exam_sessions", id);
  const presenze = await deleteByCourse(svc, "corsi_presenze", id);
  const partecipanti = await deleteByCourse(svc, "corsi_partecipanti", id);
  await deleteByCourse(svc, "exams", id); // legacy model — children cascade

  // Credit ledger rows can only exist if someone cancelled the course mid-demo.
  await svc.from("corsi_crediti").delete().eq("corso_origine_id", id);
  await svc.from("corsi_crediti").delete().eq("corso_destinazione_id", id);

  // Per-course settings_kv: AI-correction drafts/run, exam link send-log, closures.
  await svc.from("settings_kv").delete().eq("key", `exam-correction-run:${id}`);
  await svc.from("settings_kv").delete().like("key", `exam-correction:${id}:%`);
  await svc.from("settings_kv").delete().like("key", `exam_link_send:${id}:%`);
  await svc.from("settings_kv").delete().like("key", `exam_link_closure:${id}:%`);

  // Certificate ESITI: a graded exam mints a certificate PDF whose URL lives in
  // the shared "exam_certificates" blob keyed by corsistaId-corsoId. Drop this
  // course's entries so no esito is left behind (real courses' certificates are
  // untouched — filtered by corsoId).
  await kvCasPatch<{ items?: { corsistaId: number; corsoId: number; url: string }[] }>(
    svc,
    "exam_certificates",
    (cur) => {
      const items = cur?.items ?? [];
      const kept = items.filter((it) => it.corsoId !== id);
      if (kept.length === items.length) return "abort";
      return { ...cur, items: kept };
    },
  );

  return { submissions, progress, presenze, partecipanti };
}

/** Resolve a course id by handle (null when the fixture doesn't exist). */
async function idByHandle(svc: Svc, handle: string): Promise<number | null> {
  const { data, error } = await svc
    .from("corsi")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as number | undefined) ?? null;
}

export async function resetExamSandbox(): Promise<SandboxResetSummary> {
  const svc = getSupabaseServiceClient();

  const id = await idByHandle(svc, SANDBOX_COURSE_HANDLE);
  if (id == null) throw new Error("Corso di test non trovato.");

  // ── Primary sandbox: full wipe + roster restore + fresh demo shell ──
  const primary = await wipeExamArtifacts(svc, id);

  // Roster back to the canonical demo students.
  await deleteByCourse(svc, "corsi_iscrizioni", id);
  const { data: people } = await svc
    .from("corsisti")
    .select("id, email")
    .in("email", CANONICAL_ROSTER.map((r) => r.corsistaEmail));
  const byEmail = new Map((people ?? []).map((p) => [p.email as string, p.id as number]));
  const rows = CANONICAL_ROSTER.flatMap((r) => {
    const corsistaId = byEmail.get(r.corsistaEmail);
    if (!corsistaId) return [];
    return [{
      corso_id: id,
      corsista_id: corsistaId,
      enrolled_email: r.enrolledEmail,
      email_confirmed_at: new Date().toISOString(),
      amount_cents: 0,
      seat_index: 1,
      historical: false,
    }];
  });
  if (rows.length > 0) {
    const { error: insErr } = await svc.from("corsi_iscrizioni").insert(rows);
    if (insErr) throw new Error(`corsi_iscrizioni: ${insErr.message}`);
  }

  await dropOverlayEntry(svc, "course_program", id);
  await dropOverlayEntry(svc, "course_economics", id);

  // Freshen the corso row: dates roll to "starts today" so the demo always
  // looks current, and demo edits (notebook/costs/status) are cleared.
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 86400_000);
  await svc
    .from("corsi")
    .update({
      start_date: now.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      month: MONTH_NAMES_IT[now.getMonth()],
      year: now.getFullYear(),
      lifecycle: "pubblicato",
      status: null,
      notebook: {},
      costs: {},
      capacity: 10,
      min_students: 0,
      price_cents: 0,
    })
    .eq("id", id);

  // Re-seed the 3 program days RIGHT AWAY (the wipe dropped the overlay): an
  // educator link opened after the reset must show Giorno 1..3 + Giorno esame
  // immediately.
  await seedCourseProgramDays(id);

  // ── Secondary test fixtures (e.g. "TEST — Verifica Esame"): wipe the exam
  //    artifacts and clear their enrollments' results, but keep their own
  //    roster (they aren't the 3-day demo). Missing fixtures are skipped. ──
  let otherCoursesWiped = 0;
  const totals: WipeCounts = { ...primary };
  for (const handle of SANDBOX_COURSE_HANDLES) {
    if (handle === SANDBOX_COURSE_HANDLE) continue;
    const otherId = await idByHandle(svc, handle);
    if (otherId == null) continue;
    const w = await wipeExamArtifacts(svc, otherId);
    // Clear any confirmed verdict on the surviving enrollments/companions.
    await svc
      .from("corsi_iscrizioni")
      .update({ exam_result: null, exam_score_pct: null })
      .eq("corso_id", otherId);
    totals.submissions += w.submissions;
    totals.progress += w.progress;
    totals.presenze += w.presenze;
    totals.partecipanti += w.partecipanti;
    otherCoursesWiped += 1;
  }

  return {
    submissions: totals.submissions,
    progress: totals.progress,
    presenze: totals.presenze,
    partecipanti: totals.partecipanti,
    iscrizioniRestored: rows.length,
    otherCoursesWiped,
  };
}
