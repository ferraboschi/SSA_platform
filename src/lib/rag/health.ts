import "server-only";

// "Correzione AI" health probe — is the AI grading of open exam answers actually
// able to run? Live tests showed BOTH providers failing silently in prod: the
// OpenAI embeddings call with 429 insufficient_quota (no credits), and — once
// that was fixed — Anthropic with "credit balance is too low". Nobody notices
// until an exam: the grader degrades silently. This probe makes that state
// visible on the dashboard ("Salute sistema") and in /api/health (rule 4:
// nothing fails in silence).
//
// Cost control: the whole computation is memoised with unstable_cache for 10
// minutes, so the probe costs at most one tiny embeddings call ("ping") plus
// one 1-token Claude call per 10' per server process. The error state is
// cached too (the function never throws), which is what we want: no retry
// storm against a dead key.

import { unstable_cache } from "next/cache";
import { anthropicConfig, pingAnthropic } from "@/lib/integrations/anthropic/client";
import { getEmbeddingProvider } from "./embeddings";
import { describeAnthropicError, describeEmbeddingError } from "./health-describe";

export type AiGradingHealth = {
  ok: boolean;
  embeddings: "ok" | "stub" | "error";
  /** Key present on the host. */
  anthropic: boolean;
  /** Live Claude round-trip: "missing" = no key. */
  claude: "ok" | "missing" | "error";
  /** short human reason, never a secret */
  detail: string;
  checkedAt: string;
};

/** Revalidate this tag to force a fresh probe before the 10' window elapses. */
export const AI_GRADING_HEALTH_TAG = "ai-grading-health";

// The providers have no AbortSignal hook, so each probe races a timer instead:
// a hung endpoint must never hold the dashboard for more than this.
const PROBE_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout ${label} (${PROBE_TIMEOUT_MS / 1000}s)`)),
      PROBE_TIMEOUT_MS,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

type EmbeddingsProbe = { embeddings: AiGradingHealth["embeddings"]; detail: string };

async function probeEmbeddings(): Promise<EmbeddingsProbe> {
  // No key → the platform falls back to the hashing stub: retrieval would run
  // against the wrong vector space, so grading would be ungrounded. Not "ok".
  if (!process.env.EMBEDDINGS_API_KEY) {
    return { embeddings: "stub", detail: "chiave embeddings assente" };
  }
  try {
    await withTimeout(getEmbeddingProvider().embed(["ping"]), "embeddings");
    return { embeddings: "ok", detail: "" };
  } catch (e) {
    // Only the error MESSAGE is interpreted (never the key or a request body).
    const message = e instanceof Error ? e.message : String(e);
    return { embeddings: "error", detail: describeEmbeddingError(message) };
  }
}

type ClaudeProbe = { claude: AiGradingHealth["claude"]; detail: string };

async function probeClaude(): Promise<ClaudeProbe> {
  if (!anthropicConfig.isConfigured) return { claude: "missing", detail: "chiave Anthropic assente" };
  try {
    await withTimeout(pingAnthropic(), "Anthropic");
    return { claude: "ok", detail: "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { claude: "error", detail: describeAnthropicError(message) };
  }
}

async function computeAiGradingHealth(): Promise<AiGradingHealth> {
  const [emb, cl] = await Promise.all([probeEmbeddings(), probeClaude()]);
  const ok = emb.embeddings === "ok" && cl.claude === "ok";
  const reasons: string[] = [];
  if (emb.embeddings !== "ok") reasons.push(emb.detail);
  if (cl.claude !== "ok") reasons.push(cl.detail);
  return {
    ok,
    embeddings: emb.embeddings,
    anthropic: anthropicConfig.isConfigured,
    claude: cl.claude,
    detail: ok ? "operativa" : reasons.join(" · "),
    checkedAt: new Date().toISOString(),
  };
}

const cachedAiGradingHealth = unstable_cache(computeAiGradingHealth, ["ai-grading-health-v2"], {
  revalidate: 600,
  tags: [AI_GRADING_HEALTH_TAG],
});

/**
 * Whether AI grading can run right now: live embeddings reachable AND a live
 * Claude round-trip succeeding (key valid, credits available). Cached 10'
 * (shared, non-user read); never throws.
 */
export async function getAiGradingHealth(): Promise<AiGradingHealth> {
  return cachedAiGradingHealth();
}
