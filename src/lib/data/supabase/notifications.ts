import "server-only";

import type { CourseTypeKey, Educator, Notification } from "@/lib/domain";
import type {
  CourseRepository,
  NotificationService,
  SettingsRepository,
  UserRepository,
} from "../repository";
import { computeNotifications } from "@/lib/notifications/registry";
import type { RepoContext } from "./context";

type NotificationsDeps = {
  coursesRepo: CourseRepository;
  usersRepo: UserRepository;
  settingsRepo: SettingsRepository;
  loadQuals: () => Promise<Map<number, CourseTypeKey[]>>;
  loadEducatorsMap: () => Promise<Map<number, Educator>>;
};

export function makeNotificationsService(
  _ctx: RepoContext,
  deps: NotificationsDeps,
): NotificationService {
  const { coursesRepo, usersRepo, settingsRepo, loadQuals, loadEducatorsMap } =
    deps;

  // Once coursesRepo returns real data, the same registry powers Supabase
  // notifications automatically — no other change needed.
  const notificationsService: NotificationService = {
    async list(): Promise<Notification[]> {
      const courses = await coursesRepo.list();
      const quals = await loadQuals();
      // Resolve the educator's domain id (external_id slug OR "db-<n>") back to
      // the numeric educators.id that quals is keyed by. Without this, every
      // course taught by an external_id educator falsely fired educator-mismatch.
      const eduMap = await loadEducatorsMap(); // Map<number, Educator>
      const numIdByDomainId = new Map<string, number>();
      for (const [numId, edu] of eduMap) numIdByDomainId.set(edu.id, numId);
      const isQualified = (educatorDomainId: string, type: CourseTypeKey) => {
        const numId = educatorDomainId.startsWith("db-")
          ? Number(educatorDomainId.slice(3))
          : numIdByDomainId.get(educatorDomainId);
        if (numId == null || Number.isNaN(numId)) return false;
        return (quals.get(numId) ?? []).includes(type);
      };
      const current = await usersRepo.getCurrent();
      const dismissed = new Set(await settingsRepo.getDismissedNotifications());
      const notifs = computeNotifications({ courses, isQualified });
      return notifs.map((n) => ({
        ...n,
        email: n.email || current.email,
        dismissed: dismissed.has(n.id),
      }));
    },
  };

  return notificationsService;
}
