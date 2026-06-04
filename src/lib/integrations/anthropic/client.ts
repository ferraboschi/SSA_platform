import "server-only";

// Minimal Anthropic (Claude) Messages API client. Used for one-time exam
// translation and (future) AI grading of open-ended answers. Server-only — the
// key never reaches the browser.

export const anthropicConfig = {
  get apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  },
  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  },
};

// Strong, fast default; override per-call if needed.
const DEFAULT_MODEL = "claude-sonnet-4-6";

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

/** Call Claude and return its text output. Throws if the key is missing/errored. */
export async function callClaude(opts: {
  user: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const key = anthropicConfig.apiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY non configurata.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 8192,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: ClaudeContentBlock[] };
  return (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

/** Parse a JSON object/array from Claude output, tolerating ```json fences. */
export function parseJsonFromClaude<T>(raw: string): T {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (fence) s = fence[1].trim();
  return JSON.parse(s) as T;
}
