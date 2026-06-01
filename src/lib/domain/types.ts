// Domain entity types — the canonical shapes shared across the app.
// Faithful to the prototype data model (see _reference/specs/domain-model.md).

import type {
  CourseLifecycle,
  CourseStatus,
  CourseTypeColor,
  CourseTypeKey,
  DeliveryMode,
  ExamFamily,
  ExamPhaseStatus,
  ExamQuestionType,
  ExamResultStatus,
  Language,
  LiveSessionStatus,
  MiniTestStatus,
  NotificationKind,
  NotificationTone,
  RoleKey,
  StatusTone,
} from "./enums";
import type { ExamCategory } from "./constants";

// ============ Course ============

export interface CourseCosts {
  educator: number;
  gestione: number;
  diplomi: number;
  libri: number;
  location: number;
  food: number;
  adv: number;
}

export interface Course {
  id: string;
  handle: string;
  type: CourseTypeKey;
  typeLabel: string;
  typeShort: string;
  typeColor: CourseTypeColor;
  title: string;
  shortTitle: string;
  city: string;
  mode: DeliveryMode;
  month: string;
  year: number;
  day: number;
  days: number;
  educator: Educator;
  capacity: number;
  enrolled: number;
  minStudents: number;
  price: number;
  revenue: number;
  costs: CourseCosts;
  totalCost: number;
  margin: number;
  status: CourseStatus;
  statusLabel: string;
  statusTone: StatusTone;
  lifecycle: CourseLifecycle;
  students: Student[];
  program: ProgramDay[];
  whatsappLink: string;
  shareLink: string;
  notebook: Notebook;
  exam?: Exam;
  examMeta?: ExamMeta;
  examResults2?: ExamResult[];
  examLive?: ExamLiveSession[];
  examResults?: { passed: number; retrial: number; failed: number };
}

export interface ProgramDay {
  day: number;
  name: string;
  sakes: Sake[];
}

export interface Sake {
  code: string;
  name: string;
  type: string;
  sakagura: string;
  size: number;
  cost: number;
  qty: number;
  note?: string;
}

export interface Notebook {
  adminNotes: AdminNote[];
  plannedAction: string | null;
  tags: string[];
  reasoning: string;
}

export interface AdminNote {
  id: string;
  text: string;
  author: string;
  at: string;
}

// ============ Student / Corsista ============

export interface Student {
  name: string;
  email: string;
  phone: string;
  orderNumber: string;
  orderDate: string;
  amount: number;
  grossAmount: number;
  discountCode: string | null;
  hasWhatsApp: boolean;
  nameMismatch: boolean;
  registrationName: string | null;
}

export interface Corsista {
  email: string;
  name: string;
  phone: string;
  hasWhatsApp: boolean;
  city: string;
  firstSeen: string;
  courses: CorsistaEnrollment[];
  totalSpent: number;
  isReturning: boolean;
  historical?: boolean;
  /** Shopify purchases grouped under this person (course/event/book/merch). */
  purchases?: Purchase[];
  /** Reconciliation flag: set when the Shopify buyer name differs (B2B or shared email). */
  reviewNote?: string | null;
}

/** A single Shopify purchase line, clustered. */
export interface Purchase {
  cluster: string; // 'corso' | 'evento' | 'libro' | 'merchandise'
  subtype: string | null; // for 'corso': certificato | introduttivo | shochu
  delivery: string | null; // 'online' | 'presenza'
  productTitle: string;
  amount: number;
  buyerName: string | null;
  orderedAt: string | null;
}

export interface CorsistaEnrollment {
  courseId: string;
  courseTitle: string;
  courseType: CourseTypeKey;
  city: string;
  month: string;
  year: number;
  status: CourseLifecycle;
  amount: number;
  examResult: ExamResultStatus | null;
  historical?: boolean;
}

// ============ Educator ============

export interface Educator {
  id: string;
  name: string;
  role: string;
  city: string;
  initials: string;
  bio: string;
  years: number;
  lang: Language[];
}

// ============ Exam ============

export interface Exam {
  courseId: string;
  family: ExamFamily;
  cats: ExamCategory[];
  totalQuestions: number;
  totalPoints: number;
  duration: number;
  mockDuration: number;
  feedbackDuration: number;
  thresholds: { pass: number; retrial: number };
  questions: ExamQuestion[];
  phases: ExamPhases;
}

