// Backend-agnostic data-access contract.
//
// Modules depend ONLY on these interfaces, never on a concrete backend. The
// in-memory adapter (prototype seed) and a future Supabase adapter both
// implement `DataSource`, so the backend can be swapped without touching UI or
// domain code. All methods are async so adapters may be network-backed.

import type {
  Corsista,
  Course,
  DashThresholds,
  Educator,
  Exam,
  ExamLiveSession,
  ExamResult,
  ExamTemplate,
  MaterialTemplate,
  Notification,
  StockAlert,
  User,
} from "@/lib/domain";
import type {
  CourseLifecycle,
  CourseStatus,
  CourseTypeKey,
  ExamFamily,
} from "@/lib/domain";

export interface CourseFilter {
  lifecycle?: CourseLifecycle | CourseLifecycle[];
  type?: CourseTypeKey | CourseTypeKey[];
  status?: CourseStatus | CourseStatus[];
}

export interface CourseRepository {
  list(filter?: CourseFilter): Promise<Course[]>;
  getById(id: string): Promise<Course | null>;
  getByHandle(handle: string): Promise<Course | null>;
  update(id: string, patch: Partial<Course>): Promise<Course>;
}

export interface CorsistaRepository {
  list(): Promise<Corsista[]>;
  getByEmail(email: string): Promise<Corsista | null>;
}

export interface EducatorRepository {
  list(): Promise<Educator[]>;
  getById(id: string): Promise<Educator | null>;
  /** Course types this educator is qualified to teach. */
  getQualifications(id: string): Promise<CourseTypeKey[]>;
  setQualifications(id: string, types: CourseTypeKey[]): Promise<void>;
  /** Educators qualified for a given course type. */
  qualifiedFor(type: CourseTypeKey): Promise<Educator[]>;
}

export interface MaterialTemplateRepository {
  list(): Promise<MaterialTemplate[]>;
  getById(id: string): Promise<MaterialTemplate | null>;
  save(template: MaterialTemplate): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ExamRepository {
  getByCourseId(courseId: string): Promise<Exam | null>;
  resultsByCourseId(courseId: string): Promise<ExamResult[]>;
  liveByCourseId(courseId: string): Promise<ExamLiveSession[]>;
}

export interface ExamTemplateRepository {
  list(): Promise<ExamTemplate[]>;
  getByFamily(family: ExamFamily): Promise<ExamTemplate | null>;
}

export interface UserRepository {
  list(): Promise<User[]>;
  getById(id: string): Promise<User | null>;
  getCurrent(): Promise<User>;
  setCurrent(id: string): Promise<void>;
  updateProfile(id: string, patch: Partial<User>): Promise<User>;
}

export interface NotificationService {
  /** Currently-active notifications (computed from course/educator state). */
  list(): Promise<Notification[]>;
}

export interface SettingsRepository {
  getThresholds(): Promise<DashThresholds>;
  setThresholds(patch: Partial<DashThresholds>): Promise<DashThresholds>;
  /** Ids of notifications the operator silenced via the bell. */
  getDismissedNotifications(): Promise<string[]>;
  /** Silence (true) or restore (false) a notification by id. */
  setNotificationDismissed(id: string, dismissed: boolean): Promise<void>;
  /** Operator-defined low-stock SKU watches (dashboard "Memoria operativa"). */
  getStockAlerts(): Promise<StockAlert[]>;
  setStockAlerts(alerts: StockAlert[]): Promise<void>;
}

export interface DataSource {
  courses: CourseRepository;
  corsisti: CorsistaRepository;
  educators: EducatorRepository;
  materialTemplates: MaterialTemplateRepository;
  exams: ExamRepository;
  examTemplates: ExamTemplateRepository;
  users: UserRepository;
  notifications: NotificationService;
  settings: SettingsRepository;
}
