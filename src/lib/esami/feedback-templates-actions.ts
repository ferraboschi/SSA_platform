"use server";

// FEEDBACK QUESTIONNAIRES as first-class named entities (owner batch 13).
//
// The old model was two hard-coded variants ("short"/"long") picked by course
// type — impossible to name, clone or have three different questionnaires for
// three introduttivo formats. The new model:
//   • TEMPLATES: named questionnaires (create / rename / duplicate — questions
//     AND translations — / delete), stored with the same question shape the
//     old sets used, so the public runner is untouched.
//   • ASSIGNMENT MATRIX: course type × delivery (presenza/online) → template.
//     The course resolves its questionnaire from the matrix at link time.
//   • DELETE is refused while a template is assigned anywhere — replace it in
//     the matrix first (owner decision: no ghost archives).
//
// Storage: ONE settings_kv row ("feedback-templates"), CAS-versioned like
// every other JSON editor (kv-cas). Lazily SEEDED from the legacy
// "feedback-sets" row (questions + the translations written in batch 12), and
// assigned to mirror the legacy feedbackVariant(type) mapping — so the first
// load after deploy shows exactly what the platform already used, and the
// legacy row keeps working as a read-only fallback until the seed lands.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned, kvCasSave, kvCasPatch, CONFLICT_MSG } from "@/lib/data/kv-cas";
import { assertRole, hasRole } from "@/lib/auth/guard";
import { COURSE_TYPES, feedbackVariant } from "@/lib/domain/constants";
import type { CourseTypeKey, ExamQuestion } from "@/lib/domain";
import {
  loadFeedbackSetWithTranslations,
  type FeedbackTransMap,
} from "./feedback-sets-actions";

const KEY = "feedback-templates";

export type FeedbackDelivery = "presenza" | "online";

export interface FeedbackTemplate {
  id: string;
  name: string;
  questions: ExamQuestion[];
  translations?: FeedbackTransMap;
  createdAt: string;
  updatedAt: string;
}

/** courseType → per-delivery template id. */
export type FeedbackAssignments = Partial<
  Record<CourseTypeKey, Partial<Record<FeedbackDelivery, string>>>
>;

export interface FeedbackTemplatesStore {
  templates: FeedbackTemplate[];
  assignments: FeedbackAssignments;
}

type Svc = ReturnType<typeof getSupabaseServiceClient>;

const genId = () =>
  "fbt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Split the legacy shared translations map down to ONE question set. */
function translationsFor(
  questions: ExamQuestion[],
  all: FeedbackTransMap | undefined,
): FeedbackTransMap | undefined {
  if (!all) return undefined;
  const ids = new Set(questions.map((q) => q.id));
  const subset = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
  return Object.keys(subset).length > 0 ? subset : undefined;
}

/** Build the seed store from the legacy feedback-sets row: two named
 *  templates + assignments mirroring the old type→variant mapping. */
async function buildSeed(): Promise<FeedbackTemplatesStore> {
  const [shortSet, longSet] = await Promise.all([
    loadFeedbackSetWithTranslations("short"),
    loadFeedbackSetWithTranslations("long"),
  ]);
  const now = new Date().toISOString();
  // Id-less legacy questions used POSITIONAL runner ids (q-fb-<variant>-<i>):
  // freeze those exact ids at seed time so historical submission answers
  // (keyed by question id) keep matching forever.
  const backfillIds = (qs: ExamQuestion[], variant: "short" | "long") =>
    qs.map((q, i) => (q.id ? q : { ...q, id: `q-fb-${variant}-${i}` }));
  shortSet.questions = backfillIds(shortSet.questions, "short");
  longSet.questions = backfillIds(longSet.questions, "long");
  const shortTpl: FeedbackTemplate = {
    id: genId(),
    name: "Feedback breve",
    questions: shortSet.questions,
    translations: translationsFor(shortSet.questions, shortSet.translations),
    createdAt: now,
    updatedAt: now,
  };
  const longTpl: FeedbackTemplate = {
    id: genId(),
    name: "Feedback lungo",
    questions: longSet.questions,
    translations: translationsFor(longSet.questions, longSet.translations),
    createdAt: now,
    updatedAt: now,
  };
  const assignments: FeedbackAssignments = {};
  for (const type of Object.keys(COURSE_TYPES) as CourseTypeKey[]) {
    const tpl = feedbackVariant(type) === "long" ? longTpl : shortTpl;
    assignments[type] = { presenza: tpl.id, online: tpl.id };
  }
  return { templates: [shortTpl, longTpl], assignments };
}

/** Read the store, seeding it from the legacy sets on first touch. Returns
 *  the CAS version alongside (0 only when even the seed write failed). */
