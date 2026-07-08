import { describe, it, expect } from "vitest";
import { kvReadVersioned, kvCasSave, kvCasPatch, CONFLICT_MSG } from "./kv-cas";

// Minimal in-memory stand-in for the settings_kv table that honours the exact
// PostgREST filters kv-cas uses (.eq on key, .eq/.or on value->>__v, insert
// with duplicate detection). Enough to pin the CAS semantics.
function makeMockSvc(initial: Record<string, Record<string, unknown>> = {}) {
  const rows = new Map<string, Record<string, unknown>>(Object.entries(initial));

  const from = (table: string) => {
    if (table !== "settings_kv") throw new Error(`unexpected table ${table}`);
    return {
      // SELECT value WHERE key = …
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => ({ data: rows.has(key) ? { value: rows.get(key) } : null, error: null }),
        }),
      }),
      // UPDATE {value} WHERE key = … AND version-filter
      update: (patch: { value: Record<string, unknown> }) => {
        let key = "";
        const exec = (versionOk: (v: unknown) => boolean) => ({
          select: async () => {
            const cur = rows.get(key);
            if (cur && versionOk(cur.__v)) {
              rows.set(key, patch.value);
              return { data: [{ key }], error: null };
            }
            return { data: [], error: null };
          },
        });
        return {
          eq: (_col: string, k: string) => {
            key = k;
            return {
              // legacy branch: value->>__v is null OR eq 0
              or: () => exec((v) => v == null || v === 0),
              // strict branch: value->>__v = expected (string compare, as PostgREST)
              eq: (_col2: string, expected: string) => exec((v) => String(v) === expected),
            };
          },
        };
      },
      insert: async (row: { key: string; value: Record<string, unknown> }) => {
        if (rows.has(row.key)) {
          return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        rows.set(row.key, row.value);
        return { error: null };
      },
    };
  };
  return { svc: { from } as never, rows };
}

describe("kv-cas — optimistic concurrency for settings_kv blobs", () => {
  it("reads version 0 from a legacy row without __v (and from a missing row)", async () => {
    const { svc } = makeMockSvc({ k: { a: 1 } });
    expect((await kvReadVersioned(svc, "k")).version).toBe(0);
    expect((await kvReadVersioned(svc, "missing")).version).toBe(0);
    const { svc: svc2 } = makeMockSvc({ k: { a: 1, __v: 7 } });
    expect((await kvReadVersioned(svc2, "k")).version).toBe(7);
  });

  it("first save on a legacy row succeeds and stamps __v:1", async () => {
    const { svc, rows } = makeMockSvc({ k: { a: 1 } });
    expect(await kvCasSave(svc, "k", { a: 2 }, 0)).toBe("ok");
    expect(rows.get("k")).toEqual({ a: 2, __v: 1 });
  });

  it("creates the row when absent (expected 0)", async () => {
    const { svc, rows } = makeMockSvc();
    expect(await kvCasSave(svc, "k", { a: 1 }, 0)).toBe("ok");
    expect(rows.get("k")).toEqual({ a: 1, __v: 1 });
  });

  it("STALE writer gets 'conflict' and writes NOTHING (the Bug-4 clobber)", async () => {
    const { svc, rows } = makeMockSvc({ k: { a: 1 } });
    // Editor A and editor B both loaded version 0. A saves first:
    expect(await kvCasSave(svc, "k", { a: "from-A" }, 0)).toBe("ok");
    // B (stale, still expecting 0) must NOT overwrite A:
    expect(await kvCasSave(svc, "k", { a: "from-B" }, 0)).toBe("conflict");
    expect(rows.get("k")).toEqual({ a: "from-A", __v: 1 });
    // B reloads (version 1) and saves cleanly:
    expect(await kvCasSave(svc, "k", { a: "from-B-reloaded" }, 1)).toBe("ok");
    expect(rows.get("k")).toEqual({ a: "from-B-reloaded", __v: 2 });
  });

  it("kvCasPatch retries through a concurrent bump and re-applies the mutation", async () => {
    const { svc, rows } = makeMockSvc({ k: { list: ["x"], __v: 3 } });
    const res = await kvCasPatch<{ list: string[] }>(svc, "k", (cur) => ({
      list: [...(cur?.list ?? []), "y"],
    }));
    expect(res).toBe("ok");
    expect(rows.get("k")).toEqual({ list: ["x", "y"], __v: 4 });
  });

  it("exposes the single shared conflict copy for the editors", () => {
    expect(CONFLICT_MSG).toContain("Modificato da un altro utente");
  });
});
