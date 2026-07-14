// Persistent per-student exam-link SEND LOG. Server-only.
//
// The educator's "Invia" is a fact that must survive reloads and phone
// switches (same rule as the appello's confirm_sent_at): one settings_kv row
// per (course, test, subject) — atomic single-row upserts, so concurrent
// sends can never lose each other (the closure-map lesson). Reads fail soft:
// a transient error only hides a stamp for one request, never blocks a send.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

export const SEND_LOG_KEY_PREFIX = "exam_link_send:";

/** Subject key: `c<corsistaId>` or `p<partecipanteId>` — the roster's keying. */
export type ExamSendSubjectKey = string;

interface StoredSend {
  at?: string; // ISO
  to?: string;
  /** How the link went out: emailed, or copied/handed over by the educator. */
  method?: "email" | "copy";
}

export interface ExamSendStamp {
  at: string;
  method: "email" | "copy";
}

function sendKey(corsoId: number, testKey: string, subj: ExamSendSubjectKey): string {
  return `${SEND_LOG_KEY_PREFIX}${corsoId}:${testKey}:${subj}`;
}

/** Stamp one DELIVERED send (overwrite: the stamp is always the last send). */
export async function recordExamSend(
  corsoId: number,
  testKey: string,
  subj: ExamSendSubjectKey,
  to: string,
  atIso: string,
  method: "email" | "copy" = "email",
): Promise<void> {
  try {
    const svc = getSupabaseServiceClient();
    await svc
      .from("settings_kv")
      .upsert({ key: sendKey(corsoId, testKey, subj), value: { at: atIso, to, method } }, { onConflict: "key" });
  } catch {
    /* the email is already out — never fail the send over the stamp */
  }
}

/** All send stamps for one (course, test): subject key → stamp. Legacy rows
 *  (written before `method` existed) read back as emailed sends. */
export async function getExamSends(corsoId: number, testKey: string): Promise<Record<string, ExamSendStamp>> {
  const out: Record<string, ExamSendStamp> = {};
  try {
    const svc = getSupabaseServiceClient();
    const prefix = `${SEND_LOG_KEY_PREFIX}${corsoId}:${testKey}:`;
    const { data, error } = await svc.from("settings_kv").select("key, value").like("key", `${prefix}%`);
    if (error) return out;
    for (const r of (data ?? []) as { key: string; value: StoredSend | null }[]) {
      const at = r.value?.at;
      if (at) {
        out[r.key.slice(prefix.length)] = { at, method: r.value?.method === "copy" ? "copy" : "email" };
      }
    }
  } catch {
    /* fail soft */
  }
  return out;
}
