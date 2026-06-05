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

// ── Staff invites ──────────────────────────────────────────────────────────
//
// We DON'T rely on Supabase's recovery/magic links for staff onboarding: those
// expire after the project's OTP TTL (~1h) and are often pre-consumed by email
// security scanners, so they arrive "già scaduto". Instead we mint our OWN
// invite token (no expiry) stored in settings_kv, email a link to /invito/<token>,
// and the public accept page sets the password via the admin API. This also
// gives us, for free, the persisted list of invited emails + one-click resend.

const INVITES_KEY = "staff-invites";

type StaffRole = "manager" | "social" | "accountant";

export interface StaffInvite {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  userId: string | null;
  createdAt: string;
  lastSentAt: string;
  acceptedAt: string | null;
}

/** Client-safe view of an invite. The token IS exposed here (as the full link)
 *  because this is shown only on the admin-gated Account page — the admin is who
 *  created it — and the link is the fallback delivery channel ("Copia link"). */
export interface StaffInviteView {
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  createdAt: string;
  lastSentAt: string;
  acceptedAt: string | null;
  inviteUrl: string;
}

type Svc = ReturnType<typeof getSupabaseServiceClient>;

async function readInvites(svc: Svc): Promise<StaffInvite[]> {
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", INVITES_KEY)
    .maybeSingle();
  const v = data?.value as { invites?: StaffInvite[] } | StaffInvite[] | null;
  if (!v) return [];
  return Array.isArray(v) ? v : v.invites ?? [];
}

async function writeInvites(svc: Svc, invites: StaffInvite[]): Promise<void> {
  await svc
    .from("settings_kv")
    .upsert({ key: INVITES_KEY, value: { invites } }, { onConflict: "key" });
}

function newToken(): string {
  // 256 bits of entropy — unguessable. No expiry, so it must be long & random.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function inviteUrl(token: string): string {
  return `${appConfig.baseUrl.replace(/\/$/, "")}/invito/${token}`;
}

function toView(i: StaffInvite): StaffInviteView {
  return {
    email: i.email,
    firstName: i.firstName,
    lastName: i.lastName,
    role: i.role,
    createdAt: i.createdAt,
    lastSentAt: i.lastSentAt,
    acceptedAt: i.acceptedAt,
    inviteUrl: inviteUrl(i.token),
  };
}

function inviteEmailHtml(firstName: string, link: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <h2 style="font-size:18px;margin:8px 0 14px">Benvenuto/a nella piattaforma SSA</h2>
    <p style="font-size:14px;line-height:1.5">${firstName ? firstName + ", " : ""}il tuo account è pronto. Imposta la password per accedere — il link non scade:</p>
    <p style="margin:22px 0 6px"><a href="${link}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Imposta la password</a></p>
    <p style="font-size:12px;color:#6b7280;margin-top:10px">Oppure copia questo indirizzo nel browser:<br><span style="word-break:break-all;color:#4f46e5">${link}</span></p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Se non aspettavi questo invito, ignora l'email. · Sake Sommelier Association</p>
  </div>`;
}

async function sendInviteEmail(
  invite: StaffInvite,
): Promise<{ status: "sent" | "skipped" | "error"; error?: string }> {
  const link = inviteUrl(invite.token);
  try {
    const res = await getEmailService().send({
      to: invite.email,
      subject: "Invito alla piattaforma SSA — imposta la tua password",
      html: inviteEmailHtml(invite.firstName, link),
      tag: "staff-invite",
    });
    return { status: res.status === "skipped" ? "skipped" : "sent" };
  } catch (e) {
    // Resend rejects (e.g. unverified sending domain → 403) surface here instead
    // of crashing the action — the admin can still deliver the link manually.
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Admin: invite a staff member. Creates their auth user (or reuses an existing
 * one), sets the chosen role + name on their profile, mints a non-expiring
 * invite token, and emails a set-password link. Idempotent per email: re-running
 * keeps the same person and refreshes/sends the invite.
 */
export async function inviteStaffAction(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
}): Promise<AuthActionResult> {
  await assertRole(["admin"]);
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!email || !email.includes("@")) return { ok: false, error: "Email non valida." };
  if (!["manager", "social", "accountant"].includes(input.role)) {
    return { ok: false, error: "Ruolo non valido." };
  }

  const svc = getSupabaseServiceClient();

  // Create the auth user (idempotent: an "already registered" user is re-invited).
  let userId: string | null = null;
  const created = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      return { ok: false, error: created.error.message };
    }
  } else {
    userId = created.data.user?.id ?? null;
  }

  // Set the chosen role + name on the profile (created by the auth trigger).
  const patch = { role: input.role, first_name: firstName, last_name: lastName };
  const q = svc.from("profiles").update(patch);
  const upd = userId ? await q.eq("id", userId) : await q.eq("email", email);
  if (upd.error) return { ok: false, error: upd.error.message };

  // Resolve the auth user id (profiles.id === auth.users.id) for the accept step.
  if (!userId) {
    const { data: prof } = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
    userId = (prof?.id as string | undefined) ?? null;
  }

  // Upsert the invite record. Reuse the existing token if the person was already
  // invited and hasn't accepted yet (so any old email still works); otherwise mint.
  const now = new Date().toISOString();
  const invites = await readInvites(svc);
  const idx = invites.findIndex((i) => i.email === email);
  let invite: StaffInvite;
  if (idx >= 0 && !invites[idx].acceptedAt) {
    invite = {
      ...invites[idx],
      firstName,
      lastName,
      role: input.role,
      userId,
      lastSentAt: now,
    };
    invites[idx] = invite;
  } else {
    invite = {
      token: newToken(),
      email,
      firstName,
      lastName,
      role: input.role,
      userId,
      createdAt: now,
      lastSentAt: now,
      acceptedAt: idx >= 0 ? null : null,
    };
    if (idx >= 0) invites[idx] = invite;
    else invites.push(invite);
  }
  await writeInvites(svc, invites);

  const mail = await sendInviteEmail(invite);
  if (mail.status === "sent") {
    return { ok: true, note: `Invito inviato a ${email} (il link non scade).` };
  }
  if (mail.status === "skipped") {
    return { ok: true, note: "Account creato. Email non configurata: usa “Copia link” qui sotto e invialo tu." };
  }
  return {
    ok: true,
    note: `Account creato, ma l'email non è partita (${mail.error || "errore"}). Usa “Copia link” qui sotto e invialo tu.`,
  };
}

