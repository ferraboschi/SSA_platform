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
import { ExamGate } from "@/components/esame-pubblico/ExamGate";
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