async function readOrSeed(svc: Svc): Promise<{ store: FeedbackTemplatesStore; version: number }> {
  const { value, version } = await kvReadVersioned<FeedbackTemplatesStore>(svc, KEY);
  if (value && Array.isArray(value.templates)) {
    return { store: { templates: value.templates, assignments: value.assignments ?? {} }, version };
  }
  const seed = await buildSeed();
  const res = await kvCasSave(svc, KEY, seed as unknown as Record<string, unknown>, 0);
  if (res === "conflict") {
    // Someone else seeded concurrently — their copy wins.
    const again = await kvReadVersioned<FeedbackTemplatesStore>(svc, KEY);
    if (again.value && Array.isArray(again.value.templates)) {
      return {
        store: { templates: again.value.templates, assignments: again.value.assignments ?? {} },
        version: again.version,
      };
    }
  }
  return { store: seed, version: res === "ok" ? 1 : 0 };
}

// ── PUBLIC resolver (tokenized runner — no role gate) ────────────────────────

/** The questionnaire for ONE course, resolved from the assignment matrix.
 *  Falls back to the legacy variant sets when the store/assignment is missing
 *  (pre-seed deploys, deleted rows) — feedback must never break at link time. */
export async function loadFeedbackForCourse(
  courseType: CourseTypeKey,
  deliveryMode: string | null | undefined,
): Promise<{ questions: ExamQuestion[]; translations?: FeedbackTransMap }> {
  const svc = getSupabaseServiceClient();
  try {
    const { store } = await readOrSeed(svc);
    const delivery = deliveryMode === "online" ? "online" : "presenza";
    const tplId = store.assignments[courseType]?.[delivery];
    const tpl = tplId ? store.templates.find((t) => t.id === tplId) : undefined;
    if (tpl) return { questions: tpl.questions, translations: tpl.translations };
    // The seed fills EVERY cell, so once the store exists an empty cell is an
    // EXPLICIT owner choice ("— nessuno —") — serve NO questionnaire (the
    // runner shows its empty/thank-you state). Falling back to the frozen
    // legacy sets here would silently serve stale questions the owner
    // believes retired; the legacy path below is ONLY for an unreadable/
    // unseeded store.
    return { questions: [] };
  } catch {
    return loadFeedbackSetWithTranslations(feedbackVariant(courseType));
  }
}

// ── ADMIN actions (Libreria editor) ──────────────────────────────────────────

export interface FeedbackAdminData extends FeedbackTemplatesStore {
  version: number;
}

export async function loadFeedbackAdminAction(): Promise<FeedbackAdminData> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { store, version } = await readOrSeed(svc);
  return { ...store, version };
}

export interface FeedbackMutationResult {
  ok: boolean;
  error?: string;
  conflict?: boolean;
  /** Fresh store after a successful mutation, so the editor re-syncs in one hop. */
  data?: FeedbackAdminData;
  /** Id of the template just created/cloned — the editor activates THIS, never
   *  a client-side diff (a colleague's parallel create must not get hijacked). */
  createdId?: string;
}

async function mutateStore(
  mutate: (store: FeedbackTemplatesStore) => FeedbackTemplatesStore | { error: string },
): Promise<FeedbackMutationResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  const svc = getSupabaseServiceClient();
  await readOrSeed(svc); // make sure the row exists before patching
  let refused: string | null = null;
  const res = await kvCasPatch<FeedbackTemplatesStore>(svc, KEY, (current) => {
    refused = null;
    const store: FeedbackTemplatesStore = {
      templates: current?.templates ?? [],
      assignments: current?.assignments ?? {},
    };
    const next = mutate(store);
    if ("error" in next) {
      refused = next.error;
      return "abort";
    }
    return next as unknown as Record<string, unknown>;
  });
  if (refused) return { ok: false, error: refused };
  if (res === "conflict") return { ok: false, error: CONFLICT_MSG, conflict: true };
  if (res !== "ok" && res !== "aborted") return { ok: false, error: "Salvataggio non riuscito." };
  const { store, version } = await readOrSeed(svc);
  return { ok: true, data: { ...store, version } };
}

export async function createFeedbackTemplateAction(name: string): Promise<FeedbackMutationResult> {
  const clean = String(name ?? "").trim().slice(0, 80);
  if (!clean) return { ok: false, error: "Serve un nome." };
  const now = new Date().toISOString();
  const newId = genId();
  const res = await mutateStore((store) => ({
    ...store,
    templates: [
      ...store.templates,
      { id: newId, name: clean, questions: [], createdAt: now, updatedAt: now },
    ],
  }));
  return res.ok ? { ...res, createdId: newId } : res;
}

