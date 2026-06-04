// Assisted exam grading for open-ended answers.
//
// Retrieves relevant sake knowledge for the question, then asks a grading model
// to score the student's answer against it. The suggestion is ALWAYS advisory —
// a human educator confirms or overrides. Unconfigured, a transparent heuristic
// stub estimates overlap between the answer and the retrieved knowledge so the
// flow is testable offline.

import { retrieve } from "./pipeline";
import { callClaude, parseJsonFromClaude } from "@/lib/integrations/anthropic/client";
import type {
  GradeSuggestion,
  OpenAnswerGradingInput,
  RetrievedChunk,
} from "./types";

// A model may report WHICH context passages (0-based indices into `context`) it
// actually relied on, so the auditable citations are the cited passages — not the
// whole retrieved set.
export type GradeModelResult = Omit<GradeSuggestion, "citations"> & {
  citedIndices?: number[];
};

export interface GradingModel {
  grade(input: OpenAnswerGradingInput, context: RetrievedChunk[]): Promise<GradeModelResult>;
}

// Minimum cosine similarity for a retrieved passage to count as on-topic. Below
// this the corpus has nothing relevant → we refuse rather than grade on noise.
const MIN_RELEVANCE = 0.2;

// Live grader: scores STRICTLY against the retrieved SSA knowledge-base passages
// (the wiki/dispensa corpus), never outside knowledge. Returns which passages it
// relied on so a human can audit the grounding.
export class ClaudeGradingModel implements GradingModel {
  async grade(input: OpenAnswerGradingInput, context: RetrievedChunk[]): Promise<GradeModelResult> {
    const passages = context
      .map((c, i) => `[[${i + 1}]] (${c.chunk.title})\n${c.chunk.text}`)
      .join("\n\n");
    const system =
      "Sei un esaminatore della Sake Sommelier Association. Correggi la risposta aperta " +
      "ESCLUSIVAMENTE in base ai passaggi della knowledge base forniti, che sono l'unica " +
      "fonte di verità. NON usare conoscenze esterne. Se i passaggi non coprono la domanda, " +
      "assegna un punteggio prudente e dillo. Rispondi SOLO con JSON " +
      '{"score": number (0..max), "confidence": number (0..1), "rationale": string (in italiano), ' +
      '"citations": number[] (i numeri [[n]] dei passaggi usati)}. Niente commento, niente code fence.';
    const user =
      `PASSAGGI KNOWLEDGE BASE:\n${passages}\n\n` +
      `DOMANDA: ${input.question}\n` +
      (input.rubricKey ? `RUBRICA / RISPOSTA MODELLO: ${input.rubricKey}\n` : "") +
      `PUNTEGGIO MASSIMO: ${input.maxPoints}\n` +
      `RISPOSTA STUDENTE: ${input.answer}`;
    const raw = await callClaude({ system, user, maxTokens: 1024 });
    const r = parseJsonFromClaude<{
      score?: number;
      confidence?: number;
      rationale?: string;
      citations?: number[];
    }>(raw);

    const score = Number(r.score);
    // Refuse (don't silently zero) on a malformed/out-of-range score — the answer
    // goes to manual review instead of being graded on garbage.
    if (!Number.isFinite(score) || score < 0 || score > input.maxPoints) {
      return {
        suggestedPoints: 0,
        confidence: 0,
        rationale:
          "Risposta del modello non valida (punteggio fuori range o assente): correzione " +
          "automatica sospesa, serve revisione manuale.",
        provider: "model",
        citedIndices: [],
      };
    }
    const confidence = Number(r.confidence);
    // Map Claude's 1-based [[n]] citations to valid 0-based context indices.
    const citedIndices = Array.isArray(r.citations)
      ? [...new Set(r.citations.map((n) => Math.trunc(Number(n)) - 1))].filter(
          (i) => Number.isInteger(i) && i >= 0 && i < context.length,
        )
      : undefined;

    return {
      suggestedPoints: Math.max(0, Math.min(input.maxPoints, score)),
      confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0.5)),
      rationale: r.rationale || "",
      provider: "model",
      citedIndices,
    };
  }
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
  const retrieved = await retrieve(query, k);
  // Keep only on-topic passages. If nothing relevant comes back, REFUSE: a
  // missing/misconfigured corpus must never silently produce a hallucinated
  // grade — the answer goes to manual review with score 0 / confidence 0.
  const citations = retrieved.filter((c) => c.score >= MIN_RELEVANCE);
  if (citations.length === 0) {
    return {
      suggestedPoints: 0,
      confidence: 0,
      rationale:
        "Nessun contenuto pertinente nella knowledge base SSA: la correzione automatica è " +
        "sospesa per questa risposta — serve revisione manuale di un educatore.",
      citations: [],
      provider: "model",
    };
  }
  const { citedIndices, ...result } = await getGradingModel().grade(input, citations);
  // Auditable citations = the passages the model actually cited (mapped from its
  // [[n]] indices), falling back to the full on-topic set if it cited none.
  const cited =
    citedIndices && citedIndices.length
      ? citedIndices.map((i) => citations[i]).filter(Boolean)
      : citations;
  return { ...result, citations: cited };
}
