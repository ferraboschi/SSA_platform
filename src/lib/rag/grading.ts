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
    // Output language = the student's exam language (owner batch 19: the whole
    // resoconto is in the language the student sat the exam in). Default Italian.
    const LANG_NAME: Record<string, string> = {
      it: "italiano",
      en: "English",
      ja: "giapponese (日本語)",
    };
    const outLang = LANG_NAME[input.lang ?? "it"] ?? "italiano";
    // When retrieval was constrained to a section, name it as a TOPIC/AREA (never
    // as a "section of the knowledge base") so the student-facing rationale can
    // reference it without exposing internal machinery. Empty when absent.
    const sectionNote = input.kbSection
      ? `Gli elementi forniti riguardano l'area "${input.kbSection}": se utile richiamala ` +
        "nella motivazione come argomento (mai come 'sezione' o 'database'). "
      : "";
    // Owner's rubric (batch 7 + 17 + 19): CONTENT decides, form never does; the
    // model votes 1-5 and the code derives the points. Batch 17: comprehension of
    // the SCOPE = correct; missing breadth is enrichment, never a deduction.
    // Batch 19: address the student directly ("tu"), speak of "SSA notions" (never
    // the "knowledge base"), and write in the student's exam language.
    const system =
      "Sei un esaminatore della Sake Sommelier Association. Correggi la risposta aperta " +
      "ESCLUSIVAMENTE in base alle nozioni della Sake Sommelier Association fornite qui sotto, " +
      "che sono l'unica fonte di verità. NON usare conoscenze esterne. " +
      sectionNote +
      "RUBRICA: conta SOLO il contenuto, IGNORA grammatica, ortografia, sintassi, stile e " +
      "lingua; elenchi puntati o risposte schematiche valgono esattamente quanto la prosa. " +
      "PRINCIPIO GUIDA: se lo studente dimostra di aver COMPRESO L'AMBITO della domanda, la " +
      "risposta è CORRETTA. La brevità NON è mai un demerito: una risposta sintetica che " +
      "coglie il nucleo vale quanto una estesa. Una risposta più STRETTA rispetto alle nozioni " +
      "SSA è comunque corretta se il nucleo c'è — le nozioni sono più ampie per natura. " +
      "Ciò che manca (dettagli, esempi, o anche una parte secondaria della domanda non " +
      "sviluppata) NON abbassa il voto se l'ambito è colto: elencalo INVECE nella motivazione " +
      "come SPUNTI DI ARRICCHIMENTO ('per completezza avresti potuto aggiungere…'), come " +
      "valore aggiunto, MAI come penalità. Assegna un VOTO intero da 1 a 5: " +
      "1 = sbagliata, non pertinente o nessuna comprensione dell'ambito; " +
      "2 = comprensione molto lacunosa o con errori concettuali gravi; " +
      "3 = parziale: coglie qualcosa ma con un errore concettuale reale o una parte " +
      "IMPORTANTE della domanda sbagliata; " +
      "4 = corretta, ambito colto, con una sola imprecisione minore reale (non una semplice " +
      "sintesi); " +
      "5 = corretta: coglie il nucleo/ambito senza errori, ANCHE se sintetica. " +
      "In pratica: se ha capito l'argomento e non ha detto nulla di sbagliato, il voto è 5 " +
      "(o 4 se c'è una piccola imprecisione reale) — mai meno per il solo fatto di essere breve. " +
      `MOTIVAZIONE (400-600 caratteri), scritta in ${outLang}: rivolgiti DIRETTAMENTE allo ` +
      "studente in SECONDA PERSONA, dandogli del tu ('Hai colto…', 'Avresti potuto…'), MAI in " +
      "terza persona ('Lo studente…'). NON nominare mai la 'knowledge base', i 'passaggi', le " +
      "'fonti' o un 'database': parla delle nozioni della Sake Sommelier Association (o delle " +
      "nozioni sul sake). La motivazione deve: (a) confermare cosa HAI colto correttamente, " +
      "(b) offrire gli spunti di arricchimento dalle nozioni SSA in tono costruttivo. " +
      `Rispondi SOLO con JSON {"voto": number (1..5), "confidence": number (0..1), ` +
      `"rationale": string (in ${outLang}), "citations": number[] (i numeri [[n]] usati)}. ` +
      "Niente commento, niente code fence.";
    const user =
      `NOZIONI SAKE SOMMELIER ASSOCIATION:\n${passages}\n\n` +
      `DOMANDA: ${input.question}\n` +
      (input.rubricKey ? `RUBRICA / RISPOSTA MODELLO: ${input.rubricKey}\n` : "") +
      `PUNTEGGIO MASSIMO: ${input.maxPoints}\n` +
      `RISPOSTA STUDENTE: ${input.answer}`;
    const raw = await callClaude({ system, user, maxTokens: 1500 });
    const r = parseJsonFromClaude<{
      voto?: number;
      score?: number;
      confidence?: number;
      rationale?: string;
      citations?: number[];
    }>(raw);

    // Preferred shape: the 1-5 vote → points = max × (vote−1)/4 (1 earns
    // nothing, 5 earns full marks). Legacy "score" accepted for robustness
    // across deploys.
    const voteRaw = Math.trunc(Number(r.voto));
    const vote = Number.isFinite(voteRaw) && voteRaw >= 1 && voteRaw <= 5 ? voteRaw : undefined;
    const score = vote != null ? (input.maxPoints * (vote - 1)) / 4 : Number(r.score);
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
      vote,
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
      vote: 1 + Math.round(Math.min(1, coverage) * 4),
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
  // A KB section constrains retrieval to that chapter's documents; absent →
  // whole corpus (filter undefined → RPC family_filter null, as before).
  let retrieved = await retrieve(
    query,
    k,
    input.kbSection ? { family: input.kbSection } : undefined,
  );
  // Section fallback: today the whole corpus is tagged 'generale', so a section
  // that doesn't exist (yet) would return zero chunks and force a refusal on
  // every categorized question. An empty SECTION is a tagging gap, not a
  // relevance judgement — retry unfiltered so grading behaves exactly as
  // before sections existed. Once the corpus is section-tagged, the filtered
  // path wins and this branch never runs.
  let sectionApplied = Boolean(input.kbSection);
  if (retrieved.length === 0 && input.kbSection) {
    retrieved = await retrieve(query, k);
    sectionApplied = false; // whole-corpus fallback: the prompt must not claim a section
  }
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
  const { citedIndices, ...result } = await getGradingModel().grade(
    sectionApplied ? input : { ...input, kbSection: undefined },
    citations,
  );
  // Auditable citations = the passages the model actually cited (mapped from its
  // [[n]] indices), falling back to the full on-topic set if it cited none.
  const cited =
    citedIndices && citedIndices.length
      ? citedIndices.map((i) => citations[i]).filter(Boolean)
      : citations;
  return { ...result, citations: cited };
}
