import "server-only";

// Full reset of the "Test esame" sandbox course: wipes every trace produced
// by exam/appello trials and restores the canonical demo roster, so educators
// always start a demo from a clean slate. Everything is keyed on the sandbox
// corso id — real courses are untouchable from here by construction.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvCasPatch } from "@/lib/data/kv-cas";
import { MONTH_NAMES_IT } from "@/lib/dates/italian-months";
import { setLinkEpoch } from "@/lib/exam-links/lifecycle";
import { seedCourseProgramDays } from "./program-seed";
import { SANDBOX_COURSE_HANDLE } from "./sandbox";

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
  submissions: number;
  progress: number;
  presenze: number;
  partecipanti: number;
  iscrizioniRestored: number;
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

export async function resetExamSandbox(): Promise<SandboxResetSummary> {
  const svc = getSupabaseServiceClient();

  const { data: corso, error } = await svc
    .from("corsi")
    .select("id")
    .eq("handle", SANDBOX_COURSE_HANDLE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!corso) throw new Error("Corso di test non trovato.");
  const id = corso.id as number;

  // 0. Kill every OUTSTANDING link first (course-wide epoch = now): exam pages
  //    still open stop heartbeating and old links die, so nothing can
  //    repopulate the state wiped below — the demo truly restarts from the
  //    appello. Ordered BEFORE the wipes on purpose.
  if (!(await setLinkEpoch(id))) {
    throw new Error("Reset interrotto: impossibile invalidare i link esistenti.");
  }

  // 1. Exam/appello state. exam_submissions has ON DELETE SET NULL on corso_id,
  //    so it MUST be purged explicitly; the others are belt & braces (their
  //    course FKs cascade, but the corso row here is never deleted).
  const submissions = await deleteByCourse(svc, "exam_submissions", id);
  const progress = await deleteByCourse(svc, "exam_progress", id);
  await deleteByCourse(svc, "exam_student_links", id);
  await deleteByCourse(svc, "exam_sessions", id);
  const presenze = await deleteByCourse(svc, "corsi_presenze", id);
  const partecipanti = await deleteByCourse(svc, "corsi_partecipanti", id);
  await deleteByCourse(svc, "exams", id); // legacy model — children cascade

  // Credit ledger rows can only exist if someone cancelled the sandbox mid-demo.
  await svc.from("corsi_crediti").delete().eq("corso_origine_id", id);
  await svc.from("corsi_crediti").delete().eq("corso_destinazione_id", id);

  // 2. Roster back to the canonical demo students.
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

  // 3. Per-course settings_kv leftovers: AI-correction drafts/run, exam link
  //    send-log and closures.
  await svc.from("settings_kv").delete().eq("key", `exam-correction-run:${id}`);
  await svc.from("settings_kv").delete().like("key", `exam-correction:${id}:%`);
  await svc.from("settings_kv").delete().like("key", `exam_link_send:${id}:%`);
  await svc.from("settings_kv").delete().like("key", `exam_link_closure:${id}:%`);
  await dropOverlayEntry(svc, "course_program", id);
  await dropOverlayEntry(svc, "course_economics", id);

  // 3b. Certificate ESITI: a graded demo exam mints a certificate PDF whose
  //     URL is stored in the shared "exam_certificates" blob keyed by
  //     corsistaId-corsoId. Drop this course's entries so "pulizia" leaves no
  //     esito behind (real courses' certificates are untouched — filtered by
  //     corsoId).
  await kvCasPatch<{ items?: { corsistaId: number; corsoId: number; url: string }[] }>(
    svc,
    "exam_certificates",
    (cur) => {
      const items = cur?.items ?? [];
      const kept = items.filter((it) => it.corsoId !== id);
      if (kept.length === items.length) return "abort"; // nothing for this course
      return { ...cur, items: kept };
    },
  );

  // 4. Freshen the corso row: dates roll to "starts today" so the demo always
  //    looks current, and demo edits (notebook/costs/status) are cleared.
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

  // 5. Re-seed the 3 program days RIGHT AWAY (the wipe above dropped them):
  //    an educator link opened after the reset must show Giorno 1..3 + Giorno
  //    esame immediately, not a single fallback day until the link is
  //    re-shared (share-time seeding stays as the net for real courses).
  await seedCourseProgramDays(id);

  return {
    submissions,
    progress,
    presenze,
    partecipanti,
    iscrizioniRestored: rows.length,
  };
}
