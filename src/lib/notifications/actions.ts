"use server";

import { getDataSource } from "@/lib/data";
import { assertRole } from "@/lib/auth/guard";

/** Silence (resolve) or restore a notification from the bell. Persisted in settings_kv. */
export async function setNotificationDismissedAction(
  id: string,
  dismissed: boolean,
): Promise<void> {
  // The dismissed set is a single shared settings_kv key — gate it so a normal
  // user can't dismiss notifications for everyone.
  await assertRole(["admin", "manager"]);
  const ds = await getDataSource();
  await ds.settings.setNotificationDismissed(id, dismissed);
}
