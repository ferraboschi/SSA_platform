// Exam-result email templates — PURE module (no server / no client deps) so it
// can render both in the editor preview (client) and at send time (server).
//
// Format chosen by the user: plain text + {variables}, Italian. The visual shell
// (SSA header, certificate button, footer) is fixed; staff only edit subject +
// body text per outcome.

export type ExamOutcome = "passed" | "retrial" | "failed";

/** Languages the result email can render in. Mirrors the report/certificate set. */
export type ExamEmailLang = "it" | "en" | "ja";

/** Normalise a free-form `result.lang` (`string | null`) to a supported language,
 *  falling back to Italian — the historical default — for null/unknown values. */
export function normalizeExamLang(lang: string | null | undefined): ExamEmailLang {
  return lang === "en" || lang === "ja" ? lang : "it";
}

export interface ExamEmailTemplate {
  subject: string;
  body: string;
}
export type ExamEmailTemplates = Record<ExamOutcome, ExamEmailTemplate>;

export const EXAM_OUTCOMES: ExamOutcome[] = ["passed", "retrial", "failed"];

export const OUTCOME_LABEL_IT: Record<ExamOutcome, string> = {
  passed: "Promosso",
  retrial: "Rimandato",
  failed: "Bocciato",
};

/** Outcome labels shown in the score badge, per language (IT is OUTCOME_LABEL_IT). */
export const OUTCOME_LABEL_BY_LANG: Record<ExamEmailLang, Record<ExamOutcome, string>> = {
  it: OUTCOME_LABEL_IT,
  en: { passed: "Passed", retrial: "Retrial", failed: "Failed" },
  ja: { passed: "合格", retrial: "再試験", failed: "不合格" },
};

/** Variables the user can drop into subject/body. */
export const EXAM_EMAIL_VARS: { key: string; desc: string }[] = [
  { key: "{nome}", desc: "Nome dello studente" },
  { key: "{corso}", desc: "Titolo del corso" },
  { key: "{punteggio}", desc: "Punteggio % ottenuto" },
  { key: "{esito}", desc: "Esito (Promosso / Recupero / Bocciato)" },
];

/** Italian defaults — also the base the staff-editable templates are merged onto
 *  (the editor edits ONLY the Italian ones). EN/JA live in DEFAULTS_BY_LANG below
 *  and are used automatically when the student's language is en/ja. */
