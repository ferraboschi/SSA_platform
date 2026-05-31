"use server";

// Supabase Auth — sign-in / sign-up / sign-out actions called from the login
// form. They run server-side, set the session cookies via @supabase/ssr,
// and redirect to the original target page (or /dashboard).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export async function signInAction(
  email: string,
  password: string,
  next: string = "/dashboard",
): Promise<AuthActionResult> {
  const sb = await getSupabaseServerClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUpAction(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<AuthActionResult> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
    },
  });
  if (error) return { ok: false, error: error.message };

  // If Supabase requires email confirmation, there's no session yet — surface
  // a friendly message so the UI can switch to "check your inbox".
  if (!data.session) {
    return {
      ok: true,
      error:
        "Account creato. Controlla l'email per confermare prima del primo login.",
    };
  }

  // Backfill the profile row with the name fields from sign-up. The trigger
  // already created the row (id + email), but with empty first/last names.
  await sb
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", data.session.user.id);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const sb = await getSupabaseServerClient();
  await sb.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
