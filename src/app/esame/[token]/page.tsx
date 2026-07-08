// Public, tokenized exam runner — reachable WITHOUT app login.
//
// The link is a signed, expiring token (src/lib/exam-links/token.ts). It is not
// permanent and is specific to one course + one test. We verify it, then load
// the course header + the test's questions via the service client (the anon
// client is blocked by RLS on a public page).
import type { Metadata } from "next";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyExamToken } from "@/lib/exam-links/token";
import { getClosure, isBlockedByClosure } from "@/lib/exam-links/lifecycle";
import { loadPublicExam } from "@/lib/exam-links/load";
import {
  loadPresentForTest,
  isBlockedByAbsence,
  absentAccessError,
} from "@/lib/exam-links/live-progress";
import { ExamGate } from "@/components/esame-pubblico/ExamGate";
import { CHROME, LANGS, type Lang } from "@/components/esame-pubblico/exam-chrome";
import "@/components/esame-pubblico/exam-public.css";

export const metadata: Metadata = {
  title: "SSA · Esame",
  robots: { index: false, follow: false },
};

function Invalid({ reason }: { reason: string }) {
  return (
    <div className="exam-public-shell">
      <div className="exam-public-card exam-public-invalid">
        <div className="exam-public-invalid-icon">⏳</div>
        <h1>Link non valido</h1>
        <p>{reason}</p>
      </div>
    </div>
  );
}

/** Server-rendered blocking screen (already submitted / absent) — no runner is
 *  ever mounted, so nothing behind it can be reached with a refresh. */
function Blocked({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="exam-public-shell">
      <div className="exam-public-card">
        <div className="exam-public-thanks">
          <div className="exam-public-thanks-check">{icon}</div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
      </div>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = verifyExamToken(token);
  if (!res.ok) {
    const msg =
      res.reason === "expired"
        ? "Questo link è scaduto. Richiedi un nuovo link al tuo educator."
        : "Questo link non è valido. Verifica di aver copiato l'indirizzo completo.";
    return <Invalid reason={msg} />;
  }

  // Lifecycle: the educator can CLOSE a test for everyone. An exam-mode token
  // issued before the closure is rejected; a re-send (fresh `ia`) re-opens.
  if (res.payload.m === "exam") {
    const closedAt = await getClosure(Number(res.payload.c), res.payload.t);
    if (isBlockedByClosure(closedAt, res.payload.ia)) {
      return (
        <Invalid reason="Questo test è stato chiuso dall'educator. Se ti serve un nuovo accesso, chiedi di reinviarti il link." />
      );
    }
  }

  // We need the course type to resolve the exam family. Read it (service role).
  const sb = getSupabaseServiceClient();
  const { data: corso } = await sb
    .from("corsi")
    .select("type")
    .eq("id", Number(res.payload.c))
    .maybeSingle();
  if (!corso) return <Invalid reason="Corso non trovato." />;

  // ── Server-side integrity gates (real exams on a PERSONAL token only) ─────
  // Previews (test/validate) and the shared class link (email gate) skip both.
  const subjS = res.payload.s && /^\d+$/.test(res.payload.s) ? Number(res.payload.s) : null;
  const subjP = res.payload.p && /^\d+$/.test(res.payload.p) ? Number(res.payload.p) : null;
  if (res.payload.m === "exam" && (subjS != null || subjP != null)) {
    const lang: Lang = LANGS.includes(res.payload.l as Lang) ? (res.payload.l as Lang) : "it";
    const corsoId = Number(res.payload.c);

    // 1) ALREADY SUBMITTED → blocking screen. The DB unique index already
    //    forbids a second submission; this stops the student from re-entering
    //    the questions at all (refresh/other device/cleared storage). Scoped
    //    strictly per test_key; FAIL-OPEN on query error (an infra hiccup must
    //    never lock a student out mid-exam — the submit path stays guarded).
    const { data: prior, error: priorErr } = await sb
      .from("exam_submissions")
      .select("id")
      .eq("corso_id", corsoId)
      .eq("test_key", res.payload.t)
      .eq("mode", "exam")
      .eq(subjS != null ? "corsista_id" : "partecipante_id", (subjS ?? subjP)!)
      .limit(1);
    if (!priorErr && prior && prior.length > 0) {
      return (
        <Blocked
          icon="✓"
          title={CHROME[lang].submittedTitle}
          body={CHROME[lang].submittedBody}
        />
      );
    }

    // 2) ABSENT AT THE ROLL-CALL → no access (owner's rule: the student must be
    //    present to sit the test). Same canonical presence rule as the send
    //    gate (day test ↔ that day; feedback/final ↔ any attended day); fails
    //    open only when attendance is UNKNOWN (DB error / pre-migration).
    const present = await loadPresentForTest(sb, corsoId, res.payload.t);
    const subjectKey = subjS != null ? `c${subjS}` : `p${subjP}`;
    if (isBlockedByAbsence(present, subjectKey)) {
      return (
        <Blocked icon="!" title="Accesso non disponibile" body={absentAccessError(res.payload.t)} />
      );
    }
  }

  const family = corso.type === "shochu" ? "shochu" : "nihonshu";
  const mode = res.payload.m;
  const isPreview = mode === "test" || mode === "validate";
  // Previews load the correct answers so the runner can compute the outcome at
  // the end. Only "validate" reveals answers DURING the run; "test" is a clean
  // student-like preview that ends with the computed esito.
  const data = await loadPublicExam(res.payload.c, family, res.payload.t, isPreview);
  if (!data) return <Invalid reason="Corso non trovato." />;

  const baseLabel =
    res.payload.t === "final"
      ? "Esame finale"
      : res.payload.t === "feedback"
        ? "Feedback"
        : `Test ${res.payload.t.replace("day", "giorno ")}`;
  const testLabel =
    mode === "validate" ? `${baseLabel} · VALIDAZIONE` : mode === "test" ? `${baseLabel} · ANTEPRIMA` : baseLabel;

  return (
    <ExamGate
      token={token}
      mode={mode}
      // A personal link carries the bound subject id — corsista (`s`) OR
      // companion (`p`); a shared class link carries neither (→ the email gate
      // resolves it). Never expose the id itself.
      personal={Boolean(res.payload.s || res.payload.p)}
      forcedLang={res.payload.l}
      // Proctored exams identify the student by the verified name-pick
      // (corsista_id), so the runner must NOT also ask them to re-type their
      // name/email — that was redundant AND let a student stamp someone else's
      // email onto their submission (wrong certificate / PII leak). Identity is
      // written server-side from the enrolled corsista at submit.
      collectRegistration={false}
      reveal={mode === "validate"}
      showResult={isPreview}
      // Only the FINAL exam is "certified"; day tests (giorno 1..N) end with a
      // plain "Grazie" — no certified/result claim on the thank-you screen.
      isFinal={res.payload.t === "final"}
      header={{
        courseName: data.header.courseName,
        testLabel,
        place: data.header.place,
        date: data.header.date,
        educator: data.header.educator,
      }}
      questions={data.questions}
    />
  );
}
