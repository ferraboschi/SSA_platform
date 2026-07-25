import "server-only";

// AI SYNTHESIS of a course's end-of-course FEEDBACK (owner): the feedback is NOT
// a test — there's no grading and no knowledge-base grounding. This reads the
// aggregated responses (per-area ratings + ALL free-text comments) and asks
// Claude to produce ONE coherent report for the SSA organizers/admins: what
// worked, what didn't, which sections to deepen, and the recurring themes from
// the open comments (analysed SEMANTICALLY, not against the KB). The single
// report is cached in settings_kv so it isn't regenerated on every view.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { callClaude, anthropicConfig } from "@/lib/integrations/anthropic/client";
import { loadCourseFeedbackResults } from "@/lib/exam-links/feedback-results";

export interface FeedbackSynthesis {
  text: string;
  at: string;
  /** Response count the synthesis was built on — the UI offers "Rigenera" when
   *  new responses have since arrived. */
  responses: number;
}

const key = (courseId: number | string) => `feedback-synthesis-${courseId}`;

export async function loadFeedbackSynthesis(courseId: number): Promise<FeedbackSynthesis | null> {
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc.from("settings_kv").select("value").eq("key", key(courseId)).maybeSingle();
    const v = data?.value as FeedbackSynthesis | null;
    return v && typeof v.text === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function generateFeedbackSynthesis(
  courseId: number,
  family: "nihonshu" | "shochu",
): Promise<{ ok: boolean; error?: string; synthesis?: FeedbackSynthesis }> {
  if (!anthropicConfig.isConfigured) {
    return { ok: false, error: "AI non configurata (manca ANTHROPIC_API_KEY su Render)." };
  }
  const agg = await loadCourseFeedbackResults(String(courseId), family);
  if (agg.responses === 0) {
    return { ok: false, error: "Nessuna risposta al feedback ancora raccolta per questo corso." };
  }

  const areasTxt =
    agg.areas
      .map((a) => `- ${a.name}: media ${a.ratingAvg != null ? a.ratingAvg.toFixed(1) : "—"}/5 (${a.answered} risposte)`)
      .join("\n") || "(nessuna area valutata)";
  const ratingTxt =
    agg.questions
      .filter((q) => q.kind === "rating")
      .map((q) => `- ${q.text}: ${q.ratingAvg != null ? q.ratingAvg.toFixed(1) : "—"}/5`)
      .join("\n") || "(nessuna domanda a punteggio)";
  const openTxt =
    agg.questions
      .filter((q) => q.kind === "open")
      .flatMap((q) => q.openResponses.map((r) => `• [${q.text}] ${r}`))
      .join("\n") || "(nessun commento a testo libero)";

  const system =
    "Sei un analista che sintetizza i questionari di FEEDBACK di fine corso della Sake Sommelier Association per gli organizzatori e gli amministratori. NON è un esame: non devi valutare né correggere gli studenti. Analizza le OPINIONI in modo SEMANTICO (i commenti liberi non hanno un riscontro nella knowledge base: vanno letti e raggruppati per significato). Scrivi in italiano, chiaro, sintetico e azionabile, in markdown. Non inventare dati non presenti.";
  const user =
    `Feedback del corso — ${agg.responses} risposte.\n\n` +
    `SODDISFAZIONE PER AREA:\n${areasTxt}\n\n` +
    `PUNTEGGI PER DOMANDA:\n${ratingTxt}\n\n` +
    `COMMENTI A TESTO LIBERO:\n${openTxt}\n\n` +
    `Produci UN unico report per gli organizzatori SSA, con queste sezioni:\n` +
    `1. **Cosa ha funzionato** — punti di forza.\n` +
    `2. **Cosa non ha funzionato** — criticità.\n` +
    `3. **Sezioni/aree da approfondire o rivedere** — dove emergono incomprensioni o richieste di chiarimento (collega alle aree con media più bassa e ai commenti).\n` +
    `4. **Temi ricorrenti dai commenti liberi** — raggruppati per significato.\n` +
    `5. **Suggerimenti concreti di miglioramento**.\n` +
    `Sii conciso; se un'informazione manca, dillo invece di inventarla.`;

  try {
    const text = await callClaude({ system, user, maxTokens: 2000 });
    const synthesis: FeedbackSynthesis = {
      text: text.trim(),
      at: new Date().toISOString(),
      responses: agg.responses,
    };
    const svc = getSupabaseServiceClient();
    await svc
      .from("settings_kv")
      .upsert({ key: key(courseId), value: synthesis }, { onConflict: "key" })
      .then(() => {}, () => {});
    return { ok: true, synthesis };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sintesi non riuscita." };
  }
}
