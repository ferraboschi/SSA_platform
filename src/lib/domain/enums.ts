// Domain enumerations — exact string literals ported from the prototype.
// Each enum ships as a readonly tuple (runtime) + derived union type (compile time).

export const COURSE_TYPE_KEYS = [
  "certificato",
  "introduttivo",
  "masterclass",
  "shochu",
  "mixology",
] as const;
export type CourseTypeKey = (typeof COURSE_TYPE_KEYS)[number];

export const COURSE_LIFECYCLES = [
  "pubblicato",
  "bozza",
  "archiviato",
  "passato",
] as const;
export type CourseLifecycle = (typeof COURSE_LIFECYCLES)[number];

export const COURSE_STATUSES = [
  "in-traiettoria",
  "monitor",
  "rischio",
  "critico",
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const STATUS_TONES = ["good", "neutral", "warn", "bad"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const COURSE_TYPE_COLORS = ["azzurro", "oro", "neutral"] as const;
export type CourseTypeColor = (typeof COURSE_TYPE_COLORS)[number];

export const DELIVERY_MODES = ["presenza", "online"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const EXAM_FAMILIES = ["nihonshu", "shochu"] as const;
export type ExamFamily = (typeof EXAM_FAMILIES)[number];

export const EXAM_QUESTION_TYPES = [
  "single",
  "multi",
  "truefalse",
  "fill",
  "open",
  "match",
  "order",
  "image",
  "rating",
] as const;
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];

export const EXAM_RESULT_STATUSES = ["passed", "retrial", "failed"] as const;
export type ExamResultStatus = (typeof EXAM_RESULT_STATUSES)[number];

export const EXAM_PHASE_STATUSES = [
  "draft",
  "scheduled",
  "ready",
  "completed",
] as const;
export type ExamPhaseStatus = (typeof EXAM_PHASE_STATUSES)[number];

export const LIVE_SESSION_STATUSES = [
  "not-started",
  "in-progress",
  "submitted",
] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const MINI_TEST_STATUSES = ["pianificato", "completato"] as const;
export type MiniTestStatus = (typeof MINI_TEST_STATUSES)[number];

export const ROLE_KEYS = ["admin", "manager"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const NOTIFICATION_TONES = ["danger", "warning", "info"] as const;
export type NotificationTone = (typeof NOTIFICATION_TONES)[number];

// Notification event types. Each kind has a detector + email template; new
// types (shipment due, exam to grade, low enrolment…) slot in by adding here
// and registering a descriptor in src/lib/notifications/registry.ts.
export const NOTIFICATION_KINDS = ["educator-mismatch"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// Languages: IT/EN/FR/JA. App UI starts IT+EN; JA used for exam reports.
export const LANGUAGES = ["IT", "EN", "FR", "JA"] as const;
export type Language = (typeof LANGUAGES)[number];
