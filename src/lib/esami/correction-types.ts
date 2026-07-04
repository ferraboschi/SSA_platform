// Shared types for the batch exam correction ("Correggi") — PURE module (no
// server/client deps) so the engine, the PDF renderer and the UI all agree on
// one shape. The correction produces a DRAFT per final-exam submission: staff
// still confirms the official verdict in the Esiti tab (the draft never writes
// exam_result by itself).

import type { ExamOutcome } from "@/lib/exam-links/grading";

/** One AI-graded open answer inside a correction draft. */
export interface OpenGrade {
  qid: string;
  /** Question text (trimmed for display). */
  question: string;
  /** The student's answer as submitted. */
  given: string;
  /** AI-suggested points in [0, maxPoints]; 0 when failed=true. */
  points: number;
  maxPoints: number;
  /** Model confidence in [0, 1]; 0 when failed=true. */
  confidence: number;
  /** Grading rationale (Italian) — cites the KB passages it relied on. */
  rationale: string;
  /** True when the suggestion is grounded in retrieved KB passages. */
  grounded: boolean;
  /** Titles of the KB passages cited (for the report's transparency line). */
  citedTitles: string[];
  /** True when the model call failed → points 0, manual review required. */
  failed: boolean;
}

/** A wrong (or unanswered) objective question worth surfacing in the report. */
export interface WrongAnswer {
  qid: string;
  question: string;
  given: string;
  correct: string;
  /** Flagged "importante" in the template — sorted first in the report. */
  important: boolean;
  points: number;
}

/** The per-submission correction draft persisted by the Correggi run
 *  (settings_kv key `exam-correction:<corsoId>:<submissionId>`). */
export interface CorrectionDraft {
  /** ISO timestamp of the run that produced this draft. */
  at: string;
  submissionId: number;
  studentName: string;
  studentEmail: string;
  /** Combined score in [0,100]: (objective points earned + AI open points) / total points. */
  combinedPct: number;
  /** Objective-only score in [0,100] (same as the live auto-corrector). */
  objectivePct: number;
  /** Draft verdict from EXAM_THRESHOLDS on combinedPct: >=80 promosso,
   *  >=70 rimandato, else bocciato. ADVISORY — staff confirms. */
  verdict: ExamOutcome;
  /** Which grading backend produced the open-answer points. */
  aiProvider: "model" | "stub" | "none";
  openGrades: OpenGrade[];
  /** Wrong objective answers, important-first (report: "domande da rivedere"). */
  wrongAnswers: WrongAnswer[];
  totals: {
    /** Points earned (objective + AI). */
    earned: number;
    /** Max points over the whole exam. */
    max: number;
    /** Objective questions: earned / max points. */
    objectiveEarned: number;
    objectiveMax: number;
    /** Open questions: AI points / max points. */
    openEarned: number;
    openMax: number;
    /** Open answers whose model call failed (need manual review). */
    openFailed: number;
  };
}

/** Summary of one Correggi run (settings_kv key `exam-correction-run:<corsoId>`). */
export interface CorrectionRun {
  at: string;
  /** Final-exam submissions considered / drafts produced. */
  total: number;
  graded: number;
  failures: Array<{ submissionId: number; error: string }>;
}

export const CORRECTION_KEY_PREFIX = "exam-correction:";
export const CORRECTION_RUN_KEY_PREFIX = "exam-correction-run:";

export function correctionKey(corsoId: number, submissionId: number): string {
  return `${CORRECTION_KEY_PREFIX}${corsoId}:${submissionId}`;
}
export function correctionRunKey(corsoId: number): string {
  return `${CORRECTION_RUN_KEY_PREFIX}${corsoId}`;
}
