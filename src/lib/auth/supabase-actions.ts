"use server";

// Supabase Auth — sign-in / sign-up / sign-out actions called from the login
// form. They run server-side, set the session cookies via @supabase/ssr,
// and redirect to the original target page (or /dashboard).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from "@/lib/integrations/supabase/server";
import { appConfig } from "@/lib/integrations/config";
import { assertRole } from "./guard";
import { getEmailService } from "@/lib/integrations/email";
import { safeNext } from "./safe-next";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  /** Informational note shown even on success (e.g. email not configured). */
  note?: string;
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
  redirect(safeNext(next));
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
  // scope "local" clears THIS device's session cookies without a network revoke
  // call that could hang/fail; wrapped so even a transient error still clears +
  // lets the client navigate. (Navigation is done client-side after this returns
  // — a redirect() inside a transition action doesn't reliably navigate.)
  try {
    await sb.auth.signOut({ scope: "local" });
  } catch {
    /* still revalidate + let the client redirect to /login */
  }
  revalidatePath("/", "layout");
}

/** Send a password-reset email. Always reports success (don't leak whether the
 *  address exists). The link lands on /reset-password to set a new password. */
export async function requestPasswordResetAction(
  email: string,
): Promise<AuthActionResult> {
  const sb = await getSupabaseServerClient();
  const base = appConfig.baseUrl.replace(/\/$/, "");
  // Land on the Route Handler — it can persist the recovery-session cookies
  // (a Server Component cannot), then it forwards to /reset-password.
  await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/auth/reset`,
  });
  return { ok: true };
}

/** Set a new password for the user in the current (recovery) session. */
export async function updatePasswordAction(
  password: string,
): Promise<AuthActionResult> {
  const sb = await getSupabaseServerClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Change the signed-in user's own password from Account (no redirect). */
export async function updateOwnPasswordAction(
  password: string,
): Promise<AuthActionResult> {
  if (!password || password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri." };
  }
  const sb = await getSupabaseServerClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Sessione non valida. Rifai l'accesso." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Admin: invite a staff member. Creates their auth user (or reuses an existing
 * one), sets the chosen role + name on their profile, and emails a set-password
 * link via Resend. The role is chosen explicitly (never the manager default).
 */
export async function inviteStaffAction(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: "manager" | "social" | "accountant";
}): Promise<AuthActionResult> {
  await assertRole(["admin"]);
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Email non valida." };
  if (!["manager", "social", "accountant"].includes(input.role)) {
    return { ok: false, error: "Ruolo non valido." };
  }

  const svc = getSupabaseServiceClient();
  const base = appConfig.baseUrl.replace(/\/$/, "");

  // Create the auth user (idempotent: an "already registered" user is re-invited).
  let userId: string | null = null;
  const created = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName },
  });
  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      return { ok: false, error: created.error.message };
    }
  } else {
    userId = created.data.user?.id ?? null;
  }

  // Set the chosen role + name on the profile (created by the auth trigger).
  const patch = { role: input.role, first_name: input.firstName, last_name: input.lastName };
  const q = svc.from("profiles").update(patch);
  const upd = userId ? await q.eq("id", userId) : await q.eq("email", email);
  if (upd.error) return { ok: false, error: upd.error.message };

  // Generate a set-password (recovery) link and email it via Resend.
  const link = await svc.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${base}/auth/reset` },
  });
  const actionLink = link.data?.properties?.action_link;
  if (link.error || !actionLink) {
    return { ok: true, note: "Account creato, ma non ho potuto generare il link di accesso. Chiedi alla persona di usare “Password dimenticata?”." };
  }

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <h2 style="font-size:18px;margin:8px 0 14px">Benvenuto/a nella piattaforma SSA</h2>
    <p style="font-size:14px;line-height:1.5">${input.firstName ? input.firstName + ", " : ""}il tuo account è pronto. Imposta la password per accedere:</p>
    <p style="margin:22px 0 6px"><a href="${actionLink}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Imposta la password</a></p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Se non aspettavi questo invito, ignora l'email. · Sake Sommelier Association</p>
  </div>`;

  const res = await getEmailService().send({
    to: email,
    subject: "Invito alla piattaforma SSA — imposta la tua password",
    html,
    tag: "staff-invite",
  });
  if (res.status === "skipped") {
    return { ok: true, note: "Account creato. Email NON inviata (Resend non configurato): la persona può usare “Password dimenticata?”." };
  }
  return { ok: true, note: `Invito inviato a ${email}.` };
}
