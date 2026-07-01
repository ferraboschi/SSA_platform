// ============================================================================
// Mappers — DB row → domain object
//
// Pure functions extracted verbatim from ./index.ts. None of them reference the
// Supabase client or any factory closure — they only transform row shapes (from
// ./rows) into domain objects, so relocating them changes no behavior.
// ============================================================================

import {
  COURSE_TYPES,
  defaultMaterialCosts,
  EXAM_THRESHOLDS,
  NIHONSHU_CATS,
  ROLE_META,
  SHOCHU_CATS,
  STATUS_META,
} from "@/lib/domain";
import { netPaidEuros } from "@/lib/economics/revenue";
import type {
  Corsista,
  CorsistaEnrollment,
  Course,
  CourseCosts,
  CourseLifecycle,
  CourseStatus,
  CourseTypeKey,
  Educator,
  ExamFamily,
  ExamQuestion,
  ExamQuestionType,
  ExamTemplate,
  Language,
  MaterialCosts,
  MaterialTemplate,
  Notebook,
  ProgramDay,
  Purchase,
  Student,
  User,
} from "@/lib/domain";
import type {
  CorsistaRow,
  CorsoRow,
  EducatorRow,
  ExamTemplateMiniTestJson,
  ExamTemplateQuestionJson,
  ExamTemplateRow,
  IscrizioneRow,
  MaterialTemplateWithChildren,
  ProfileRow,
  PurchaseRow,
} from "./rows";

export function profileToUser(row: ProfileRow): User {
  const first = row.first_name ?? "";
  const last = row.last_name ?? "";
  const name = row.display_name || `${first} ${last}`.trim() || row.email;
  const initials = (
    (first[0] ?? "") + (last[0] ?? "")
  ).toUpperCase() || "?";
  return {
    id: row.id,
    first,
    last,
    name,
    role: ROLE_META[row.role]?.label ?? "Staff",
    roleKey: row.role,
    email: row.email,
    phone: row.phone ?? "",
    city: row.city ?? "",
    position: row.position ?? "",
    initials,
    tone: row.role === "admin" ? "indigo" : "navy",
    photo: row.photo_url ?? undefined,
  };
}

export function educatorRowToDomain(row: EducatorRow): Educator {
  const initials =
    row.full_name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return {
    id: row.external_id ?? `db-${row.id}`,
    name: row.full_name,
    role: "Educator",
    city: row.city ?? "",
    initials,
    bio: row.bio ?? "",
    years: 0,
    lang: (row.languages ?? []) as Language[],
    photo: row.photo_url ?? undefined,
  };
}

export function iscrizioneToEnrollment(row: IscrizioneRow): CorsistaEnrollment | null {
  const corso = Array.isArray(row.corso) ? row.corso[0] : row.corso;
  if (!corso) return null;
  return {
    courseId: String(corso.id),
    courseTitle: corso.short_title || corso.full_title,
    courseType: corso.type,
    city: corso.city,
    month: corso.month,
    year: corso.year,
    status: corso.lifecycle,
    // NET paid (gross − discount). Free re-participations have a full discount,
    // so they correctly show 0 instead of a misleading gross amount.
    amount: netPaidEuros(row),
    examResult: row.exam_result,
    examScorePct: row.exam_score_pct ?? null,
    historical: row.historical || undefined,
  };
}

export function purchaseRowToDomain(row: PurchaseRow): Purchase {
  return {
    cluster: row.cluster ?? "altro",
    subtype: row.subtype,
    delivery: row.delivery,
    productTitle: row.product_title ?? "",
    amount: row.amount_cents / 100,
    buyerName: row.buyer_name,
    orderedAt: row.ordered_at,
  };
}

