import "server-only";

// "Migration DB" health for the dashboard's "Salute sistema" card.
//
// Migrations are applied BY HAND by the owner (runbook §3) and every reader
// degrades gracefully when a column is missing — which is exactly why nobody
// notices: found 25/9/2026 with two migrations from 4/7 still unapplied on prod
// (`delivery_notes`, `seats_override`) while the runbook said "all applied".
// The degrade had a real cost: a student who filled the courier notes on
// /conferma silently lost their delivery address. Rule 4: nothing fails in
// silence — so the platform probes the columns itself and says which are gone.

import { unstable_cache } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { missingColumnFromError } from "@/lib/data/supabase/query-helpers";

export const MIGRATION_HEALTH_TAG = "migration-health";

export interface ExpectedColumn {
  table: string;
  column: string;
  /** Migration file (supabase/migrations) that adds it — what the owner runs. */
  migration: string;
}

/** Columns added by the OPTIONAL migrations readers degrade without. One cheap
 *  1-row select each, memoised 10'. Keep in sync when adding a migration. */
export const EXPECTED_COLUMNS: readonly ExpectedColumn[] = [
  { table: "corsi_iscrizioni", column: "delivery_address", migration: "20260702160000_delivery_address" },
  { table: "corsi_iscrizioni", column: "confirm_sent_at", migration: "20260703120000_confirm_sent_exam_progress" },
  { table: "exam_progress", column: "answers", migration: "20260703130000_exam_progress_answers" },
  { table: "corsi_iscrizioni", column: "delivery_notes", migration: "20260704000000_delivery_notes" },
  { table: "corsi_partecipanti", column: "delivery_notes", migration: "20260704000000_delivery_notes" },
  { table: "corsi_iscrizioni", column: "seats_override", migration: "20260704040000_corsi_iscrizioni_seats_override" },
  { table: "corsi_iscrizioni", column: "seat_index", migration: "20260704140000_multi_ticket_seats" },
  { table: "corsi_iscrizioni", column: "privacy_consent_at", migration: "20260705120000_confirm_consent" },
  { table: "corsi_iscrizioni", column: "annullata_at", migration: "20260723120000_corsi_iscrizioni_annullata" },
  { table: "corsi_iscrizioni", column: "delivery_address_parts", migration: "20260925120000_delivery_address_parts" },
  { table: "corsi_partecipanti", column: "delivery_address_parts", migration: "20260925120000_delivery_address_parts" },
  { table: "corsisti_note", column: "id", migration: "20260925150000_corsisti_note" },
];

export interface MigrationHealth {
  ok: boolean;
  /** Columns the prod DB lacks (table.column), in migration order. */
  missing: string[];
  /** The migration files still to run, deduplicated, in order. */
  pendingMigrations: string[];
  /** Probes that failed for another reason (network, RLS…): not "missing". */
  unverifiable: string[];
  checkedAt: string;
}

async function computeMigrationHealth(): Promise<MigrationHealth> {
  const svc = getSupabaseServiceClient();
  const missing: string[] = [];
  const pending = new Set<string>();
  const unverifiable: string[] = [];
  for (const c of EXPECTED_COLUMNS) {
    const { error } = await svc.from(c.table).select(c.column).limit(1);
    if (!error) continue;
    const msg = error.message ?? "";
    // Only a POSITIVE "this column / relation does not exist" (PGRST204, 42703,
    // 42P01) counts as missing. A PostgREST reload ("Could not query the
    // database for the schema cache", PGRST002) or an outage is "unverifiable"
    // — never a false "run these migrations" alarm cached for 10'.
    const gone =
      missingColumnFromError(msg) === c.column ||
      /relation .* does not exist/i.test(msg) ||
      /could not find the table/i.test(msg);
    if (gone) {
      missing.push(`${c.table}.${c.column}`);
      pending.add(c.migration);
    } else {
      unverifiable.push(`${c.table}.${c.column}`);
    }
  }
  return {
    ok: missing.length === 0 && unverifiable.length === 0,
    missing,
    pendingMigrations: [...pending],
    unverifiable,
    checkedAt: new Date().toISOString(),
  };
}

/** Cached 10' (shared, non-user read): the schema changes only when the owner
 *  runs a migration. Never throws. */
export async function getMigrationHealth(): Promise<MigrationHealth> {
  const cached = unstable_cache(computeMigrationHealth, ["migration-health-v1"], {
    revalidate: 600,
    tags: [MIGRATION_HEALTH_TAG],
  });
  return cached();
}
