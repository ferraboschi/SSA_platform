// Exam-result email templates — PURE module (no server / no client deps) so it
// can render both in the editor preview (client) and at send time (server).
//
// Format chosen by the user: plain text + {variables}, Italian. The visual shell
// (SSA header, certificate button, footer) is fixed; staff only edit subject +
// body text per outcome.

export type ExamOutcome = "passed" | "retrial" | "failed";

export interface ExamEmailTemplate {
  subject: string;
  body: string;
}
export type ExamEmailTemplates = Record<ExamOutcome, ExamEmailTemplate>;

export const EXAM_OUTCOMES: ExamOutcome[] = ["passed", "retrial", "failed"];

export const OUTCOME_LABEL_IT: Record<ExamOutcome, string> = {
  passed: "Promosso",
  retrial: "Recupero",
  failed: "Bocciato",
};

/** Variables the user can drop into subject/body. */
export const EXAM_EMAIL_VARS: { key: string; desc: string }[] = [
  { key: "{nome}", desc: "Nome dello studente" },
  { key: "{corso}", desc: "Titolo del corso" },
  { key: "{punteggio}", desc: "Punteggio % ottenuto" },
  { key: "{esito}", desc: "Esito (Promosso / Recupero / Bocciato)" },
];

export const DEFAULT_EXAM_EMAIL_TEMPLATES: ExamEmailTemplates = {
  passed: {
    subject: "Esito esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "complimenti! Hai superato l'esame del corso {corso} con un punteggio del {punteggio}%.\n\n" +
      "In allegato trovi il tuo certificato; puoi anche aprirlo dal pulsante qui sotto.\n\n" +
      "A presto,\nSake Sommelier Association",
  },
  retrial: {
    subject: "Esito esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "il tuo esame del corso {corso} si è concluso con un punteggio del {punteggio}%: sei ammesso al recupero.\n\n" +
      "Ti contatteremo a breve con le indicazioni per la prova di recupero.\n\n" +
      "A presto,\nSake Sommelier Association",
  },
  failed: {
    subject: "Esito esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "il tuo esame del corso {corso} si è concluso con un punteggio del {punteggio}%, che non raggiunge la soglia di superamento.\n\n" +
      "Per qualsiasi chiarimento siamo a tua disposizione.\n\n" +
      "Un caro saluto,\nSake Sommelier Association",
  },
};

export interface ExamEmailVars {
  nome: string;
  corso: string;
  punteggio: number | string;
  esito: string;
}

export function fillVars(s: string, v: ExamEmailVars): string {
  return s
    .split("{nome}").join(v.nome)
    .split("{corso}").join(v.corso)
    .split("{punteggio}").join(String(v.punteggio))
    .split("{esito}").join(v.esito);
}

function escapeHtml(s: string): string {
  return s
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
}

/** Plain-text body (with {vars}) → safe HTML paragraphs. User text is escaped. */
export function bodyToHtml(body: string, v: ExamEmailVars): string {
  const filled = fillVars(body, v);
  return escapeHtml(filled)
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1a1a1a">${p
          .split("\n")
          .join("<br/>")}</p>`,
    )
    .join("");
}

/** Full email: subject + the fixed SSA shell wrapping the rendered body. */
export function renderExamEmail(
  tpl: ExamEmailTemplate,
  v: ExamEmailVars,
  reportUrl?: string,
): { subject: string; html: string } {
  const subject = fillVars(tpl.subject, v);
  const button = reportUrl
    ? `<p style="margin:22px 0 6px"><a href="${reportUrl}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Apri il certificato</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <div style="margin-top:14px">${bodyToHtml(tpl.body, v)}</div>
    ${button}
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Email automatica · Sake Sommelier Association</p>
  </div>`;
  return { subject, html };
}

/** Merge a possibly-partial saved object with defaults (every outcome present). */
export function mergeExamEmailTemplates(
  saved: Partial<Record<ExamOutcome, Partial<ExamEmailTemplate>>> | null | undefined,
): ExamEmailTemplates {
  const out = {} as ExamEmailTemplates;
  for (const o of EXAM_OUTCOMES) {
    out[o] = { ...DEFAULT_EXAM_EMAIL_TEMPLATES[o], ...(saved?.[o] ?? {}) };
  }
  return out;
}