export function corsistaRowToDomain(
  row: CorsistaRow,
  enrollments: CorsistaEnrollment[],
  purchases: Purchase[] = [],
): Corsista {
  const enrollSpent = enrollments.reduce((s, e) => s + e.amount, 0);
  const purchSpent = purchases.reduce((s, p) => s + p.amount, 0);
  return {
    email: row.email,
    name: row.full_name,
    phone: row.phone ?? "",
    hasWhatsApp: row.has_whatsapp,
    city: row.city ?? "",
    firstSeen: row.first_seen_at ?? "",
    courses: enrollments,
    totalSpent: enrollSpent + purchSpent,
    isReturning: enrollments.length > 1,
    historical: row.historical || undefined,
    purchases,
    reviewNote: row.review_note,
    diplomaNumbers: row.diploma_numbers ?? [],
    cluster: row.cluster ?? null,
  };
}

export const VALID_STATUS: CourseStatus[] = [
  "in-traiettoria",
  "monitor",
  "rischio",
  "critico",
];

export function computeStatus(
  enrolled: number,
  minStud: number,
  lifecycle: CourseLifecycle,
): CourseStatus {
  if (lifecycle === "passato" || lifecycle === "archiviato" || lifecycle === "cancelled")
    return enrolled >= minStud ? "in-traiettoria" : "critico";
  const ratio = minStud > 0 ? enrolled / minStud : 1;
  if (ratio >= 1) return "in-traiettoria";
  if (ratio >= 0.66) return "monitor";
  if (ratio >= 0.33) return "rischio";
  return "critico";
}

/** `lifecycle` is set ONCE by the Shopify sync (to "pubblicato", on creation) and
 *  deliberately never touched again — sync explicitly skips it on every later run
 *  ("staff-managed", see shopify-sync.ts) so a manual "bozza"/"archiviato" choice
 *  is never clobbered. But nothing ever flips a "pubblicato" course to "passato"
 *  once it actually happens — there is no scheduled job and no UI action for it.
 *  Left alone, a course silently stays "pubblicato" forever after its date, which
 *  is exactly the bug: it keeps showing as active/upcoming everywhere (dashboard,
 *  pianificatore, educator, corso detail) long after it's over.
 *  Derive the real-world transition here, at read time, from the calendar date —
 *  every consumer goes through this one mapper, so the fix is a single source of
 *  truth with no backfill/migration needed. "bozza"/"archiviato"/"passato" (already
 *  set) are never touched — only a stale "pubblicato" past its last day is corrected. */
/** True once the course's LAST day is fully over (still "live" through its last day). */
function coursePast(startDate: string | null, days: number): boolean {
  if (!startDate) return false;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(days, 1) - 1);
  end.setUTCHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}

/** The sync writes the authoritative lifecycle hourly from Shopify status + date.
 *  This read-time pass covers two things it can't:
 *   1. the GAP between a course's date passing and the next sync run — a stale
 *      "pubblicato" whose last day is over reads "passato";
 *   2. LEGACY "archiviato" rows (the model no longer produces that value) folded
 *      into the two-reason scheme — past → "passato" (it was held), future →
 *      "cancelled" (it was pulled before its date).
 *  "bozza"/"passato"/"cancelled" pass through untouched (never resurrected). */
export function deriveLifecycle(
  lifecycle: CourseLifecycle,
  startDate: string | null,
  days: number,
): CourseLifecycle {
  if (lifecycle === "pubblicato") return coursePast(startDate, days) ? "passato" : "pubblicato";
  if (lifecycle === "archiviato") return coursePast(startDate, days) ? "passato" : "cancelled";
  return lifecycle;
}

/** Public storefront origin for building a course's enrolment (signup) URL:
 *  `<STOREFRONT_BASE>/products/<product_handle>`. The SSA public site — distinct
 *  from the admin (myshopify) domain in SHOPIFY_STORE_DOMAIN. Env-overridable with
 *  a fallback to the real endpoint, per project convention. */
const STOREFRONT_BASE = (
  process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_URL ||
  "https://www.sakesommelierassociation.it"
).replace(/\/+$/, "");

/** Public enrolment URL from the REAL Shopify handle, or "" if not synced yet
 *  (draft/pre-sync course) — the UI degrades gracefully on an empty value. */
