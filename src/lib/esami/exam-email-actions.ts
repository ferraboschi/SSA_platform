"use server";

// Editor-facing actions for the 3 exam-result email templates: load, save, and
// send a TEST email (so staff can verify look + delivery on their own inbox
// before any real student gets one). Admin/manager only.

import { assertRole } from "@/lib/auth/guard";
import { getEmailService } from "@/lib/integrations/email";
import { appConfig } from "@/lib/integrations/config";
import { renderCertificatePdf } from "./certificate-pdf";
import { loadExamEmailTemplates, writeExamEmailTemplates } from "./exam-email-store";
import {
  renderExamEmail,
  EXAM_OUTCOMES,
  OUTCOME_LABEL_IT,
  type ExamEmailTemplate,
  type ExamEmailTemplates,
  type ExamOutcome,
} from "./exam-email";

export async function getExamEmailTemplatesAction(): Promise<ExamEmailTemplates> {
  await assertRole(["admin", "manager"]);
  return loadExamEmailTemplates();
}

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
  const { subject, html } = renderExamEmail(
    tpl,
    {
      nome: "Mario Rossi",
      corso: "Sake Sommelier Certificato",
      punteggio: 82,
      esito: OUTCOME_LABEL_IT[outcome],
    },
    { reportUrl: `${base}/esami`, outcome },
  );
  // Attach a sample outcome PDF so the test also shows the branded attachment.
  let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
  try {
    const buf = await renderCertificatePdf({
      name: "Mario Rossi",
      family: "nihonshu",
      status: outcome,
      score: 82,
      sections: [],
      course: { day: 14, month: "Settembre", year: 2026, city: "Online", educatorName: "—" },
      completedAt: new Date().toISOString(),
    });
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
