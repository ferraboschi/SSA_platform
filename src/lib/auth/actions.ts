"use server";

// Server actions backing the user switcher and profile editing. They mutate the
// session through the AuthProvider and revalidate the app shell so every server
// component re-reads the new current user.

import { revalidatePath } from "next/cache";
import type { User } from "@/lib/domain";
import { getAuthProvider, getSession } from "./session";
import { assertRole, hasRole } from "./guard";

export async function switchUserAction(id: string): Promise<void> {
  // Impersonation is an admin-only dev affordance.
  await assertRole(["admin"]);
  await getAuthProvider().switchUser(id);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(
  id: string,
  patch: Partial<User>,
): Promise<User> {
  // A user may edit only their OWN profile; admins may edit anyone. Without this
  // the service-role write bypasses RLS, allowing account takeover by id.
  const me = (await getSession()).user;
  if (id !== me.id && !(await hasRole(["admin"]))) {
    throw new Error("Non autorizzato.");
  }
  const user = await getAuthProvider().updateProfile(id, patch);
  revalidatePath("/", "layout");
  return user;
}