function buildEnrolUrl(productHandle: string | null): string {
  const h = (productHandle ?? "").trim();
  return h ? `${STOREFRONT_BASE}/products/${h}` : "";
}

export function placeholderEducator(): Educator {
  return {
    id: "",
    name: "—",
    role: "Educator",
    city: "",
    initials: "—",
    bio: "",
    years: 0,
    lang: [],
  };
}

export function corsoRowToDomain(
  row: CorsoRow,
  educator: Educator,
  enrolled: number,
  revenue: number,
  students: Student[],
  program: ProgramDay[],
  // Transfer credits (deferred liability from a cancelled course) APPLIED to
  // this course, in euros. Recognised as revenue only when this DESTINATION
  // course is actually DELIVERED (lifecycle === "passato") — see `rev` below.
  // Optional + defaulted so every existing 6-arg caller (and all tests) keep
  // working unchanged.
  recognizedCredits: number = 0,
): Course {
  // Guard against an off-enum `type` slipping in from imports (would crash
  // COURSE_TYPES[type].label consumers downstream).
  const safeType = (row.type in COURSE_TYPES ? row.type : "certificato") as CourseTypeKey;
  const t = COURSE_TYPES[safeType];
  const price = row.price_cents ? row.price_cents / 100 : t.price;
  const minStud = row.min_students || t.minStud;
  const costsRaw = (row.costs ?? {}) as Partial<CourseCosts>;
  const costs: CourseCosts = {
    educator: 600,
    gestione: 900,
    diplomi: 460,
    libri: 36,
    location: row.city === "Milano" ? 0 : 250,
    food: row.type === "certificato" ? 0 : 80,
    adv: 0,
    ...costsRaw,
  };
  const totalCost = Object.values(costs).reduce((s, n) => s + (n || 0), 0);
  const days = safeType === "certificato" ? 3 : 1;
  const lifecycle = deriveLifecycle(row.lifecycle, row.start_date, days);
  const nbRaw = (row.notebook ?? {}) as Record<string, unknown>;
  const nb = nbRaw as Partial<Notebook>;
  // "Annullato" = pulled before it ran, from EITHER the Shopify-derived lifecycle
  // or the legacy notebook flag. Unify both so every P&L / bucketing consumer
  // (conto-economico, archivio, analisi, esami) agrees on what's cancelled.
  const isCancelled = lifecycle === "cancelled" || Boolean(nbRaw.cancelled);
  // Real collected (net) revenue is authoritative: a genuine 0 (all seats free,
  // transferred, or unpaid) MUST stay 0 — never fabricate income from headcount
  // (the old `revenue || enrolled*price*0.85` invented revenue for cancelled and
  // transfer-only courses). A cancelled course is out of the P&L entirely; money
  // already collected is a deferred liability tracked in the credit ledger.
  //
  // Credit recognition: a transfer credit APPLIED to this course is recognised
  // as revenue ONCE, and only when this destination course is actually DELIVERED
  // (lifecycle "passato"). Until then it stays deferred (0). The cancelled origin
  // course is always 0 (isCancelled branch), so the money is never double-counted.
  const rev =
    isCancelled
      ? 0
      : Math.max(revenue, 0) +
        (lifecycle === "passato" ? Math.max(recognizedCredits, 0) : 0);
  const status: CourseStatus =
    row.status && VALID_STATUS.includes(row.status as CourseStatus)
      ? (row.status as CourseStatus)
      : computeStatus(enrolled, minStud, lifecycle);
  return {
    id: String(row.id),
    handle: row.handle,
    type: safeType,
    typeLabel: row.type_label || t.label,
    typeShort: t.short,
    typeColor: t.color,
    title: row.full_title,
    shortTitle: row.short_title,
    city: row.city,
    mode: row.delivery_mode === "online" ? "online" : "presenza",
    month: row.month,
    year: row.year,
    day: (() => {
      if (!row.start_date) return 1;
      const d = new Date(row.start_date);
      return Number.isNaN(d.getTime()) ? 1 : d.getUTCDate();
    })(),
    days,
    educator,
    capacity: row.capacity || 20,
    enrolled,
    minStudents: minStud,
    price,
    revenue: Math.round(rev),
    costs,
    totalCost,
    margin: isCancelled ? 0 : Math.round(rev - totalCost),
    status,
    statusLabel: STATUS_META[status].label,
    statusTone: STATUS_META[status].tone,
    lifecycle,
    students,
    program,
    whatsappLink: "",
    shareLink: "",
    enrolUrl: buildEnrolUrl(row.product_handle),
    notebook: {
      adminNotes: nb.adminNotes ?? [],
      plannedAction: nb.plannedAction ?? null,
      tags: nb.tags ?? [],
      reasoning: nb.reasoning ?? "",
    },
    cancelled: isCancelled,
    cancelReason: (nbRaw.cancelReason as string | undefined) ?? null,
  };
}

