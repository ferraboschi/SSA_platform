"use server";

// Server actions backing the user switcher and profile editing. They mutate the
// session through the AuthProvider and revalidate the app shell so every server
// component re-reads the new current user.

import { revalidatePath } from "next/cache";
import type { User } from "@/lib/domain";
import { getAuthProvider } from "./session";

export async function switchUserAction(id: string): Promise<void> {
  await getAuthProvider().switchUser(id);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(
  id: string,
  patch: Partial<User>,
): Promise<User> {
  const user = await getAuthProvider().updateProfile(id, patch);
  revalidatePath("/", "layout");
  return user;
}
