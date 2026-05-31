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
  },
};
