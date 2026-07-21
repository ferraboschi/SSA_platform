"use server";

// Editor-facing actions for the 3 exam-result email templates: load, save, and
// send a TEST email (so staff can verify look + delivery on their own inbox
// before any real student gets one). Admin/manager only.

import { assertRole } from "@/lib/auth/guard";
import { getEmailService } from "@/lib/integrations/email";
import { appConfig } from "@/lib/integrations/config";
import { renderCertificatePdf } from "./certificate-pdf";
import { loadExamEmailTemplates, writeExamEmailTemplates } from "./exam-email-store";
import { getUpcomingCourseLines } from "./upcoming-courses";
import {
  renderExamEmail,
  EXAM_OUTCOMES,
  OUTCOME_LABEL_IT,
  type ExamEmailTemplate,
  type ExamEmailTemplates,
  type ExamOutcome,
} from "./exam-email";

export async function saveExamEmailTemplatesAction(
  templates: ExamEmailTemplates,
): Promise<{ ok: boolean; error?: string }> {
  await assertRole(["admin", "manager"]);
  for (const o of EXAM_OUTCOMES) {
    const t = templates?.[o];
    if (!t || !t.subject?.trim() || !t.body?.trim()) {
      return { ok: false, error: `Oggetto e testo sono obbligatori (${OUTCOME_LABEL_IT[o]}).` };
    }
  }
  // Persist only the three known outcomes (ignore anything else).
  const clean = {} as ExamEmailTemplates;
  for (const o of EXAM_OUTCOMES) {
    clean[o] = { subject: templates[o].subject.trim(), body: templates[o].body };
  }
  await writeExamEmailTemplates(clean);
  return { ok: true };
}

/** Send a TEST of one outcome's email to `to`, using the (optionally unsaved)
 *  draft passed from the editor, with sample data. */
export async function sendExamResultTestAction(
  outcome: ExamOutcome,
  to: string,
  draft?: ExamEmailTemplate,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  await assertRole(["admin", "manager"]);
  const dest = (to || "").trim().toLowerCase();
  if (!dest || !dest.includes("@")) return { ok: false, error: "Email di prova non valida." };
  if (!EXAM_OUTCOMES.includes(outcome)) return { ok: false, error: "Esito non valido." };

  const tpl = draft ?? (await loadExamEmailTemplates())[outcome];
  if (!tpl?.subject?.trim() || !tpl?.body?.trim()) {
    return { ok: false, error: "Oggetto e testo sono obbligatori." };
  }
  const base = appConfig.baseUrl.replace(/\/$/, "");
  const courses = await getUpcomingCourseLines(4);
  const { subject, html } = renderExamEmail(
    tpl,
    {
      nome: "Mario Rossi",
      corso: "Sake Sommelier Certificato",
      punteggio: 82,
      esito: OUTCOME_LABEL_IT[outcome],
    },
    { reportUrl: `${base}/esami`, outcome, courses },
  );
  // Attach a sample outcome PDF so the test also shows the branded attachment.
  let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
  try {
    const buf = await renderCertificatePdf({
      name: "Mario Rossi",
      family: "nihonshu",
      status: outcome,
      score: 82,
      // Sample per-area breakdown + cohort media so the test email shows the
      // enriched certificate exactly as a real student would receive it.
      sections: [
        { name: "Storia & Cultura", pct: 92, correct: 11, total: 12 },
        { name: "Produzione & Tecnica", pct: 78, correct: 7, total: 9 },
        { name: "Varietà & Stili", pct: 84, correct: 8, total: 10 },
        { name: "Degustazione & Sensoriale", pct: 66, correct: 4, total: 7 },
        { name: "Servizio & Pairing", pct: 88, correct: 6, total: 7 },
      ],
      classAvg: 79,
      // Sample open-answer review so the test email shows the second page too.
      openReview: [
        {
          question:
            "Basandoti su queste informazioni (純米酒, acidità 1,9, SMV +7), come ti aspetteresti questo sake e in che bicchiere lo serviresti?",
          given:
            "una acidità spiccata, una secchezza che ne aumenta la beverinità, mi aspetto un profilo secco ma con un bel corpo",
          vote: 4,
          points: 1.5,
          maxPoints: 2,
          rationale:
            "Hai colto bene acidità alta (1,9) e secchezza (SMV +7 = pochi zuccheri) e la correlazione acidità→corpo. Per completezza avresti potuto indicare il bicchiere richiesto dalla domanda: un calice ampio per esaltare aromi e struttura.",
        },
        {
          question: "Quali piatti si abbinerebbero meglio ad un ginjō?",
          given: "piatti crudi, piatti che vengono serviti freschi",
          vote: 4,
          points: 1.5,
          maxPoints: 2,
          rationale:
            "Hai centrato il nucleo: il ginjō (aromatico/kunshu) si abbina a piatti freschi e crudi. Per arricchire: esempi come carpaccio marinato in limone/ponzu o crostacei crudi, evitando fritti, grassi e piatti molto pomodorosi.",
        },
        {
          question:
            "Con metodo sokujo, qual è il corretto procedimento iniziale di preparazione dello shubo?",
          given:
            "nell'acqua aggiungo kojimai, kakemai, acido lattico e poi, amalgamato l'acido, aggiungo i lieviti",
          vote: 5,
          points: 2,
          maxPoints: 2,
          rationale:
            "Hai colto l'elemento chiave del sokujo: l'acido lattico aggiunto direttamente allo shubo abbassa subito il pH, con gli ingredienti corretti. Spunto: il metodo dimezza i tempi (~15 giorni) rispetto al kimoto.",
        },
      ],
      course: { day: 14, month: "Settembre", year: 2026, city: "Online", educatorName: "—" },
      completedAt: new Date().toISOString(),
    }, ["it"]);
    attachments = [
      { filename: "esito-esame-prova.pdf", content: buf.toString("base64"), contentType: "application/pdf" },
    ];
  } catch {
    /* PDF is best-effort for the test — still send the email */
  }

  try {
    const res = await getEmailService().send({
      to: dest,
      subject: `[PROVA] ${subject}`,
      html,
      tag: "exam-result-test",
      attachments,
    });
    if (res.status === "skipped") {
      return { ok: true, status: "skipped", error: "Email non configurata (Resend assente)." };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invio non riuscito." };
  }
}
