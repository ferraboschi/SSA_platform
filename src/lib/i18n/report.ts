// Trilingual exam-report document strings. The certificate/report is a document
// rendered in a chosen language (and in "trio" view, all three at once),
// independent of the app's UI locale — so it carries its own self-contained
// IT/EN/JA dictionary rather than going through the locale-scoped `useT()`.

import type { ExamFamily, ExamResultStatus } from "@/lib/domain";

export type ReportLang = "it" | "en" | "ja";

export interface ReportStrings {
  cert: string;
  family: Record<ExamFamily, string>;
  passedTitle: string;
  retrialTitle: string;
  failedTitle: string;
  score: string;
  breakdown: string;
  aiSummary: string;
  weakAreas: string;
  issued: string;
  examDate: string;
  location: string;
  educator: string;
  importantWrong: string;
  correctAnswer: string;
  yourAnswer: string;
  footer: string;
  advice: Record<ExamResultStatus, string>;
  /** "Soglia di promozione" — the fixed 80% reference under the score. */
  refThreshold: string;
  /** "Media classe" — cohort average, shown only when the sample is large enough. */
  classAvg: string;
  /** "Aree da consolidare" block title, per verdict (failed reframes it as gaps). */
  consolidate: Record<ExamResultStatus, string>;
  /** Lead sentence of the consolidate block, keyed by weakAreas()'s leadKey. */
  weakLead: Record<ExamResultStatus | "strong", string>;
  /** "Cosa succede ora" block: title + the per-verdict body (spilla/diploma). */
  nextTitle: string;
  next: Record<ExamResultStatus, string>;
}

