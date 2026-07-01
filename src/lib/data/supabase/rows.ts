// ============================================================================
// Row types — a hand-written subset of the schema (no codegen for now).
//
// Extracted verbatim from ./index.ts. These describe DB-row shapes returned by
// PostgREST and are consumed by the mappers in ./mappers.ts and the casts in
// ./index.ts.
// ============================================================================

import type {
  CourseLifecycle,
  CourseTypeKey,
  ExamQuestionType,
  Language,
  RoleKey,
} from "@/lib/domain";

export interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  role: RoleKey;
  phone: string;
  city: string;
  position: string;
  photo_url: string | null;
  locale: Language;
}

export interface EducatorRow {
  id: number;
  external_id: string | null;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  bio: string | null;
  photo_url: string | null;
  languages: string[];
  active: boolean;
}

export interface EducatorQualRow {
  educator_id: number;
  course_type: CourseTypeKey;
}

export interface CorsistaRow {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  has_whatsapp: boolean;
  city: string | null;
  first_seen_at: string | null;
  historical: boolean;
  review_note: string | null;
  merged_into?: number | null;
  diploma_numbers?: string[] | null;
  cluster?: string | null;
}

export interface PurchaseRow {
  cluster: string | null;
  subtype: string | null;
  delivery: string | null;
  product_title: string | null;
  amount_cents: number;
  buyer_name: string | null;
  ordered_at: string | null;
}

export interface CorsoEmbedded {
  id: number;
  short_title: string;
  full_title: string;
  type: CourseTypeKey;
  city: string;
  month: string;
  year: number;
  lifecycle: "pubblicato" | "bozza" | "archiviato" | "passato" | "cancelled";
}

export interface IscrizioneRow {
  id: number;
  corso_id: number;
  corsista_id: number;
  amount_cents: number;
  discount_cents?: number | null;
  exam_result: "passed" | "retrial" | "failed" | null;
  exam_score_pct?: number | null;
  historical: boolean;
  // PostgREST returns an embedded record as an array even when the relation
  // is many-to-one. We accept both shapes and normalize.
  corso?: CorsoEmbedded | CorsoEmbedded[] | null;
}

export interface MaterialTemplateRow {
  id: number;
  external_id: string | null;
  name: string;
  type: CourseTypeKey;
  description: string | null;
  costs: Record<string, unknown>;
  uses: number;
  last_used_at: string | null;
  created_by: string | null;
}

// ── corsi (courses) ──────────────────────────────────────────────────────────
export interface CorsoRow {
  id: number;
  external_id: string | null;
  handle: string;
  short_title: string;
  full_title: string;
  type: CourseTypeKey;
  type_label: string;
  delivery_mode: string;
  city: string;
  venue: string | null;
  month: string;
  year: number;
  start_date: string | null;
  price_cents: number;
  capacity: number;
  min_students: number;
  lifecycle: CourseLifecycle;
  status: string | null;
  educator_id: number | null;
  notebook: Record<string, unknown>;
  costs: Record<string, unknown>;
}

// ── exam templates (question bank imported from Airtable) ────────────────────
// A stored question is EITHER the legacy Airtable shape ({prompt, choices}) OR
// the rich domain shape written by the editor (has a `type` field). The reader
// detects which and normalizes both to the domain ExamQuestion.
export interface ExamTemplateQuestionJson {
  // legacy Airtable shape
  prompt?: string;
  weight?: number;
  choices?: Array<{ text: string; correct: boolean }>;
  // rich shape (domain ExamQuestion, written on save)
  id?: string;
  cat?: string;
  type?: ExamQuestionType;
  important?: boolean;
  lang?: string;
  text?: string;
  points?: number;
  options?: string[];
  correct?: Array<number | string>;
  pairs?: Array<{ l: string; r: string }>;
  items?: string[];
  imageId?: string;
}
export interface ExamTemplateMiniTestJson {
  day: number;
  name?: string;
  topic?: string;
  duration?: number;
  questions?: ExamTemplateQuestionJson[];
}
export interface ExamTemplateRow {
  id: number;
  family: string;
  name: string;
  data: {
    source?: string;
    rich?: boolean;
    questions?: ExamTemplateQuestionJson[];
    miniTests?: ExamTemplateMiniTestJson[];
    feedback?: { name?: string; questions?: ExamTemplateQuestionJson[] };
  };
}


// material_template_days/sakes/extras come back via nested select.
export interface MaterialTemplateWithChildren extends MaterialTemplateRow {
  days?: Array<{
    id: number;
    day_no: number;
    name: string;
    position: number;
    sakes?: Array<{
      id: number;
      code: string | null;
      name: string;
      type: string | null;
      sakagura: string | null;
      size_ml: number | null;
      cost_cents: number;
      qty: number;
      note: string | null;
      position: number;
    }>;
  }>;
  extras?: Array<{
    id: number;
    label: string;
    value_cents: number;
    per: "iscritto" | "corso";
  }>;
}
