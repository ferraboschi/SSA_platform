import "server-only";

// Optimistic concurrency for the settings_kv JSON blobs (and, by convention,
// any whole-JSON-document save). Every editor used to LOAD a blob, edit it in
// React state, then UPSERT the whole thing back — pure last-write-wins: two
// people editing in parallel silently destroyed each other's saves (Bug 4).
//
// The fix needs NO migration: a monotonic version counter lives INSIDE the
// JSON value (`__v`, absent = 0 on legacy rows) and every write is a
// compare-and-swap UPDATE filtered on the stored version. A stale writer
// matches zero rows → "conflict" → the UI tells the user to reload instead of
// clobbering. Server-side read-modify-write callers use kvCasPatch, which
// simply re-reads and retries (no UI involved).

import type { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

/** Single user-facing conflict copy — shown by every protected editor. */
export const CONFLICT_MSG =
  "Modificato da un altro utente — ricarica la pagina prima di salvare.";

export type CasResult = "ok" | "conflict";

/** Read a settings_kv value plus its embedded version (0 when absent/legacy). */
export async function kvReadVersioned<T extends object = Record<string, unknown>>(
  svc: Svc,
  key: string,
): Promise<{ value: (T & { __v?: number }) | null; version: number }> {
  const { data } = await svc.from("settings_kv").select("value").eq("key", key).maybeSingle();
  const value = ((data as { value?: unknown } | null)?.value ?? null) as
    | (T & { __v?: number })
    | null;
  const raw = value?.__v;
  const version = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  return { value, version };
}

/** ONE compare-and-swap write: succeeds only if the stored version still equals
 *  `expectedVersion` (legacy rows without `__v` count as version 0). On success
 *  the row carries `__v: expectedVersion + 1`. Missing row + expected 0 →
 *  INSERT (a concurrent insert surfaces as a conflict, never a duplicate). */
export async function kvCasSave(
  svc: Svc,
  key: string,
  value: Record<string, unknown>,
  expectedVersion: number,
): Promise<CasResult> {
  const next = { ...value, __v: expectedVersion + 1 };
  let q = svc.from("settings_kv").update({ value: next }).eq("key", key);
  q =
    expectedVersion === 0
      ? // Legacy rows have no __v at all; treat "absent" and explicit 0 alike.
        q.or("value->>__v.is.null,value->>__v.eq.0")
      : q.eq("value->>__v", String(expectedVersion));
  const { data, error } = await q.select("key");
  if (error) throw error;
  if ((data ?? []).length > 0) return "ok";
  if (expectedVersion === 0) {
    // Nothing matched: either the row doesn't exist yet (create it) or someone
    // else already bumped it past 0 (conflict).
    const ins = await svc.from("settings_kv").insert({ key, value: next });
    if (!ins.error) return "ok";
    if (ins.error.code === "23505" || /duplicate key/i.test(ins.error.message)) return "conflict";
    throw ins.error;
  }
  return "conflict";
}

/** Auto-retrying read-modify-write for SERVER-authoritative patches (no human
 *  in the loop): re-reads the fresh value and re-applies `mutate` on every
 *  attempt, so a concurrent bump just means one extra round-trip. `mutate`
 *  returns the FULL next value (without __v), or "abort" to write nothing. */
export async function kvCasPatch<T extends object = Record<string, unknown>>(
  svc: Svc,
  key: string,
  mutate: (current: (T & { __v?: number }) | null) => Record<string, unknown> | "abort",
  maxAttempts = 3,
): Promise<CasResult | "aborted"> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { value, version } = await kvReadVersioned<T>(svc, key);
    const next = mutate(value);
    if (next === "abort") return "aborted";
    const res = await kvCasSave(svc, key, next, version);
    if (res === "ok") return "ok";
  }
  return "conflict";
}
