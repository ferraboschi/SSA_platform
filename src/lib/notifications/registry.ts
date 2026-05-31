// Notification event-type registry.
//
// Each notification "kind" is a self-contained descriptor: it knows how to
// DETECT instances from current state and how to build the Resend EMAIL for
// one of its instances. Adding a new event type (shipment due, exam to grade,
// low enrolment…) means adding one descriptor here and one entry to
// NOTIFICATION_KINDS — nothing else in the pipeline changes.

import type {
  Course,
  CourseTypeKey,
  Notification,
  NotificationKind,
} from "@/lib/domain";
import type { EmailMessage } from "@/lib/integrations/email";

/** State a detector reads to decide which notifications are currently active. */
export interface NotificationContext {
  courses: Course[];
  isQualified: (educatorId: string, type: CourseTypeKey) => boolean;
}

/** Localized templates for a kind, injected at email-build time. */
export interface NotificationEmailStrings {
  subject: string;
  heading: string;
  intro: string;
  cta: string;
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

/**
 * Build the outbound Resend email for a notification. Content is fully
 * localized by the caller (server action passes the active locale's strings),
 * so the same notification mails correctly in any language.
 */
export function buildNotificationEmail(
  notification: Notification,
  recipient: string,
  link: string,
  strings: NotificationEmailStrings,
): EmailMessage {
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1a1a1a">
    <h2 style="margin:0 0 12px">${strings.heading}</h2>
    <p style="margin:0 0 16px;line-height:1.5">${strings.intro}</p>
    <p style="margin:0"><a href="${link}" style="color:#4f46e5">${strings.cta}</a></p>
  </body></html>`;

  return {
    to: recipient,
    subject: strings.subject,
    html,
    text: `${strings.heading}\n\n${strings.intro}\n\n${strings.cta}: ${link}`,
    tag: notification.kind,
  };
}
