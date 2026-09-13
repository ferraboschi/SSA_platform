import "server-only";

// "Correzione AI" health probe — is the AI grading of open exam answers actually
// able to run? A live test showed the OpenAI embeddings call failing in prod
// with 429 insufficient_quota (no credits) and NOBODY noticed until an exam:
// the grader degraded silently. This probe makes that state visible on the
// dashboard ("Salute sistema") and in /api/health (rule 4: nothing fails in
// silence).
//
// Cost control: the whole computation is memoised with unstable_cache for 10
// minutes, so the probe costs at most one tiny embeddings call ("ping") per
// 10' per server process. The error state is cached too (the function never
// throws), which is what we want: no retry storm against a dead key.

import { unstable_cache } from "next/cache";
import { anthropicConfig } from "@/lib/integrations/anthropic/client";
import { getEmbeddingProvider } from "./embeddings";
import { describeEmbeddingError } from "./health-describe";

export type AiGradingHealth = {
  ok: boolean;
  embeddings: "ok" | "stub" | "error";
  anthropic: boolean;
  /** short human reason, never a secret */
  detail: string;
  checkedAt: string;
};

/** Revalidate this tag to force a fresh probe before the 10' window elapses. */
export const AI_GRADING_HEALTH_TAG = "ai-grading-health";

// The provider has no AbortSignal hook, so the probe races a timer instead:
// a hung endpoint must never hold the dashboard for more than this.
const PROBE_TIMEOUT_MS = 10_000;

type EmbeddingsProbe = { embeddings: AiGradingHealth["embeddings"]; detail: string };

async function probeEmbeddings(): Promise<EmbeddingsProbe> {
  // No key → the platform falls back to the hashing stub: retrieval would run
  // against the wrong vector space, so grading would be ungrounded. Not "ok".
  if (!process.env.EMBEDDINGS_API_KEY) {
    return { embeddings: "stub", detail: "chiave embeddings assente" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout embeddings (${PROBE_TIMEOUT_MS / 1000}s)`)),
      PROBE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([getEmbeddingProvider().embed(["ping"]), timeout]);
    return { embeddings: "ok", detail: "" };
  } catch (e) {
    // Only the error MESSAGE is interpreted (never the key or a request body).
    const message = e instanceof Error ? e.message : String(e);
    return { embeddings: "error", detail: describeEmbeddingError(message) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function computeAiGradingHealth(): Promise<AiGradingHealth> {
  const anthropic = anthropicConfig.isConfigured;
  const probe = await probeEmbeddings();
  const ok = probe.embeddings === "ok" && anthropic;
  const reasons: string[] = [];
  if (probe.embeddings !== "ok") reasons.push(probe.detail);
  if (!anthropic) reasons.push("chiave Anthropic assente");
  return {
    ok,
    embeddings: probe.embeddings,
    anthropic,
    detail: ok ? "operativa" : reasons.join(" · "),
    checkedAt: new Date().toISOString(),
  };
}

const cachedAiGradingHealth = unstable_cache(computeAiGradingHealth, ["ai-grading-health-v1"], {
  revalidate: 600,
  tags: [AI_GRADING_HEALTH_TAG],
});

/**
 * Whether AI grading can run right now: live embeddings reachable AND the
 * Anthropic key configured. Cached 10' (shared, non-user read); never throws.
 */
export async function getAiGradingHealth(): Promise<AiGradingHealth> {
  return cachedAiGradingHealth();
}
