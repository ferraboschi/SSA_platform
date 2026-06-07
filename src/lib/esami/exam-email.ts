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
    subject: "Hai superato l'esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "complimenti! Hai superato l'esame del corso {corso} con un punteggio del {punteggio}%. È un traguardo di cui andare fieri.\n\n" +
      "In allegato trovi il tuo certificato ufficiale. Continua il tuo percorso con gli altri corsi SSA: sarebbe un piacere riaverti in aula.\n\n" +
      "A presto,\nSake Sommelier Association",
  },
  retrial: {
    subject: "Esito esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "il tuo esame del corso {corso} si è concluso con un punteggio del {punteggio}%: sei ammesso al recupero. Ci sei quasi!\n\n" +
      "Ti contatteremo a breve con le indicazioni per la prova di recupero. In allegato trovi il dettaglio del tuo esito.\n\n" +
      "A presto,\nSake Sommelier Association",
  },
  failed: {
    subject: "Esito esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "il tuo esame del corso {corso} si è concluso con un punteggio del {punteggio}%, che non raggiunge la soglia di superamento. Non scoraggiarti: può capitare e puoi riprovare.\n\n" +
      "Puoi ripartecipare allo stesso corso gratuitamente: scrivi a corsi@sakesommelierassociation.it e organizziamo una nuova data per te. In allegato trovi il dettaglio del tuo esito.\n\n" +
      "Un caro saluto,\nSake Sommelier Association",
  },
};

// Branded email assets (absolute URLs — emails can't reference local files).
const LOGO_URL = "https://platform.sakesommelierassociation.it/ssa-logo.png";
const COURSES_URL = "https://www.sakesommelierassociation.it/collections/tutti-i-corsi";
const ACCENT: Record<ExamOutcome, string> = {
  passed: "#15803d",
  retrial: "#b45309",
  failed: "#b42318",
};
// Fallback when no live upcoming courses are available (e.g. editor preview).
const COURSE_LIST_FALLBACK = ["Introduttivo", "Certificato", "Shochu", "Masterclass"];

export interface UpcomingCourseLine {
  label: string;
}

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

/** Full email: subject + the fixed branded SSA shell wrapping the rendered body,
 *  a prominent score badge, the certificate + courses CTAs, and the privacy note. */
export function renderExamEmail(
  tpl: ExamEmailTemplate,
  v: ExamEmailVars,
  opts?: { reportUrl?: string; outcome?: ExamOutcome; courses?: UpcomingCourseLine[] },
): { subject: string; html: string } {
  const subject = fillVars(tpl.subject, v);
  const outcome = opts?.outcome ?? "passed";
  const accent = ACCENT[outcome];

  // Prominent score badge ("valorizza la numerica").
  const scoreBadge = `<table role="presentation" width="100%" style="margin:8px 0 20px"><tr><td>
    <div style="border:2px solid ${accent};border-radius:12px;padding:18px 20px;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${accent}">Punteggio</div>
      <div style="font-size:46px;line-height:1.05;font-weight:800;color:${accent};margin:4px 0">${v.punteggio}%</div>
      <div style="font-size:14px;font-weight:700;color:${accent}">${v.esito}</div>
    </div>
  </td></tr></table>`;

  const certButton = opts?.reportUrl
    ? `<p style="margin:8px 0 4px"><a href="${opts.reportUrl}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Apri il certificato</a></p>`
    : "";

  const courseList =
    opts?.courses && opts.courses.length
      ? opts.courses
          .map(
            (c) =>
              `<tr><td style="padding:5px 0;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f3f3f6">${escapeHtml(c.label)}</td></tr>`,
          )
          .join("")
      : `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280">${COURSE_LIST_FALLBACK.join(" · ")}</td></tr>`;
  const coursesCta = `<div style="margin-top:26px;padding-top:18px;border-top:1px solid #ececf1">
    <div style="font-size:13px;font-weight:700;color:#1a1a2e">Continua il tuo percorso · prossimi corsi</div>
    <table role="presentation" width="100%" style="margin:8px 0 14px">${courseList}</table>
    <a href="${COURSES_URL}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600">Vedi tutti i corsi</a>
  </div>`;

  const privacy = `<p style="font-size:11.5px;color:#9ca3af;line-height:1.5;margin-top:22px;font-style:italic">
    Questo esito è personale: ti chiediamo di non pubblicare questo documento sui social.
  </p>`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ececf1;border-radius:14px;overflow:hidden">
    <div style="padding:24px 28px 18px;text-align:center;border-bottom:1px solid #ececf1">
      <img src="${LOGO_URL}" alt="Sake Sommelier Association" height="44" style="height:44px;width:auto" />
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4f46e5;margin-top:8px">Sake Sommelier Association</div>
    </div>
    <div style="padding:24px 28px;color:#1a1a1a">
      ${scoreBadge}
      <div>${bodyToHtml(tpl.body, v)}</div>
      ${certButton}
      ${coursesCta}
      ${privacy}
      <p style="font-size:11px;color:#c0c4cc;margin-top:18px">Email automatica · Sake Sommelier Association</p>
    </div>
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
