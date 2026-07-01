import { describe, it, expect } from "vitest";
import {
  paginateAll,
  selectWithFallback,
  type PageResult,
} from "./query-helpers";

// A fake page source: hand it an array of pages (each a PageResult) and it
// returns them in order, one per call. No Supabase — just plain callbacks, so
// these tests exercise the helper's control flow in isolation.
function pageSource<T>(pages: PageResult<T>[]) {
  let call = 0;
  // Accept (from, to) like the real fetchPage callback (args ignored — the fake
  // just walks `pages` in order) so callers can invoke it as src(from, to).
  return async (_from?: number, _to?: number): Promise<PageResult<T>> => {
    const page = pages[call] ?? { data: [], error: null };
    call += 1;
    return page;
  };
}

// Build `count` distinct rows for a page.
function rows(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => offset + i);
}

describe("paginateAll", () => {
  it("returns all rows across multiple pages and stops on a short final page", async () => {
    // Two full pages (size 3) then a short page → three fetches, then stop.
    const src = pageSource<number>([
      { data: rows(3, 0), error: null },
      { data: rows(3, 3), error: null },
      { data: rows(1, 6), error: null }, // short → last
    ]);
    let calls = 0;
    const out = await paginateAll<number>(
      async (from, to) => {
        calls += 1;
        return src(from, to);
      },
      { pageSize: 3 },
    );
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(calls).toBe(3);
  });

  it("passes the correct from/to range for each page (pageSize−1 span)", async () => {
    const ranges: Array<[number, number]> = [];
    const src = pageSource<number>([
      { data: rows(1000, 0), error: null }, // full page → fetch again
      { data: rows(2, 1000), error: null }, // short → stop
    ]);
    await paginateAll<number>(async (from, to) => {
      ranges.push([from, to]);
      return src(from, to);
    });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("stops immediately when the first page is already sub-page-size", async () => {
    let calls = 0;
    const out = await paginateAll<number>(async () => {
      calls += 1;
      return { data: rows(2), error: null }; // < default 1000 → stop after one
    });
    expect(out).toEqual([0, 1]);
    expect(calls).toBe(1);
  });

  it("treats an exactly-full page followed by an empty page as complete", async () => {
    const src = pageSource<number>([
      { data: rows(2, 0), error: null }, // full (pageSize 2) → fetch again
      { data: [], error: null }, // empty short page → stop
    ]);
    let calls = 0;
    const out = await paginateAll<number>(
      async (from, to) => {
        calls += 1;
        return src(from, to);
      },
      { pageSize: 2 },
    );
    expect(out).toEqual([0, 1]);
    expect(calls).toBe(2);
  });

  describe("onError policy", () => {
    it("'break' returns the rows accumulated before a later-page error (partial)", async () => {
      const src = pageSource<number>([
        { data: rows(2, 0), error: null }, // full → continue
        { data: null, error: new Error("boom") }, // error → break, keep partial
      ]);
      const out = await paginateAll<number>(
        async (from, to) => src(from, to),
        { pageSize: 2, onError: "break" },
      );
      expect(out).toEqual([0, 1]);
    });

    it("'break' returns empty when the very first page errors", async () => {
      const out = await paginateAll<number>(
        async () => ({ data: null, error: new Error("boom") }),
        { onError: "break" },
      );
      expect(out).toEqual([]);
    });

    it("'break' also stops on null data with no error", async () => {
      const src = pageSource<number>([
        { data: rows(2, 0), error: null }, // full → continue
        { data: null, error: null }, // missing data → break
      ]);
      const out = await paginateAll<number>(
        async (from, to) => src(from, to),
        { pageSize: 2, onError: "break" },
      );
      expect(out).toEqual([0, 1]);
    });

    it("default policy ('throw') propagates a page error", async () => {
      const src = pageSource<number>([
        { data: rows(3, 0), error: null }, // full → continue
        { data: null, error: new Error("kaboom") }, // error → throw
      ]);
      await expect(
        paginateAll<number>(async (from, to) => src(from, to), {
          pageSize: 3,
        }),
      ).rejects.toThrow("kaboom");
    });
  });
});

describe("selectWithFallback", () => {
  const RICH = "id,rich_col";
  const BASE = "id";

  it("returns rich rows and usedBase=false when the rich select succeeds", async () => {
    const seen: string[] = [];
    const res = await selectWithFallback<{ id: number }>(
      async (columns) => {
        seen.push(columns);
        return { data: [{ id: 1 }], error: null };
      },
      RICH,
      BASE,
    );
    expect(res.data).toEqual([{ id: 1 }]);
    expect(res.usedBase).toBe(false);
    expect(res.error).toBeNull();
    // Only the rich select ran; base was never attempted.
    expect(seen).toEqual([RICH]);
  });

  it("falls back to base rows with usedBase=true when the rich select errors", async () => {
    const seen: string[] = [];
    const res = await selectWithFallback<{ id: number }>(
      async (columns) => {
        seen.push(columns);
        if (columns === RICH) return { data: null, error: new Error("no rich col") };
        return { data: [{ id: 2 }], error: null };
      },
      RICH,
      BASE,
    );
    expect(res.data).toEqual([{ id: 2 }]);
    expect(res.usedBase).toBe(true);
    expect(res.error).toBeNull();
    // Rich tried first, then base.
    expect(seen).toEqual([RICH, BASE]);
  });

  it("surfaces the base error (usedBase=true) when both selects fail", async () => {
    const baseErr = new Error("no base either");
    const res = await selectWithFallback<{ id: number }>(
      async (columns) =>
        columns === RICH
          ? { data: null, error: new Error("no rich col") }
          : { data: null, error: baseErr },
      RICH,
      BASE,
    );
    expect(res.usedBase).toBe(true);
    expect(res.error).toBe(baseErr);
    expect(res.data).toBeNull();
  });
});
