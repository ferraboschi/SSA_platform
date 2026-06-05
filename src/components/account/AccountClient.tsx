"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Icon, type AvatarTone } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { updateProfileAction } from "@/lib/auth/actions";
import {
  updateOwnPasswordAction,
  inviteStaffAction,
  resendInviteAction,
  revokeInviteAction,
  type StaffInviteView,
} from "@/lib/auth/supabase-actions";
import { useT } from "@/lib/i18n";
import { CITIES } from "@/lib/domain";
import type { User } from "@/lib/domain";

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <input
        className={`input ${mono ? "mono" : ""}`}
        type={type || "text"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
    </div>
  );
}

const STAFF_ROLES = [
  { value: "manager", label: "Manager SSA" },
  { value: "social", label: "Social & Campagne" },
  { value: "accountant", label: "Contabilità" },
] as const;

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager SSA",
  social: "Social & Campagne",
  accountant: "Contabilità",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function InviteStaff({ invites }: { invites: StaffInviteView[] }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "social" | "accountant">("manager");
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const copyLink = async (inv: StaffInviteView) => {
    try {
      await navigator.clipboard.writeText(inv.inviteUrl);
      setCopiedEmail(inv.email);
      setTimeout(() => setCopiedEmail((e) => (e === inv.email ? null : e)), 2000);
    } catch {
      // Clipboard blocked — fall back to a prompt so the link is still copyable.
      window.prompt("Copia il link d’invito:", inv.inviteUrl);
    }
  };

  const invite = () => {
    setMsg(null);
    start(async () => {
      const r = await inviteStaffAction({ email, firstName: first, lastName: last, role });
      setMsg({ ok: r.ok, text: r.ok ? r.note || "Invito inviato." : r.error || "Errore." });
      if (r.ok) {
        setFirst("");
        setLast("");
        setEmail("");
        setRole("manager");
        router.refresh();
      }
    });
  };

  const resend = (addr: string) => {
    setMsg(null);
    setBusyEmail(addr);
    startResend(async () => {
      const r = await resendInviteAction(addr);
      setMsg({ ok: r.ok, text: r.ok ? r.note || "Invito reinviato." : r.error || "Errore." });
      setBusyEmail(null);
      if (r.ok) router.refresh();
    });
  };

  const revoke = (addr: string) => {
    if (!window.confirm(`Annullare l'invito per ${addr}? Il link smetterà di funzionare. L'account NON viene eliminato.`)) {
      return;
    }
    setMsg(null);
    setBusyEmail(addr);
    startResend(async () => {
      const r = await revokeInviteAction(addr);
      setMsg({ ok: r.ok, text: r.ok ? r.note || "Invito annullato." : r.error || "Errore." });
      setBusyEmail(null);
      if (r.ok) router.refresh();
    });
  };

  const usage = (inv: StaffInviteView) => {
    if (inv.acceptedAt) {
      return { tone: "success" as const, label: "Attivo", detail: `attivato il ${fmtDate(inv.acceptedAt)}` };
    }
    if (inv.openedAt) {
      return { tone: "warning" as const, label: "Link aperto", detail: `aperto il ${fmtDate(inv.openedAt)} · password non ancora impostata` };
    }
    return { tone: "neutral" as const, label: "Inviato", detail: `inviato il ${fmtDate(inv.lastSentAt)} · link non ancora aperto` };
  };

  return (
    <section className="card card-pad" style={{ marginTop: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="users" size={12} />
        Invita staff
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>
        Crea l’account di un collaboratore e invia l’email per impostare la
        password. Scegli tu il ruolo: la persona riceverà un link (che non scade)
        e potrà entrare senza che tu condivida alcuna password.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Nome" value={first} onChange={setFirst} placeholder="Camilla" />
        <Field label="Cognome" value={last} onChange={setLast} placeholder="Rossi" />
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="nome@ssa.it" mono />
        <div className="field">
          <div className="field-label">Ruolo</div>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            style={{ width: "100%" }}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={pending || !email.trim() || !email.includes("@")}
        onClick={invite}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Icon name="mail" size={13} />
        {pending ? "Invio…" : "Crea e invita"}
      </button>
      {msg && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: msg.ok ? "var(--good-fg, #15803d)" : "var(--bad-fg, #b91c1c)",
          }}
        >
          {msg.text}
        </div>
      )}

      {invites.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Inviti ({invites.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {invites.map((inv) => {
              const accepted = !!inv.acceptedAt;
              const u = usage(inv);
              const busy = resending && busyEmail === inv.email;
              return (
                <div
                  key={inv.email}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border-2)",
                    borderRadius: 9,
                    background: "var(--surface)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 160 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {[inv.firstName, inv.lastName].filter(Boolean).join(" ") || inv.email}
                      </span>
                      <Badge tone={u.tone} dot>
                        {u.label}
                      </Badge>
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 11.5,
                        color: "var(--text-3)",
                        marginTop: 2,
                      }}
                      title={u.detail}
                    >
                      {inv.email} · {ROLE_LABEL[inv.role] || inv.role} · {u.detail}
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                    {!accepted && (
                      <>
                        <button
                          className="btn btn-ghost"
                          onClick={() => copyLink(inv)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
                        >
                          <Icon name={copiedEmail === inv.email ? "check" : "copy"} size={12} />
                          {copiedEmail === inv.email ? "Copiato" : "Copia link"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => resend(inv.email)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
                        >
                          <Icon name="mail" size={12} />
                          {busy ? "…" : "Reinvia"}
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => revoke(inv.email)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--danger-fg)" }}
                      title="Annulla l'invito (il link smette di funzionare; l'account non viene eliminato)"
                    >
                      <Icon name="trash" size={12} />
                      Cancella
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function AccountClient({
  me,
  users,
  invites = [],
}: {
  me: User;
  users: User[];
  invites?: StaffInviteView[];
}) {
  const t = useT().account.page;
  const { switchUser, switching } = useSession();
  const [, startSave] = useTransition();

  const [first, setFirst] = useState(me.first || "");
  const [last, setLast] = useState(me.last || "");
  const [email, setEmail] = useState(me.email || "");
  const [phone, setPhone] = useState(me.phone || "");
  const [position, setPosition] = useState(me.position || "");
  const [city, setCity] = useState(me.city || "");
  const [photo, setPhoto] = useState(me.photo || "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const data = typeof r.result === "string" ? r.result : "";
      setPhoto(data);
      startSave(async () => {
        await updateProfileAction(me.id, { photo: data });
      });
      flash(t.photoUpdated);
    };
    r.readAsDataURL(f);
  };

  const save = () => {
    startSave(async () => {
      await updateProfileAction(me.id, {
        first,
        last,
        name: `${first} ${last}`.trim(),
        email,
        phone,
        position,
        city,
      });
    });
    flash(t.profileSaved);
  };

  const savePw = () => {
    if (!pw || pw !== pw2) {
      flash(t.passwordMismatch);
      return;
    }
    startSave(async () => {
      const res = await updateOwnPasswordAction(pw);
      if (res.ok) {
        setPw("");
        setPw2("");
        flash(t.passwordUpdated);
      } else {
        flash(res.error || t.passwordMismatch);
      }
    });
  };

  const isAdmin = me.roleKey === "admin";

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--navy)",
            color: "white",
            padding: "10px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "var(--sh-3)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="check" size={13} />
          {toast}
        </div>
      )}

      <section
        className="card card-pad"
        style={{
          marginBottom: 24,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 150 }}>
          {photo ? (
            // Base64 data URL from a user upload — next/image cannot optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={me.name}
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid var(--border)",
              }}
            />
          ) : (
            <Avatar name={me.name} initials={me.initials} tone={me.tone as AvatarTone} size="xl" />
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="download" size={12} />
            {t.changePhoto}
          </button>
          <Badge tone={isAdmin ? "indigo" : "neutral"} dot>
            {isAdmin ? t.roleAdmin : t.roleManager}
          </Badge>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label={t.firstName} value={first} onChange={setFirst} />
            <Field label={t.lastName} value={last} onChange={setLast} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label={t.email} value={email} onChange={setEmail} type="email" mono />
            <Field label={t.phone} value={phone} onChange={setPhone} mono />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label={t.position} value={position} onChange={setPosition} placeholder={t.positionPlaceholder} />
            <div className="field">
              <div className="field-label">{t.city}</div>
              <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
                {CITIES.filter((c) => c !== "Online").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-primary" onClick={save}>
              <Icon name="check" size={13} />
              {t.save}
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={12} />
            {t.security}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label={t.newPassword} value={pw} onChange={setPw} type="password" placeholder="••••••••" />
            <Field label={t.confirmPassword} value={pw2} onChange={setPw2} type="password" placeholder="••••••••" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn" onClick={savePw}>
                <Icon name="check" size={12} />
                {t.updatePassword}
              </button>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="user" size={12} />
            {t.session}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
            {t.sessionIntro}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((uu) => {
              const on = uu.id === me.id;
              return (
                <button
                  key={uu.id}
                  disabled={switching}
                  onClick={() => switchUser(uu.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: `1px solid ${on ? "var(--indigo)" : "var(--border-2)"}`,
                    background: on ? "var(--indigo-50)" : "var(--surface)",
                    borderRadius: 9,
                    cursor: switching ? "wait" : "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <Avatar name={uu.name} initials={uu.initials} tone={uu.tone as AvatarTone} size="md" />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{uu.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3)" }}>{uu.role}</span>
                  </span>
                  {on ? (
                    <Badge tone="indigo" dot>
                      {t.active}
                    </Badge>
                  ) : (
                    <span className="link" style={{ fontSize: 12 }}>
                      {t.login}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {isAdmin && <InviteStaff invites={invites} />}
    </div>
  );
}