/** Default empty per-day tests when none are stored yet: Nihonshu=3, Shochu=2. */
export function defaultMiniTests(family: ExamFamily): ExamTemplateMiniTestJson[] {
  const days = family === "shochu" ? 2 : 3;
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    name: `Test day ${i + 1}`,
    topic: "",
    duration: 10,
    questions: [],
  }));
}

// Drop duplicate questions by normalized text, keeping the first occurrence.
// A re-imported bank duplicates question TEXT with regenerated ids (so id-based
// dedup misses it) — the shochu final had 190 entries but only 92 unique texts.
export function dedupQuestionsByText(qs: ExamQuestion[]): ExamQuestion[] {
  const seen = new Set<string>();
  const out: ExamQuestion[] = [];
  for (const q of qs) {
    const key = (q.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(q);
  }
  return out;
}

export function examTemplateRowToDomain(row: ExamTemplateRow): ExamTemplate {
  // DB exam_templates.family is 'certificato'|'shochu'; domain ExamFamily is
  // 'nihonshu'|'shochu' (nihonshu = the certified sake exam).
  const family: ExamFamily = row.family === "shochu" ? "shochu" : "nihonshu";
  const cats = family === "shochu" ? SHOCHU_CATS : NIHONSHU_CATS;
  const mapQuestions = (
    raw: ExamTemplateQuestionJson[],
    keyPrefix: string,
  ): ExamQuestion[] =>
    raw.map((q, i) => {
      // Rich shape (saved by the editor) → pass through, normalize defaults.
      if (q.type) {
        return {
          id: q.id ?? `${keyPrefix}-${i}`,
          cat: q.cat ?? cats[i % cats.length].id,
          type: q.type,
          important: q.important ?? false,
          lang: q.lang ?? "it",
          text: q.text ?? "",
          points: q.points ?? 1,
          options: q.options,
          correct: q.correct as ExamQuestion["correct"],
          pairs: q.pairs,
          items: q.items,
          imageId: q.imageId,
        };
      }
      // Legacy Airtable shape ({prompt, choices}).
      const options = (q.choices ?? []).map((c) => c.text);
      const correct = (q.choices ?? [])
        .map((c, idx) => (c.correct ? idx : -1))
        .filter((x) => x >= 0);
      const type: ExamQuestionType = correct.length > 1 ? "multi" : "single";
      return {
        id: `${keyPrefix}-${i}`,
        // No category data in the source bank; distribute round-robin so each
        // category shows some questions. Admins can re-categorise later.
        cat: cats[i % cats.length].id,
        type,
        important: false,
        lang: "it",
        text: q.prompt ?? "",
        points: q.weight ?? 1,
        options,
        correct,
      };
    });

  const questions = dedupQuestionsByText(mapQuestions(row.data?.questions ?? [], `q-${row.id}`));
  const miniSource =
    row.data?.miniTests && row.data.miniTests.length > 0
      ? row.data.miniTests
      : defaultMiniTests(family);
  const miniTests = miniSource.map((m) => ({
    day: m.day,
    name: m.name ?? `Test day ${m.day}`,
    topic: m.topic ?? "",
    duration: m.duration ?? 10,
    questions: dedupQuestionsByText(mapQuestions(m.questions ?? [], `q-${row.id}-d${m.day}`)),
  }));

  return {
    family,
    label: row.name,
    finalExam: {
      name: row.name,
      cats,
      questions,
      totalQuestions: questions.length,
      duration: 60,
      thresholds: { pass: EXAM_THRESHOLDS.pass, retrial: EXAM_THRESHOLDS.retrial },
    },
    miniTests,
    feedback: {
      name: row.data?.feedback?.name ?? "Feedback",
      questions: dedupQuestionsByText(mapQuestions(row.data?.feedback?.questions ?? [], `q-${row.id}-fb`)),
    },
  };
}

/** Inverse of examTemplateRowToDomain: serialize the domain template to the
 *  rich `exam_templates.data` JSON shape (round-trips type/cat/correct/etc.). */
export function examTemplateToData(template: ExamTemplate): ExamTemplateRow["data"] {
  const q = (qs: ExamQuestion[]): ExamTemplateQuestionJson[] =>
    qs.map((x) => ({
      id: x.id,
      cat: x.cat,
      type: x.type,
      important: x.important,
      lang: x.lang,
      text: x.text,
      points: x.points,
      options: x.options,
      correct: x.correct,
      pairs: x.pairs,
      items: x.items,
      imageId: x.imageId,
    }));
  return {
    rich: true,
    source: "editor",
    questions: q(template.finalExam.questions),
    miniTests: template.miniTests.map((m) => ({
      day: m.day,
      name: m.name,
      topic: m.topic,
      duration: m.duration,
      questions: q(m.questions),
    })),
    feedback: { name: template.feedback.name, questions: q(template.feedback.questions) },
  };
}

/** Render a timestamptz back to a friendly display string ("12 mar 2026"). */
export function formatLastUsed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(d)
    .replace(".", "");
}

