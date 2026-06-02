// In-memory DataSource adapter, backed by the ported prototype seed.
//
// Holds the seed in memory and layers mutable state (course patches, educator
// qualifications, dashboard thresholds, current user + profile patches) on top,
// mirroring the prototype's localStorage-backed behaviour. Mutations are
// process-local and reset on reload — production swaps in a persistent adapter.

import {
  DEFAULT_QUALS,
  DEFAULT_THRESHOLDS,
  FALLBACK_QUALS,
  type Course,
  type DashThresholds,
  type StockAlert,
  type User,
} from "@/lib/domain";
import type {
  CourseLifecycle,
  CourseStatus,
  CourseTypeKey,
  ExamFamily,
} from "@/lib/domain";
import type {
  CorsistaRepository,
  CourseFilter,
  CourseRepository,
  DataSource,
  EducatorRepository,
  ExamRepository,
  ExamTemplateRepository,
  MaterialTemplateRepository,
  NotificationService,
  SettingsRepository,
  UserRepository,
} from "../repository";
import { buildSeed, type SeedData } from "./seed";
import { computeNotifications } from "@/lib/notifications/registry";

function toArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function matchesFilter(course: Course, filter?: CourseFilter): boolean {
  if (!filter) return true;
  const lc = toArray<CourseLifecycle>(filter.lifecycle);
  if (lc && !lc.includes(course.lifecycle)) return false;
  const ty = toArray<CourseTypeKey>(filter.type);
  if (ty && !ty.includes(course.type)) return false;
  const st = toArray<CourseStatus>(filter.status);
  if (st && !st.includes(course.status)) return false;
  return true;
}

