import "server-only";

// Live Supabase-backed DataSource — THIN COMPOSITION ROOT.
//
// Implements src/lib/data/repository.ts against the Postgres schema in
// supabase/migrations/. The factory createSupabaseDataSource() returns a value
// satisfying DataSource; the provider auto-selects it when Supabase is
// configured and USE_SEED=false.
//
// This module wires the pieces together only. Each repository now lives in its
// own file (./users, ./educators, ./corsisti, ./materials, ./settings,
// ./courses, ./exams, ./notifications) as a `make*` factory that receives the
// per-request RepoContext (and, where needed, its cross-repo dependencies).
//
// Implementation strategy (incremental):
//   ✅ Implemented now: users(profiles), corsisti, educators(+quals),
//      material_templates(+children), settings_kv, notifications(registry).
//   ⏳ Stubbed (return []/null with a warn): courses + nested program/sake,
//      exams + exam_templates + results + live. These need richer joins +
//      careful mapping; they get filled in once we start importing real
//      courses (Task #21 Shopify) and real exams (Task #26).
//
// Stubbed repositories never throw — they return the "safe empty" shape — so
// every page in the app renders its empty state without crashing while we
// migrate sections one by one.
//
// Row types live in ./rows; pure DB-row→domain mappers live in ./mappers.

import type { DataSource } from "../repository";
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from "@/lib/integrations/supabase/server";
import type { RepoContext } from "./context";
import { makeUsersRepo } from "./users";
import {
  loadEducatorsMap,
  loadQuals,
  makeEducatorsRepo,
} from "./educators";
import { makeCorsistiRepo } from "./corsisti";
import { makeMaterialRepo } from "./materials";
import { makeSettingsRepo } from "./settings";
import { makeCoursesRepo } from "./courses";
import { makeExamsRepo, makeExamTemplatesRepo } from "./exams";
import { makeNotificationsService } from "./notifications";

// Revenue is money COLLECTED, so it counts only fully-paid orders. The rule
// (isPaidRevenue) and the net-paid formula (gross − discount, clamped at 0)
// live in @/lib/economics/revenue — the single source of truth.

// ============================================================================
// Factory
// ============================================================================

export async function createSupabaseDataSource(): Promise<DataSource> {
  // Server client — bound to the current request's session. Used for reads.
  // Service client — bypasses RLS. Used for mutations from server actions
  // that act on behalf of the operator (notifications log, admin settings,
  // and imports run by trusted scripts).
  const sb = await getSupabaseServerClient();
  const svc = getSupabaseServiceClient();

  // One RepoContext per request — created ONCE and shared by every repo, so the
  // request-scoped clients (and the per-request quals/educators caches keyed on
  // this ctx inside ./educators) behave exactly as the original closures did.
  const ctx: RepoContext = { sb, svc };

  const usersRepo = makeUsersRepo(ctx);
  const educatorsRepo = makeEducatorsRepo(ctx);
  const corsistiRepo = makeCorsistiRepo(ctx);
  const materialRepo = makeMaterialRepo(ctx);
  const settingsRepo = makeSettingsRepo(ctx);
  const coursesRepo = makeCoursesRepo(ctx, { loadEducatorsMap });
  const examsRepo = makeExamsRepo(ctx);
  const examTemplatesRepo = makeExamTemplatesRepo(ctx);
  const notificationsService = makeNotificationsService(ctx, {
    coursesRepo,
    usersRepo,
    settingsRepo,
    loadQuals: () => loadQuals(ctx),
    loadEducatorsMap: () => loadEducatorsMap(ctx),
  });

  return {
    users: usersRepo,
    corsisti: corsistiRepo,
    educators: educatorsRepo,
    materialTemplates: materialRepo,
    courses: coursesRepo,
    exams: examsRepo,
    examTemplates: examTemplatesRepo,
    settings: settingsRepo,
    notifications: notificationsService,
  };
}
