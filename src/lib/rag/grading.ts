// Assisted exam grading for open-ended answers.
//
// Retrieves relevant sake knowledge for the question, then asks a grading model
// to score the student's answer against it. The suggestion is ALWAYS advisory —
// a human educator confirms or overrides. Unconfigured, a transparent heuristic
// stub estimates overlap between the answer and the retrieved knowledge so the
// flow is testable offline.

import { retrieve } from "./pipeline";
import type {
  GradeSuggestion,
  OpenAnswerGradingInput,
  RetrievedChunk,
} from "./types";

export interface GradingModel {
  grade(
    input: OpenAnswerGradingInput,
    context: RetrievedChunk[],
  ): Promise<Omit<GradeSuggestion, "citations">>;
}

// Heuristic fallback: lexical overlap between answer and retrieved context.
class StubGradingModel implements GradingModel {
  async grade(
    input: OpenAnswerGradingInput,
    context: RetrievedChunk[],
  ): Promise<Omit<GradeSuggestion, "citations">> {
    const answerTerms = new Set(termsOf(input.answer));
    const contextTerms = new Set(context.flatMap((c) => termsOf(c.chunk.text)));

    if (answerTerms.size === 0) {
      return {
        suggestedPoints: 0,
        confidence: 0.3,
        rationale: "Risposta vuota o non valutabile.",
        provider: "stub",
      };
    }

    let overlap = 0;
    for (const t of answerTerms) if (contextTerms.has(t)) overlap++;
    const coverage = contextTerms.size === 0 ? 0 : overlap / answerTerms.size;
    const suggestedPoints = Math.round(coverage * input.maxPoints * 10) / 10;

    return {
      suggestedPoints: Math.min(suggestedPoints, input.maxPoints),
      confidence: 0.35,
      rationale:
        `Stima euristica (offline): ${overlap}/${answerTerms.size} termini della ` +
        `risposta trovano riscontro nella knowledge base. Revisione umana richiesta.`,
      provider: "stub",
    };
  }
}

function termsOf(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

let model: GradingModel | null = null;

export function getGradingModel(): GradingModel {
  if (!model) {
    // Live LLM grader (e.g. Claude) wired here when available; stub until then.
    model = new StubGradingModel();
  }
  return model;
}

export function setGradingModel(m: GradingModel): void {
  model = m;
}

export async function gradeOpenAnswer(
  input: OpenAnswerGradingInput,
  k = 4,
): Promise<GradeSuggestion> {
  const query = input.rubricKey
    ? `${input.question} ${input.rubricKey}`
    : input.question;
  const citations = await retrieve(query, k);
  const result = await getGradingModel().grade(input, citations);
  return { ...result, citations };
}