export function createInMemoryDataSource(
  seedOverride?: SeedData,
): DataSource {
  const seed = seedOverride ?? buildSeed();

  const courses = new Map<string, Course>(seed.courses.map((c) => [c.id, c]));
  const corsisti = seed.corsisti;
  const educators = seed.educators;
  const materialTemplates = seed.materialTemplates;
  const examTemplates = seed.examTemplates;
  const users = seed.users;

  // Mutable overlays (prototype kept these in localStorage).
  const qualOverrides = new Map<string, CourseTypeKey[]>();
  const profileOverrides = new Map<string, Partial<User>>();
  let thresholds: DashThresholds = { ...DEFAULT_THRESHOLDS };
  let stockAlerts: StockAlert[] = [];
  let currentUserId = users[0]?.id ?? "lorenzo";

  const getQuals = (id: string): CourseTypeKey[] =>
    qualOverrides.get(id) ?? DEFAULT_QUALS[id] ?? FALLBACK_QUALS;

  const isQualified = (id: string, type: CourseTypeKey): boolean =>
    getQuals(id).includes(type);

  // Synthetic placeholder when the seed is empty (USE_SEED=false and no
  // real backend yet): avoids `undefined` user crashes in views that always
  // expect getCurrent().
  const PLACEHOLDER_USER: User = {
    id: "placeholder",
    first: "",
    last: "",
    name: "—",
    role: "manager",
    roleKey: "manager",
    email: "",
    phone: "",
    city: "",
    position: "",
    initials: "?",
    tone: "neutral",
  };

  const resolveUser = (id: string): User => {
    const base = users.find((u) => u.id === id) ?? users[0] ?? PLACEHOLDER_USER;
    return { ...base, ...profileOverrides.get(id) };
  };

  const courseRepo: CourseRepository = {
    async list(filter) {
      return [...courses.values()].filter((c) => matchesFilter(c, filter));
    },
    async getById(id) {
      return courses.get(id) ?? null;
    },
    async getByHandle(handle) {
      return [...courses.values()].find((c) => c.handle === handle) ?? null;
    },
    async update(id, patch) {
      const existing = courses.get(id);
      if (!existing) throw new Error(`Course not found: ${id}`);
      const next = { ...existing, ...patch };
      courses.set(id, next);
      return next;
    },
  };

  const corsistaRepo: CorsistaRepository = {
    async list() {
      return corsisti;
    },
    async getByEmail(email) {
      const key = email.toLowerCase();
      return corsisti.find((c) => c.email.toLowerCase() === key) ?? null;
    },
  };

  const educatorRepo: EducatorRepository = {
    async list() {
      return educators;
    },
    async getById(id) {
      return educators.find((e) => e.id === id) ?? null;
    },
    async getQualifications(id) {
      return getQuals(id);
    },
    async setQualifications(id, types) {
      qualOverrides.set(id, types);
    },
    async qualifiedFor(type) {
      return educators.filter((e) => isQualified(e.id, type));
    },
  };

  const materialRepo: MaterialTemplateRepository = {
    async list() {
      return materialTemplates;
    },
    async getById(id) {
      return materialTemplates.find((t) => t.id === id) ?? null;
    },
    async save(template) {
      const idx = materialTemplates.findIndex((t) => t.id === template.id);
      if (idx === -1) materialTemplates.unshift(template);
      else materialTemplates[idx] = template;
    },
    async remove(id) {
      const idx = materialTemplates.findIndex((t) => t.id === id);
      if (idx !== -1) materialTemplates.splice(idx, 1);
    },
  };

  const examRepo: ExamRepository = {
    async getByCourseId(courseId) {
      return courses.get(courseId)?.exam ?? null;
    },
    async resultsByCourseId(courseId) {
      return courses.get(courseId)?.examResults2 ?? [];
    },
    async liveByCourseId(courseId) {
      return courses.get(courseId)?.examLive ?? [];
    },
  };

  const examTemplateRepo: ExamTemplateRepository = {
    async list() {
      return examTemplates;
    },
    async getByFamily(family: ExamFamily) {
      return examTemplates.find((t) => t.family === family) ?? null;
    },
  };

  const userRepo: UserRepository = {
    async list() {
      return users.map((u) => resolveUser(u.id));
    },
    async getById(id) {
      return users.some((u) => u.id === id) ? resolveUser(id) : null;
    },
    async getCurrent() {
      return resolveUser(currentUserId);
    },
    async setCurrent(id) {
      if (users.some((u) => u.id === id)) currentUserId = id;
    },
    async updateProfile(id, patch) {
      profileOverrides.set(id, { ...profileOverrides.get(id), ...patch });
      return resolveUser(id);
    },
  };

  const notificationService: NotificationService = {
    async list() {
      const notifications = computeNotifications({
        courses: [...courses.values()],
        isQualified,
      });
      // Educators carry no contact data, so route action-required alerts to the
      // current operator — they own the fix (and the Resend email).
      const operator = resolveUser(currentUserId);
      return notifications.map((n) => ({
        ...n,
        email: n.email || operator.email,
        dismissed: dismissedNotifs.has(n.id),
      }));
    },
  };

  const dismissedNotifs = new Set<string>();
  const settingsRepo: SettingsRepository = {
    async getThresholds() {
      return { ...thresholds };
    },
    async setThresholds(patch) {
      thresholds = { ...thresholds, ...patch };
      return { ...thresholds };
    },
    async getDismissedNotifications() {
      return [...dismissedNotifs];
    },
    async setNotificationDismissed(id, dismissed) {
      if (dismissed) dismissedNotifs.add(id);
      else dismissedNotifs.delete(id);
    },
    async getStockAlerts() {
      return stockAlerts.map((a) => ({ ...a }));
    },
    async setStockAlerts(alerts) {
      stockAlerts = alerts.map((a) => ({ ...a }));
    },
  };

  return {
    courses: courseRepo,
    corsisti: corsistaRepo,
    educators: educatorRepo,
    materialTemplates: materialRepo,
    exams: examRepo,
    examTemplates: examTemplateRepo,
    users: userRepo,
    notifications: notificationService,
    settings: settingsRepo,
  };
}
