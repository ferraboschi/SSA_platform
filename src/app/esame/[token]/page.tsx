// Public, tokenized exam runner — reachable WITHOUT app login.
//
// The link is a signed, expiring token (src/lib/exam-links/token.ts). It is not
// permanent and is specific to one course + one test. We verify it, then load
// the course header + the test's questions via the service client (the anon
// client is blocked by RLS on a public page).
import type { Metadata } from "next";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyExamToken } from "@/lib/exam-links/token";
import { loadPublicExam } from "@/lib/exam-links/load";
import { ExamRunner } from "@/components/esame-pubblico/ExamRunner";
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

  // We need the course type to resolve the exam family. Read it (service role).
  const sb = getSupabaseServiceClient();
  const { data: corso } = await sb
    .from("corsi")
    .select("type")
    .eq("id", Number(res.payload.c))
    .maybeSingle();
  if (!corso) return <Invalid reason="Corso non trovato." />;

  const family = corso.type === "shochu" ? "shochu" : "nihonshu";
  const data = await loadPublicExam(res.payload.c, family, res.payload.t);
  if (!data) return <Invalid reason="Corso non trovato." />;

  const testLabel =
    res.payload.t === "final"
      ? "Esame finale"
      : res.payload.t === "feedback"
        ? "Feedback"
        : `Test ${res.payload.t.replace("day", "giorno ")}`;

  return (
    <ExamRunner
      mode={res.payload.m}
      forcedLang={res.payload.l}
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
