import "server-only";

// Formative, KB-grounded explanations for day-test questions (owner, batch 7):
// the day tests exist to improve the student's study, so after handing in they
// can ask "why is this the right answer?" and get SSA knowledge-base content
// supporting the outcome — never external knowledge. Explanations depend on
// the QUESTION (not the student's answer), so callers cache them per question.

import { retrieve } from "./pipeline";
import { callClaude } from "@/lib/integrations/anthropic/client";

const LANG_NAME: Record<string, string> = { it: "italiano", en: "inglese", ja: "giapponese" };

export interface ExplainResult {
  ok: boolean;
  text?: string;
}

export async function explainQuestionWithKb(input: {
  question: string;
  /** The correct answer/sequence when the question has one ("" for open). */
  correctAnswer: string;
  lang: string;
}): Promise<ExplainResult> {
  const query = input.correctAnswer
    ? `${input.question} ${input.correctAnswer}`
    : input.question;
  const retrieved = await retrieve(query, 4);
  if (retrieved.length === 0) return { ok: false };

  const passages = retrieved
    .map((r, i) => `[${i + 1}] ${r.chunk.text}`)
    .join("\n\n");
  const langName = LANG_NAME[input.lang] ?? "italiano";
  const system = `Sei un educatore della Sake Sommelier Association. Scrivi un breve approfondimento FORMATIVO per uno studente che ha appena completato un test giornaliero. Basati ESCLUSIVAMENTE sui passaggi della knowledge base SSA forniti — mai conoscenze esterne. Se i passaggi non coprono l'argomento, rispondi solo: NON_DISPONIBILE. Tono incoraggiante e chiaro; elenchi puntati benvenuti; massimo ~700 caratteri. Scrivi in ${langName}.`;
  const user = `DOMANDA DEL TEST:\n${input.question}\n${
    input.correctAnswer ? `\nRISPOSTA CORRETTA:\n${input.correctAnswer}\n` : ""
  }\nPASSAGGI DELLA KNOWLEDGE BASE SSA:\n${passages}\n\nScrivi l'approfondimento (perché questa è la risposta corretta / cosa va ricordato sull'argomento).`;

  const raw = (await callClaude({ system, user, maxTokens: 800 })).trim();
  if (!raw || /NON_DISPONIBILE/i.test(raw)) return { ok: false };
  return { ok: true, text: raw };
}