export const REPORT_I18N: Record<ReportLang, ReportStrings> = {
  it: {
    cert: "Certificato di Esame",
    family: {
      nihonshu: "Sake Sommelier · Livello Certificato",
      shochu: "Shochu Sommelier · Livello Certificato",
    },
    passedTitle: "Promosso",
    retrialTitle: "Promosso con riserva",
    failedTitle: "Non promosso",
    score: "Punteggio finale",
    breakdown: "Punteggio per categoria",
    aiSummary: "Sintesi del percorso",
    weakAreas: "Aree da approfondire",
    issued: "Rilasciato il",
    examDate: "Data esame",
    location: "Sede",
    educator: "Educator",
    importantWrong: "Domande importanti da rivedere",
    correctAnswer: "Risposta corretta",
    yourAnswer: "La tua risposta",
    footer: "Sake Sommelier Association · sakesommelierassociation.it",
    advice: {
      passed:
        "Ottimo lavoro. Hai dimostrato una buona padronanza del programma. Continua con masterclass per consolidare l'esperienza.",
      retrial:
        "Hai raggiunto un buon livello generale ma alcune aree richiedono approfondimento. Sostieni la sessione di recupero entro 60 giorni.",
      failed:
        "Il punteggio è sotto la soglia richiesta. Ti consigliamo di rivedere il materiale e ripetere il corso o sostenere il recupero.",
    },
    refThreshold: "Soglia di promozione",
    classAvg: "Media classe",
    consolidate: {
      passed: "Aree da consolidare",
      retrial: "Aree da consolidare",
      failed: "Dove è mancata la preparazione",
    },
    weakLead: {
      strong: "Profilo uniforme su tutte le aree. L'area relativamente più bassa da rifinire:",
      passed: "Per arrivare all'eccellenza, ti consigliamo di rivedere:",
      retrial: "Ti consigliamo di rivedere queste aree prima del recupero:",
      failed: "Competenze da recuperare, in ordine di priorità:",
    },
    nextTitle: "Cosa succede ora",
    next: {
      passed:
        "Complimenti: hai ottenuto la certificazione. Riceverai la spilla e il diploma ufficiale SSA all'indirizzo registrato.",
      retrial:
        "Riceverai comunque la spilla: la tua è una promozione con riserva, non un semplice rinvio. Ti consigliamo di ripartecipare al corso come ripasso, con attenzione alle aree segnalate, e di sostenere la sessione di recupero entro 60 giorni.",
      failed:
        "In questo esito la spilla e il diploma non vengono rilasciati. Ti invitiamo a ripetere il percorso e a ripresentarti all'esame dopo aver recuperato le aree indicate sopra.",
    },
  },
  en: {
    cert: "Examination Report",
    family: {
      nihonshu: "Sake Sommelier · Certified Level",
      shochu: "Shochu Sommelier · Certified Level",
    },
    passedTitle: "Passed",
    retrialTitle: "Passed with reservation",
    failedTitle: "Not passed",
    score: "Final score",
    breakdown: "Score by category",
    aiSummary: "Path summary",
    weakAreas: "Areas to deepen",
    issued: "Issued on",
    examDate: "Exam date",
    location: "Location",
    educator: "Educator",
    importantWrong: "Important questions to review",
    correctAnswer: "Correct answer",
    yourAnswer: "Your answer",
    footer: "Sake Sommelier Association · sakesommelierassociation.it",
    advice: {
      passed:
        "Excellent work. You demonstrated strong mastery of the program. Continue with masterclasses to consolidate your experience.",
      retrial:
        "You achieved a good general level, but some areas need further study. Take the retrial session within 60 days.",
      failed:
        "Your score is below the required threshold. We recommend reviewing the material and retaking the course or sitting the retrial.",
    },
    refThreshold: "Pass threshold",
    classAvg: "Class average",
    consolidate: {
      passed: "Areas to consolidate",
      retrial: "Areas to consolidate",
      failed: "Where preparation fell short",
    },
    weakLead: {
      strong: "A well-rounded profile across every area. The relatively lowest area to refine:",
      passed: "To reach excellence, we suggest reviewing:",
      retrial: "We suggest reviewing these areas before the retrial:",
      failed: "Competencies to recover, in order of priority:",
    },
    nextTitle: "What happens next",
    next: {
      passed:
        "Congratulations: you have earned the certification. Your SSA pin and official diploma will be sent to the address on file.",
      retrial:
        "You will still receive the pin: yours is a pass with reservation, not a simple deferral. We recommend re-attending the course as a refresher, focusing on the areas flagged above, and sitting the retrial session within 60 days.",
      failed:
        "In this outcome the pin and diploma are not issued. We invite you to repeat the course and re-sit the exam once you have recovered the areas indicated above.",
    },
  },
  ja: {
    cert: "試験報告書",
    family: {
      nihonshu: "酒ソムリエ · 認定レベル",
      shochu: "焼酎ソムリエ · 認定レベル",
    },
    passedTitle: "合格",
    retrialTitle: "条件付き合格",
    failedTitle: "不合格",
    score: "最終点数",
    breakdown: "カテゴリ別点数",
    aiSummary: "学習の要約",
    weakAreas: "復習が必要な分野",
    issued: "発行日",
    examDate: "試験日",
    location: "会場",
    educator: "講師",
    importantWrong: "復習すべき重要な問題",
    correctAnswer: "正解",
    yourAnswer: "あなたの回答",
    footer: "サケソムリエ協会 · sakesommelierassociation.it",
    advice: {
      passed:
        "素晴らしい成果です。プログラム全体に対する確かな理解を示しました。マスタークラスを継続しましょう。",
      retrial:
        "全体的に良い水準に達しましたが、いくつかの分野で更なる学習が必要です。60日以内に再試験を受けてください。",
      failed:
        "点数が基準を下回っています。教材を見直し、コースの再受講または再試験をお勧めします。",
    },
    refThreshold: "合格基準",
    classAvg: "クラス平均",
    consolidate: {
      passed: "強化すべき分野",
      retrial: "強化すべき分野",
      failed: "準備が不足していた分野",
    },
    weakLead: {
      strong: "すべての分野でバランスの取れた成績です。さらに磨きたい相対的に最も低い分野：",
      passed: "さらなる高みを目指すため、次の分野の復習をお勧めします：",
      retrial: "再試験の前に、次の分野の復習をお勧めします：",
      failed: "優先的に補うべき能力：",
    },
    nextTitle: "この後の流れ",
    next: {
      passed:
        "おめでとうございます。認定を取得されました。SSAのバッジと正式な認定証を登録住所にお送りします。",
      retrial:
        "バッジは引き続きお送りします。これは単なる保留ではなく、条件付き合格です。上記で指摘された分野を中心に復習として再受講し、60日以内に再試験を受けることをお勧めします。",
      failed:
        "この結果ではバッジと認定証は発行されません。上記の分野を補ったうえで、コースを再受講し再試験を受けてください。",
    },
  },
};
