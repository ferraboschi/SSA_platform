// Notification event-type registry.
//
// Each notification "kind" is a self-contained descriptor: it knows how to
// DETECT instances from current state. Adding a new event type (shipment due,
// exam to grade, low enrolment…) means adding one descriptor here and one
// entry to NOTIFICATION_KINDS — nothing else in the pipeline changes.

import type {
  Course,
  CourseTypeKey,
  Notification,
  NotificationKind,
} from "@/lib/domain";

/** State a detector reads to decide which notifications are currently active. */
export interface NotificationContext {
  courses: Course[];
  isQualified: (educatorId: string, type: CourseTypeKey) => boolean;
}

export interface NotificationKindDescriptor {
  kind: NotificationKind;
  detect(ctx: NotificationContext): Notification[];
}

const educatorMismatch: NotificationKindDescriptor = {
  kind: "educator-mismatch",
  detect(ctx) {
    const out: Notification[] = [];
    for (const c of ctx.courses) {
      const active = c.lifecycle === "pubblicato" || c.lifecycle === "bozza";
      if (active && c.educator && !ctx.isQualified(c.educator.id, c.type)) {
        out.push({
          id: `qual-${c.id}`,
          kind: "educator-mismatch",
          tone: "danger",
          icon: "warn",
          params: {
            educator: c.educator.name,
            course: c.shortTitle,
            type: c.typeLabel,
            city: c.city,
            month: c.month,
            year: String(c.year),
          },
          // Recipient is resolved by the NotificationService (educators carry
          // no contact data in the prototype model → routed to the operator).
          email: "",
          href: `/corsi/${c.id}`,
          courseId: c.id,
        });
      }
    }
    return out;
  },
};

const REGISTRY: Record<NotificationKind, NotificationKindDescriptor> = {
  "educator-mismatch": educatorMismatch,
};

/** Run every registered detector against the current state. */
export function computeNotifications(ctx: NotificationContext): Notification[] {
  return Object.values(REGISTRY).flatMap((d) => d.detect(ctx));
}