export function materialTemplateRowToDomain(
  row: MaterialTemplateWithChildren,
): MaterialTemplate {
  const costs = (row.costs ?? {}) as Partial<MaterialCosts>;
  const def = defaultMaterialCosts(row.type);
  return {
    id: row.external_id ?? `db-${row.id}`,
    name: row.name,
    type: row.type,
    description: row.description ?? "",
    days: (row.days ?? [])
      .sort((a, b) => a.position - b.position || a.day_no - b.day_no)
      .map((d) => ({
        day: d.day_no,
        name: d.name,
        sakes: (d.sakes ?? [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            code: s.code ?? "",
            name: s.name,
            type: s.type ?? "",
            sakagura: s.sakagura ?? "",
            size: s.size_ml ?? 0,
            cost: s.cost_cents / 100,
            qty: s.qty,
            note: s.note ?? undefined,
          })),
      })),
    materiali: {
      educatorPerDay: costs.educatorPerDay ?? def.educatorPerDay,
      gestionePerDay: costs.gestionePerDay ?? def.gestionePerDay,
      diplomaPerStudent: costs.diplomaPerStudent ?? def.diplomaPerStudent,
      libroPerStudent: costs.libroPerStudent ?? def.libroPerStudent,
      location: costs.location ?? 0,
      foodPairing: costs.foodPairing ?? 0,
      cocktailFee: costs.cocktailFee ?? 0,
      accommodation: costs.accommodation ?? 0,
      transport: costs.transport ?? 0,
      adv: costs.adv ?? 0,
      extra: (row.extras ?? []).map((x) => ({
        id: `ex-${x.id}`,
        label: x.label,
        value: x.value_cents / 100,
        per: x.per,
      })),
    },
    lastUsed: formatLastUsed(row.last_used_at),
    uses: row.uses,
    createdBy: row.created_by ?? "",
  };
}