export async function renameFeedbackTemplateAction(
  id: string,
  name: string,
): Promise<FeedbackMutationResult> {
  const clean = String(name ?? "").trim().slice(0, 80);
  if (!clean) return { ok: false, error: "Serve un nome." };
  return mutateStore((store) => {
    if (!store.templates.some((t) => t.id === id)) return { error: "Questionario non trovato." };
    return {
      ...store,
      templates: store.templates.map((t) =>
        t.id === id ? { ...t, name: clean, updatedAt: new Date().toISOString() } : t,
      ),
    };
  });
}

/** Duplicate = full structure copy: questions KEEP their ids (they live in a
 *  different template, so reuse is safe — translations are per-template) and
 *  the translations come along verbatim. Stable ids are what keep the
 *  historical feedback aggregations alive through the natural
 *  duplicate → tweak → assign workflow: submissions match answers by
 *  question id, and a wholesale remap would zero every past report. */
export async function duplicateFeedbackTemplateAction(id: string): Promise<FeedbackMutationResult> {
  const newId = genId();
  const res = await mutateStore((store) => {
    const src = store.templates.find((t) => t.id === id);
    if (!src) return { error: "Questionario non trovato." };
    const now = new Date().toISOString();
    return {
      ...store,
      templates: [
        ...store.templates,
        {
          id: newId,
          name: `${src.name} (copia)`,
          questions: src.questions.map((q) => ({ ...q })),
          ...(src.translations ? { translations: { ...src.translations } } : {}),
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  });
  return res.ok ? { ...res, createdId: newId } : res;
}

export async function deleteFeedbackTemplateAction(id: string): Promise<FeedbackMutationResult> {
  return mutateStore((store) => {
    if (!store.templates.some((t) => t.id === id)) return { error: "Questionario non trovato." };
    const usedBy = (Object.entries(store.assignments) as [string, Partial<Record<FeedbackDelivery, string>>][])
      .filter(([, cell]) => cell?.presenza === id || cell?.online === id)
      .map(([type]) => COURSE_TYPES[type as CourseTypeKey]?.label ?? type);
    if (usedBy.length > 0) {
      return {
        error: `In uso per: ${usedBy.join(", ")}. Sostituiscilo nella matrice prima di eliminarlo.`,
      };
    }
    return { ...store, templates: store.templates.filter((t) => t.id !== id) };
  });
}

export async function saveFeedbackTemplateQuestionsAction(
  id: string,
  questions: ExamQuestion[],
  expectedVersion: number,
): Promise<FeedbackMutationResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!Array.isArray(questions) || questions.length > 200)
    return { ok: false, error: "Domande non valide." };
  const svc = getSupabaseServiceClient();
  const { store, version } = await readOrSeed(svc);
  // Question edits come from a HUMAN editor session → strict CAS on the
  // version the editor loaded (same posture as the exam library), never a
  // blind retry that could clobber a colleague's parallel edit.
  if (version !== expectedVersion) return { ok: false, error: CONFLICT_MSG, conflict: true };
  if (!store.templates.some((t) => t.id === id)) return { ok: false, error: "Questionario non trovato." };
  const next: FeedbackTemplatesStore = {
    ...store,
    templates: store.templates.map((t) =>
      t.id === id ? { ...t, questions, updatedAt: new Date().toISOString() } : t,
    ),
  };
  const res = await kvCasSave(svc, KEY, next as unknown as Record<string, unknown>, expectedVersion);
  if (res === "conflict") return { ok: false, error: CONFLICT_MSG, conflict: true };
  const fresh = await readOrSeed(svc);
  return { ok: true, data: { ...fresh.store, version: fresh.version } };
}

/** Assign a questionnaire to ONE matrix cell (or clear it with null). Small,
 *  server-authoritative patch → auto-retrying CAS. */
export async function setFeedbackAssignmentAction(
  courseType: CourseTypeKey,
  delivery: FeedbackDelivery,
  templateId: string | null,
): Promise<FeedbackMutationResult> {
  if (!(courseType in COURSE_TYPES)) return { ok: false, error: "Tipo corso non valido." };
  if (delivery !== "presenza" && delivery !== "online")
    return { ok: false, error: "Erogazione non valida." };
  return mutateStore((store) => {
    if (templateId != null && !store.templates.some((t) => t.id === templateId))
      return { error: "Questionario non trovato." };
    const cell = { ...(store.assignments[courseType] ?? {}) };
    if (templateId == null) delete cell[delivery];
    else cell[delivery] = templateId;
    return { ...store, assignments: { ...store.assignments, [courseType]: cell } };
  });
}