/** Admin: the list of invited staff (for the Account page). */
export async function listStaffInvitesAction(): Promise<StaffInviteView[]> {
  await assertRole(["admin"]);
  const svc = getSupabaseServiceClient();
  const invites = await readInvites(svc);
  return invites
    .slice()
    .sort((a, b) => (a.lastSentAt < b.lastSentAt ? 1 : -1))
    .map(toView);
}

/** Admin: re-send the invite email for an already-invited address. */
export async function resendInviteAction(email: string): Promise<AuthActionResult> {
  await assertRole(["admin"]);
  const target = email.trim().toLowerCase();
  const svc = getSupabaseServiceClient();
  const invites = await readInvites(svc);
  const idx = invites.findIndex((i) => i.email === target);
  if (idx < 0) return { ok: false, error: "Invito non trovato." };
  if (invites[idx].acceptedAt) {
    return { ok: false, error: "Questa persona ha già impostato la password (accesso attivo)." };
  }
  invites[idx] = { ...invites[idx], lastSentAt: new Date().toISOString() };
  await writeInvites(svc, invites);
  const mail = await sendInviteEmail(invites[idx]);
  if (mail.status === "sent") {
    return { ok: true, note: `Invito reinviato a ${target}.` };
  }
  if (mail.status === "skipped") {
    return { ok: true, note: "Email non configurata: usa “Copia link” qui sotto." };
  }
  return {
    ok: true,
    note: `Email non partita (${mail.error || "errore"}). Usa “Copia link” qui sotto.`,
  };
}

/** Public (token-gated): look up a pending invite by its token. */
export async function getInviteByTokenAction(
  token: string,
): Promise<{ email: string; firstName: string; accepted: boolean } | null> {
  if (!token) return null;
  const svc = getSupabaseServiceClient();
  const invites = await readInvites(svc);
  const inv = invites.find((i) => i.token === token);
  if (!inv) return null;
  return { email: inv.email, firstName: inv.firstName, accepted: !!inv.acceptedAt };
}

/**
 * Public (token-gated): the invited person sets their password. Validates the
 * token, sets the password via the admin API, marks the invite accepted, and
 * signs the user in (creates the session cookie), then redirects to /dashboard.
 */
export async function acceptInviteAction(
  token: string,
  password: string,
): Promise<AuthActionResult> {
  if (!token) return { ok: false, error: "Link non valido." };
  if (!password || password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri." };
  }
  const svc = getSupabaseServiceClient();
  const invites = await readInvites(svc);
  const idx = invites.findIndex((i) => i.token === token);
  if (idx < 0) return { ok: false, error: "Link non valido o revocato." };
  const inv = invites[idx];

  // Resolve userId defensively (older invites may have stored null).
  let userId = inv.userId;
  if (!userId) {
    const { data: prof } = await svc.from("profiles").select("id").eq("email", inv.email).maybeSingle();
    userId = (prof?.id as string | undefined) ?? null;
  }
  if (!userId) return { ok: false, error: "Account non trovato. Contatta l'amministratore." };

  const set = await svc.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (set.error) return { ok: false, error: set.error.message };

  invites[idx] = { ...inv, userId, acceptedAt: new Date().toISOString() };
  await writeInvites(svc, invites);

  // Sign them in so they land already authenticated.
  const sb = await getSupabaseServerClient();
  const { error } = await sb.auth.signInWithPassword({ email: inv.email, password });
  if (error) {
    // Password is set even if auto-login failed — send them to /login.
    return { ok: true, note: "Password impostata. Accedi dalla pagina di login." };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
