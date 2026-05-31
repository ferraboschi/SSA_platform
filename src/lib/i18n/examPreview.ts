// Trilingual strings rendered *inside* the student-device preview. Like the exam
// report, the previewed exam UI is shown in a chosen language (IT/EN/JA) toggled
// independently of the app's UI locale, so it carries its own self-contained
// dictionary rather than going through the locale-scoped `useT()`.

import type { ReportLang } from "@/lib/i18n/report";

export interface ExamPreviewStrings {
  points: string;
  questionLabel: string;
  back: string;
  next: string;
  openPlaceholder: string;
  chooseOption: string;
  // Placeholder stand-in for an untranslated question body in JA preview.
  jaQuestionStub: string;
}

export const EXAM_PREVIEW_I18N: Record<ReportLang, ExamPreviewStrings> = {
  it: {
    points: "punti",
    questionLabel: "Domanda",
    back: "Indietro",
    next: "Avanti",
    openPlaceholder: "Scrivi qui la tua risposta...",
    chooseOption: "scegli…",
    jaQuestionStub: "",
  },
  en: {
    points: "points",
    questionLabel: "Question",
    back: "Back",
    next: "Next",
    openPlaceholder: "Write your answer here...",
    chooseOption: "choose…",
    jaQuestionStub: "",
  },
  ja: {
    points: "点",
    questionLabel: "問題",
    back: "前へ",
    next: "次へ",
    openPlaceholder: "ここに回答を書いてください...",
    chooseOption: "選択…",
    jaQuestionStub: "日本酒についての質問:",
  },
};