export const DEFAULT_EXAM_EMAIL_TEMPLATES: ExamEmailTemplates = {
  passed: {
    subject: "Hai superato l'esame SSA · {corso}",
    body:
      "Ciao {nome},\n\n" +
      "complimenti! Hai superato l'esame del corso {corso} con un punteggio del {punteggio}%. È un traguardo di cui andare fieri.\n\n" +
      "In allegato trovi il resoconto personale della tua prova (documento non ufficiale). Continua il tuo percorso con gli altri corsi SSA: sarebbe un piacere riaverti in aula.\n\n" +
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

/** English defaults — used when the student's language is `en`. */
const DEFAULT_EXAM_EMAIL_TEMPLATES_EN: ExamEmailTemplates = {
  passed: {
    subject: "You passed your SSA exam · {corso}",
    body:
      "Hi {nome},\n\n" +
      "congratulations! You passed the exam for the {corso} course with a score of {punteggio}%. It's an achievement to be proud of.\n\n" +
      "A personal record of your exam is attached (not an official document). Keep going with the other SSA courses: we'd love to have you back in the classroom.\n\n" +
      "See you soon,\nSake Sommelier Association",
  },
  retrial: {
    subject: "Your SSA exam result · {corso}",
    body:
      "Hi {nome},\n\n" +
      "your exam for the {corso} course finished with a score of {punteggio}%: you are admitted to the retrial. You're almost there!\n\n" +
      "We'll be in touch shortly with the details for your retrial session. Your full result is attached.\n\n" +
      "See you soon,\nSake Sommelier Association",
  },
  failed: {
    subject: "Your SSA exam result · {corso}",
    body:
      "Hi {nome},\n\n" +
      "your exam for the {corso} course finished with a score of {punteggio}%, which is below the passing threshold. Don't be discouraged: it happens, and you can try again.\n\n" +
      "You can retake the same course free of charge: write to corsi@sakesommelierassociation.it and we'll arrange a new date for you. Your full result is attached.\n\n" +
      "Warm regards,\nSake Sommelier Association",
  },
};

/** Japanese defaults — used when the student's language is `ja`. */
const DEFAULT_EXAM_EMAIL_TEMPLATES_JA: ExamEmailTemplates = {
  passed: {
    subject: "SSA試験に合格されました · {corso}",
    body:
      "{nome}様\n\n" +
      "おめでとうございます。{corso}コースの試験に{punteggio}%の得点で合格されました。誇りに思える素晴らしい成果です。\n\n" +
      "試験の個人記録を本メールに添付しております（非公式の文書です）。ぜひ他のSSAコースへも学びを続けてください。またお会いできることを楽しみにしております。\n\n" +
      "今後ともよろしくお願いいたします。\nサケソムリエ協会",
  },
  retrial: {
    subject: "SSA試験の結果 · {corso}",
    body:
      "{nome}様\n\n" +
      "{corso}コースの試験は{punteggio}%の得点で終了し、再試験の対象となりました。合格まであと少しです。\n\n" +
      "再試験の詳細につきましては、追ってご連絡いたします。結果の詳細を本メールに添付しております。\n\n" +
      "今後ともよろしくお願いいたします。\nサケソムリエ協会",
  },
  failed: {
    subject: "SSA試験の結果 · {corso}",
    body:
      "{nome}様\n\n" +
      "{corso}コースの試験は{punteggio}%の得点で終了し、合格基準には達しませんでした。どうかお気を落とされませんように。再挑戦が可能です。\n\n" +
      "同じコースを無料で再受講いただけます。corsi@sakesommelierassociation.it までご連絡いただければ、新しい日程を調整いたします。結果の詳細を本メールに添付しております。\n\n" +
      "どうぞよろしくお願いいたします。\nサケソムリエ協会",
  },
};

/** Per-language default templates. `it` is the staff-editable base; en/ja are used
 *  automatically for students whose language is en/ja. */
export const DEFAULTS_BY_LANG: Record<ExamEmailLang, ExamEmailTemplates> = {
  it: DEFAULT_EXAM_EMAIL_TEMPLATES,
  en: DEFAULT_EXAM_EMAIL_TEMPLATES_EN,
  ja: DEFAULT_EXAM_EMAIL_TEMPLATES_JA,
};

/** Body variants WITHOUT the score clause — used when no objective % is certified
 *  (all-manual exam or operator override), so the email never reads "del null%".
 *  Subjects don't reference the score, so they stay the staff-edited ones.
 *  (Italian; per-language variants are in NOSCORE_BODY_BY_LANG below.) */
export const EXAM_EMAIL_BODY_NOSCORE: Record<ExamOutcome, string> = {
  passed:
    "Ciao {nome},\n\n" +
    "complimenti! Hai superato l'esame del corso {corso}. È un traguardo di cui andare fieri.\n\n" +
    "In allegato trovi il resoconto personale della tua prova (documento non ufficiale). Continua il tuo percorso con gli altri corsi SSA: sarebbe un piacere riaverti in aula.\n\n" +
    "A presto,\nSake Sommelier Association",
  retrial:
    "Ciao {nome},\n\n" +
    "il tuo esame del corso {corso} si è concluso: sei ammesso al recupero. Ci sei quasi!\n\n" +
    "Ti contatteremo a breve con le indicazioni per la prova di recupero. In allegato trovi il dettaglio del tuo esito.\n\n" +
    "A presto,\nSake Sommelier Association",
  failed:
    "Ciao {nome},\n\n" +
    "il tuo esame del corso {corso} si è concluso e non raggiunge la soglia di superamento. Non scoraggiarti: può capitare e puoi riprovare.\n\n" +
    "Puoi ripartecipare allo stesso corso gratuitamente: scrivi a corsi@sakesommelierassociation.it e organizziamo una nuova data per te. In allegato trovi il dettaglio del tuo esito.\n\n" +
    "Un caro saluto,\nSake Sommelier Association",
};

/** English no-score bodies. */
const EXAM_EMAIL_BODY_NOSCORE_EN: Record<ExamOutcome, string> = {
  passed:
    "Hi {nome},\n\n" +
    "congratulations! You passed the exam for the {corso} course. It's an achievement to be proud of.\n\n" +
    "A personal record of your exam is attached (not an official document). Keep going with the other SSA courses: we'd love to have you back in the classroom.\n\n" +
    "See you soon,\nSake Sommelier Association",
  retrial:
    "Hi {nome},\n\n" +
    "your exam for the {corso} course has concluded: you are admitted to the retrial. You're almost there!\n\n" +
    "We'll be in touch shortly with the details for your retrial session. Your full result is attached.\n\n" +
    "See you soon,\nSake Sommelier Association",
  failed:
    "Hi {nome},\n\n" +
    "your exam for the {corso} course has concluded and is below the passing threshold. Don't be discouraged: it happens, and you can try again.\n\n" +
    "You can retake the same course free of charge: write to corsi@sakesommelierassociation.it and we'll arrange a new date for you. Your full result is attached.\n\n" +
    "Warm regards,\nSake Sommelier Association",
};

/** Japanese no-score bodies. */
const EXAM_EMAIL_BODY_NOSCORE_JA: Record<ExamOutcome, string> = {
  passed:
    "{nome}様\n\n" +
    "おめでとうございます。{corso}コースの試験に合格されました。誇りに思える素晴らしい成果です。\n\n" +
    "試験の個人記録を本メールに添付しております（非公式の文書です）。ぜひ他のSSAコースへも学びを続けてください。またお会いできることを楽しみにしております。\n\n" +
    "今後ともよろしくお願いいたします。\nサケソムリエ協会",
  retrial:
    "{nome}様\n\n" +
    "{corso}コースの試験が終了し、再試験の対象となりました。合格まであと少しです。\n\n" +
    "再試験の詳細につきましては、追ってご連絡いたします。結果の詳細を本メールに添付しております。\n\n" +
    "今後ともよろしくお願いいたします。\nサケソムリエ協会",
  failed:
    "{nome}様\n\n" +
    "{corso}コースの試験が終了し、合格基準には達しませんでした。どうかお気を落とされませんように。再挑戦が可能です。\n\n" +
    "同じコースを無料で再受講いただけます。corsi@sakesommelierassociation.it までご連絡いただければ、新しい日程を調整いたします。結果の詳細を本メールに添付しております。\n\n" +
    "どうぞよろしくお願いいたします。\nサケソムリエ協会",
};

/** Per-language no-score bodies. */
const NOSCORE_BODY_BY_LANG: Record<ExamEmailLang, Record<ExamOutcome, string>> = {
  it: EXAM_EMAIL_BODY_NOSCORE,
  en: EXAM_EMAIL_BODY_NOSCORE_EN,
  ja: EXAM_EMAIL_BODY_NOSCORE_JA,
};

/** The body to render: the (staff-editable, Italian) template body when a numeric
 *  score is shown, else the no-score variant for that outcome. `lang` selects the
 *  language for the no-score fallback (defaults to Italian for byte-identical
 *  behaviour). Note: when a score IS shown, the template body wins — for en/ja the
 *  localized template is passed in by the caller, so the language is honoured there. */
export function examEmailBody(
  tpl: ExamEmailTemplate,
  outcome: ExamOutcome,
  hasScore: boolean,
  lang: ExamEmailLang = "it",
): string {
  return hasScore ? tpl.body : NOSCORE_BODY_BY_LANG[lang][outcome];
}

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

/** Fixed (non-editable) UI strings baked into the branded shell, per language. */
interface ExamEmailUi {
  scoreBadgeLabel: string;
  certNote: string;
  coursesHeading: string;
  coursesButton: string;
  privacy: string;
  autoFooter: string;
}
const EMAIL_UI_BY_LANG: Record<ExamEmailLang, ExamEmailUi> = {
  it: {
    scoreBadgeLabel: "Punteggio",
    certNote: "📎 In allegato trovi il resoconto personale della tua prova (PDF): è un documento non ufficiale, non sostituisce l'esito ufficiale SSA.",
    coursesHeading: "Continua il tuo percorso · prossimi corsi",
    coursesButton: "Vedi tutti i corsi",
    privacy: "Questo esito è personale: ti chiediamo di non pubblicare questo documento sui social.",
    autoFooter: "Email automatica · Sake Sommelier Association",
  },
  en: {
    scoreBadgeLabel: "Score",
    certNote: "📎 A personal record of your exam is attached (PDF): it is not an official document and does not replace the official SSA outcome.",
    coursesHeading: "Continue your journey · upcoming courses",
    coursesButton: "See all courses",
    privacy: "This result is personal: please do not publish this document on social media.",
    autoFooter: "Automated email · Sake Sommelier Association",
  },
  ja: {
    scoreBadgeLabel: "得点",
    certNote: "📎 試験の個人記録をPDFで添付しています（非公式の文書であり、SSAの公式な結果に代わるものではありません）。",
    coursesHeading: "学びを続けましょう · 今後のコース",
    coursesButton: "すべてのコースを見る",
    privacy: "この結果は個人的なものです。本書類をSNS上に公開しないようお願いします。",
    autoFooter: "自動送信メール · サケソムリエ協会",
  },
};

export interface UpcomingCourseLine {
  label: string;
}

export interface ExamEmailVars {
  nome: string;
  corso: string;
  /** Objective score %, or null when no number is certified — the email then omits
   *  the score badge and uses the no-score body variant (never "del null%"). */
  punteggio: number | string | null;
  esito: string;
}

export function fillVars(s: string, v: ExamEmailVars): string {
  return s
    .split("{nome}").join(v.nome)
    .split("{corso}").join(v.corso)
    .split("{punteggio}").join(v.punteggio == null ? "" : String(v.punteggio))
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
  opts?: {
    reportUrl?: string;
    outcome?: ExamOutcome;
    courses?: UpcomingCourseLine[];
    /** Student's language — selects the no-score body + fixed UI strings.
     *  Defaults to Italian for byte-identical legacy output. */
    lang?: ExamEmailLang;
  },
): { subject: string; html: string } {
  const subject = fillVars(tpl.subject, v);
  const outcome = opts?.outcome ?? "passed";
  const lang = opts?.lang ?? "it";
  const ui = EMAIL_UI_BY_LANG[lang];
  const accent = ACCENT[outcome];
  const hasScore = v.punteggio != null;

  // Prominent score badge ("valorizza la numerica") — only when a % is certified.
  const scoreBadge = hasScore
    ? `<table role="presentation" width="100%" style="margin:8px 0 20px"><tr><td>
    <div style="border:2px solid ${accent};border-radius:12px;padding:18px 20px;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${accent}">${ui.scoreBadgeLabel}</div>
      <div style="font-size:46px;line-height:1.05;font-weight:800;color:${accent};margin:4px 0">${v.punteggio}%</div>
      <div style="font-size:14px;font-weight:700;color:${accent}">${v.esito}</div>
    </div>
  </td></tr></table>`
    : "";

  // The certificate PDF is ATTACHED to this email. Students have no account, so we
  // must NOT link to the staff-only report page (a dead end) — point to the file.
  const certNote = `<p style="margin:8px 0 4px;font-size:13px;color:#6b7280">${ui.certNote}</p>`;

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
    <div style="font-size:13px;font-weight:700;color:#1a1a2e">${ui.coursesHeading}</div>
    <table role="presentation" width="100%" style="margin:8px 0 14px">${courseList}</table>
    <a href="${COURSES_URL}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600">${ui.coursesButton}</a>
  </div>`;

  const privacy = `<p style="font-size:11.5px;color:#9ca3af;line-height:1.5;margin-top:22px;font-style:italic">
    ${ui.privacy}
  </p>`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ececf1;border-radius:14px;overflow:hidden">
    <div style="padding:24px 28px 18px;text-align:center;border-bottom:1px solid #ececf1">
      <img src="${LOGO_URL}" alt="Sake Sommelier Association" height="44" style="height:44px;width:auto" />
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4f46e5;margin-top:8px">Sake Sommelier Association</div>
    </div>
    <div style="padding:24px 28px;color:#1a1a1a">
      ${scoreBadge}
      <div>${bodyToHtml(examEmailBody(tpl, outcome, hasScore, lang), v)}</div>
      ${certNote}
      ${coursesCta}
      ${privacy}
      <p style="font-size:11px;color:#c0c4cc;margin-top:18px">${ui.autoFooter}</p>
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
