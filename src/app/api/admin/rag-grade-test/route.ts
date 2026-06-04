import { NextResponse } from "next/server";
import {
  ensureRagWired,
  setGradingModel,
  ClaudeGradingModel,
  gradeOpenAnswer,
} from "@/lib/rag";
import { anthropicConfig } from "@/lib/integrations/anthropic/client";

// Gated diagnostic: runs the REAL RAG-grounded grading pipeline (retrieve from
// the live pgvector corpus -> Claude grades strictly against the cited passages)
// on a sample sake question, so we can verify end-to-end that free-text grading
// works and is grounded. Gated by SYNC_SECRET — never public.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!anthropicConfig.isConfigured) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY non configurata" });
  }

  ensureRagWired();
  setGradingModel(new ClaudeGradingModel());

  // A good answer should score high + be grounded; a wrong answer should score low.
  const question = "Che cos'è il koji e qual è il suo ruolo nella produzione del sake?";
  const maxPoints = 5;
  const cases = [
    {
      label: "good",
      answer:
        "Il koji è il riso cotto inoculato con la muffa Aspergillus oryzae (kōji-kin). " +
        "Produce enzimi che convertono l'amido del riso in zuccheri fermentabili " +
        "(saccarificazione), permettendo poi al lievito di trasformare gli zuccheri in alcol.",
    },
    { label: "wrong", answer: "Il koji è un tipo di bicchiere giapponese usato per servire il sake freddo." },
    { label: "empty", answer: "" },
  ];

  const results = [];
  for (const c of cases) {
    try {
      const r = await gradeOpenAnswer({ question, answer: c.answer, maxPoints });
      results.push({
        case: c.label,
        score: r.suggestedPoints,
        max: maxPoints,
        confidence: r.confidence,
        grounded: r.citations.length > 0,
        provider: r.provider,
        citations: r.citations.map((ch) => ({
          title: ch.chunk.title,
          score: Math.round(ch.score * 100) / 100,
          preview: ch.chunk.text.slice(0, 90),
        })),
        rationale: r.rationale.slice(0, 240),
      });
    } catch (e) {
      results.push({ case: c.label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, question, results });
}
