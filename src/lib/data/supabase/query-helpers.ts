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

/**
 * The column a PostgREST / Postgres error names as missing, or null. Two shapes:
 *   • PostgREST PGRST204 (unknown column in a WRITE body):
 *     "Could not find the 'delivery_notes' column of 'corsi_iscrizioni' in the schema cache"
 *   • Postgres 42703 (unknown column in a SELECT / filter):
 *     "column corsi_iscrizioni.delivery_notes does not exist"
 *     "column \"delivery_notes\" of relation \"corsi_iscrizioni\" does not exist"
 * Lets a writer drop EXACTLY the column the DB lacks (an unapplied optional
 * migration) instead of a whole group of fields — see confirm-actions.ts.
 */
export function missingColumnFromError(message: string | null | undefined): string | null {
  const m = (message ?? "").trim();
  if (!m) return null;
  const pgrst = /could not find the '([A-Za-z0-9_]+)' column/i.exec(m);
  if (pgrst) return pgrst[1];
  const pg = /\bcolumn "?(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)"?(?: of relation "[^"]+")? does not exist/i.exec(m);
  if (pg) return pg[1];
  return null;
}

export interface SelectTiersResult<T> {
  /** Rows from the first tier that succeeded (or the last tier's, on failure). */
  data: T[] | null;
  /** Index of the tier that produced `data` (0 = richest). */
  tier: number;
  /** The LAST tier's error when every tier failed; null otherwise. */
  error: unknown;
}

/**
 * `selectWithFallback` for N column lists, richest first: run each tier until
 * one succeeds. A DB missing ONLY the newest optional column (e.g.
 * `delivery_notes`, migration not yet applied) then keeps every older column
 * instead of falling straight to the bare base list.
 */
export async function selectWithTiers<T>(
  runSelect: (columns: string) => Promise<PageResult<T>>,
  tiers: readonly string[],
): Promise<SelectTiersResult<T>> {
  let last: PageResult<T> = { data: null, error: new Error("selectWithTiers: no tiers") };
  for (let i = 0; i < tiers.length; i++) {
    last = await runSelect(tiers[i]);
    if (!last.error) return { data: last.data, tier: i, error: null };
  }
  return { data: last.data, tier: Math.max(tiers.length - 1, 0), error: last.error };
}
