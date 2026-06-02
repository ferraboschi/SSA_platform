"use server";

import { format } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n/server";
import { appConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
import { getDataSource } from "@/lib/data";
import type { EmailSendResult } from "@/lib/integrations/email";
import type { Notification } from "@/lib/domain";
import { buildNotificationEmail } from "./registry";

/** Silence (resolve) or restore a notification from the bell. Persisted in settings_kv. */
export async function setNotificationDismissedAction(
  id: string,
  dismissed: boolean,
): Promise<void> {
  const ds = await getDataSource();
  await ds.settings.setNotificationDismissed(id, dismissed);
}

/**
 * Send the Resend email for a notification, localized to the active UI locale.
 * Unconfigured, the EmailService stub logs and reports `skipped` — so the flow
 * works end-to-end before Resend credentials are wired up.
 */
export async function sendNotificationEmailAction(
  notification: Notification,
): Promise<EmailSendResult> {
  if (!notification.email) {
    return { status: "skipped", provider: "stub" };
  }

  const { t } = await getTranslations();
  const tpl = t.notifications.kinds[notification.kind].email;
  const link = `${appConfig.baseUrl}${notification.href}`;

  const message = buildNotificationEmail(notification, notification.email, link, {
    subject: format(tpl.subject, notification.params),
    heading: format(tpl.heading, notification.params),
    intro: format(tpl.intro, notification.params),
    cta: tpl.cta,
  });

  return getEmailService().send(message);
}
