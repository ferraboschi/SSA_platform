"use server";

// Editor-facing actions for the 3 exam-result email templates: load, save, and
// send a TEST email (so staff can verify look + delivery on their own inbox
// before any real student gets one). Admin/manager only.

import { assertRole } from "@/lib/auth/guard";
import { getEmailService } from "@/lib/integrations/email";
import { appConfig } from "@/lib/integrations/config";
import { renderCertificatePdf } from "./certificate-pdf";
import {
  loadExamEmailTemplatesForLang,
  writeAllExamEmailTemplates,
} from "./exam-email-store";
import { getUpcomingCourseLines } from "./upcoming-courses";
import {
  renderExamEmail,
  EXAM_OUTCOMES,
  EXAM_EMAIL_LANGS,
  OUTCOME_LABEL_IT,
  OUTCOME_LABEL_BY_LANG,
  LANG_LABEL,
  normalizeExamLang,
  type ExamEmailLang,
  type ExamEmailTemplate,
  type ExamEmailTemplates,
  type ExamOutcome,
} from "./exam-email";

export async function saveExamEmailTemplatesAction(
  byLang: Record<ExamEmailLang, ExamEmailTemplates>,
): Promise<{ ok: boolean; error?: string }> {
  await assertRole(["admin", "manager"]);
  // Validate + normalise every language × outcome; persist only the known ones.
  const clean = {} as Record<ExamEmailLang, ExamEmailTemplates>;
  for (const l of EXAM_EMAIL_LANGS) {
    const langTpls = byLang?.[l];
    const cleanLang = {} as ExamEmailTemplates;
    for (const o of EXAM_OUTCOMES) {
      const t = langTpls?.[o];
      if (!t || !t.subject?.trim() || !t.body?.trim()) {
        return {
          ok: false,
          error: `Oggetto e testo sono obbligatori (${LANG_LABEL[l]} · ${OUTCOME_LABEL_IT[o]}).`,
        };
      }
      cleanLang[o] = { subject: t.subject.trim(), body: t.body };
    }
    clean[l] = cleanLang;
  }
  await writeAllExamEmailTemplates(clean);
  return { ok: true };
}

/** Send a TEST of one outcome's email to `to`, in `lang`, using the (optionally
 *  unsaved) draft passed from the editor, with sample data. */
export async function sendExamResultTestAction(
  outcome: ExamOutcome,
  to: string,
  draft?: ExamEmailTemplate,
  langInput?: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  await assertRole(["admin", "manager"]);
  const dest = (to || "").trim().toLowerCase();
  if (!dest || !dest.includes("@")) return { ok: false, error: "Email di prova non valida." };
  if (!EXAM_OUTCOMES.includes(outcome)) return { ok: false, error: "Esito non valido." };
  const lang = normalizeExamLang(langInput);

  const tpl = draft ?? (await loadExamEmailTemplatesForLang(lang))[outcome];
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
      esito: OUTCOME_LABEL_BY_LANG[lang][outcome],
    },
    { reportUrl: `${base}/esami`, outcome, courses, lang },
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
    }, [lang]);
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