export interface ExamPhases {
  mockTest: ExamPhase;
  feedback: ExamPhase;
  exam: ExamPhase;
}

export interface ExamPhase {
  id: string;
  label: string;
  scheduled: string;
  duration: number;
  status: ExamPhaseStatus;
  n: number;
}

export interface ExamQuestion {
  id: string;
  cat: string;
  type: ExamQuestionType;
  important: boolean;
  lang: string;
  text: string;
  points: number;
  options?: string[];
  correct?: number[] | string[];
  explanation?: string;
  pairs?: { l: string; r: string }[];
  items?: string[];
  imageId?: string;
  aiKey?: string;
  n?: number;
}

export interface ExamResult {
  email: string;
  name: string;
  score: number;
  status: ExamResultStatus;
  completedAt: string;
  durationMin: number;
  sections: ExamResultSection[];
  wrongImportant: WrongImportant[];
}

export interface ExamResultSection {
  cat: string;
  label: string;
  short: string;
  pct: number;
}

export interface WrongImportant {
  questionId: string;
  cat: string;
  text: string;
  wrongAnswer: string;
  correctAnswer: string;
}

export interface ExamLiveSession {
  email: string;
  name: string;
  status: LiveSessionStatus;
  progress: number;
  score: number | null;
  durationMin: number | null;
  checkedIn: boolean;
}

export interface ExamMeta {
  family: ExamFamily;
  familyLabel: string;
  examDate: string;
  examDateLabel: string;
  examDayNo: number;
  done: boolean;
  live: boolean;
  miniTests: MiniTestMeta[];
  feedback: ExamFeedbackMeta;
}

export interface MiniTestMeta {
  day: number;
  name: string;
  topic: string;
  nQuestions: number;
  status: MiniTestStatus;
  avgScore: number | null;
  completion: number;
}

export interface ExamFeedbackMeta {
  name: string;
  total: number;
  sent: boolean;
  responses: number;
  status: "pronto" | "inviato";
}

// ============ Exam template (central library) ============
// The official question bank, one per family. Same template for every course of
// the family; the per-course Exam is sampled/derived from it.

export interface ExamTemplate {
  family: ExamFamily;
  label: string;
  finalExam: ExamTemplateExam;
  miniTests: ExamTemplateMiniTest[];
  feedback: ExamTemplateFeedback;
}

export interface ExamTemplateExam {
  name: string;
  cats: ExamCategory[];
  questions: ExamQuestion[];
  totalQuestions: number;
  duration: number;
  thresholds: { pass: number; retrial: number };
}

export interface ExamTemplateMiniTest {
  day: number;
  name: string;
  topic: string;
  duration: number;
  questions: ExamQuestion[];
}

export interface ExamTemplateFeedback {
  name: string;
  questions: ExamQuestion[];
}

// ============ Material template ============

export interface MaterialTemplate {
  id: string;
  name: string;
  type: CourseTypeKey;
  days: MaterialDay[];
  materiali: MaterialCosts;
  description: string;
  lastUsed: string;
  uses: number;
  createdBy: string;
}

export interface MaterialDay {
  day: number;
  name: string;
  sakes: Sake[];
}

export interface MaterialCosts {
  educatorPerDay: number;
  diplomaPerStudent: number;
  libroPerStudent: number;
  extra?: MaterialExtra[];
}

export interface MaterialExtra {
  id: string;
  label: string;
  value: number;
  per: "iscritto" | "corso";
}

// ============ User / role ============

export interface User {
  id: string;
  first: string;
  last: string;
  name: string;
  role: string;
  roleKey: RoleKey;
  email: string;
  phone: string;
  city: string;
  position: string;
  initials: string;
  tone: string;
  photo?: string;
}

// ============ Notification ============

export interface Notification {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  icon: string;
  /**
   * Interpolation values for the kind's localized title/body/meta/email
   * templates (resolved in the UI via `t.notifications.kinds[kind]`). Keeping
   * content as data + params — not baked strings — lets the same notification
   * render in any locale and feed the Resend email template.
   */
  params: Record<string, string>;
  /** Resolved recipient for the Resend email seam (empty = no email). */
  email: string;
  href: string;
  courseId: string;
}
