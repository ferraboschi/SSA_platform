// ============================================================================
// Query helpers — PURE data-access idioms, decoupled from the Supabase client.
//
// Extracted VERBATIM from ./index.ts and ../../anomalie/reconcile.ts. Two
// patterns were copy-pasted across those files:
//
//   (a) the PostgREST 1000-row pagination loop — fetch pages by range until a
//       short page comes back (PostgREST caps a single request at ~1000 rows);
//   (b) the RICH-then-BASE select fallback — try a rich column list, and on
//       error retry a base column list, so the reader survives a DB that hasn't
//       run the enrichment migration yet.
//
// Neither helper imports the Supabase client: each takes a plain async callback
// that runs the actual query. That keeps the fetch logic testable with fake
// callbacks (see query-helpers.test.ts) while every call site keeps its EXACT
// prior behavior — page size, stop condition, and error policy are preserved by
// construction (the error policy is an explicit option, not homogenized).
// ============================================================================

/** The shape every PostgREST select returns: rows + a (possibly null) error. */
export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/**
 * How `paginateAll` reacts when a page comes back with an error (or, for the
 * `"break"` policy, with no data). Chosen per call site so behavior is
 * byte-identical to the inline loop it replaces:
 *   - `"throw"` — re-throw the page error (callers that did `if (error) throw`).
 *   - `"break"` — stop and return whatever was accumulated (the reconcile.ts
 *     `loadAll` helper, which returns partial/empty and never surfaces errors).
 */
export type PaginateErrorPolicy = "throw" | "break";

export interface PaginateOptions {
  /** Rows per page; also the stop threshold (a shorter page ends the loop). */
  pageSize?: number;
  /** Error handling, matched to the original call site. Default `"throw"`. */
  onError?: PaginateErrorPolicy;
}

/**
 * Iterate PostgREST pages until a short (or empty) page is returned.
 *
 * `fetchPage(from, to)` runs the actual range query and returns `{ data, error }`.
 * Rows are accumulated across pages; the loop stops when a page returns fewer
 * than `pageSize` rows. The `onError` policy decides what happens on a page error
 * (throw vs. break-and-return-partial) so each caller keeps its exact semantics.
 *
 * For the `"break"` policy the loop also stops when `data` is null/undefined —
 * matching reconcile.ts `loadAll`, which breaks on `error || !data`.
 */
export async function paginateAll<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  opts: PaginateOptions = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const onError = opts.onError ?? "throw";
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (onError === "break") {
      // reconcile.ts loadAll: break on any error OR missing data, return partial.
      if (error || !data) break;
      out.push(...data);
      if (data.length < pageSize) break;
    } else {
      // Throwing callers: surface the error; treat null data as an empty page.
      if (error) throw error;
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
  }
  return out;
}

export interface SelectFallbackResult<T> {
  /** Rows from whichever select succeeded (rich if it worked, else base). */
  data: T[] | null;
  /** True when the rich select errored and the base select was used instead. */
  usedBase: boolean;
  /** The base select's error, if the base select was run and also errored. */
  error: unknown;
}

/**
 * Run `runSelect(richColumns)`; if it errors, run `runSelect(baseColumns)` and
 * flag `usedBase`. Returns the rows plus `usedBase` (and the base error, if any).
 *
 * The helper does ONLY the fetch + fallback. Any downstream meaning of falling
 * back to base (e.g. "treat every seat as paid") stays at the call site — this
 * just reports which column list produced the rows.
 */
export async function selectWithFallback<T>(
  runSelect: (columns: string) => Promise<PageResult<T>>,
  richColumns: string,
  baseColumns: string,
): Promise<SelectFallbackResult<T>> {
  const rich = await runSelect(richColumns);
  if (!rich.error) {
    return { data: rich.data, usedBase: false, error: null };
  }
  const base = await runSelect(baseColumns);
  return { data: base.data, usedBase: true, error: base.error };
}
