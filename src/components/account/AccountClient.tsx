"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar, Badge, Icon, type AvatarTone } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { updateProfileAction } from "@/lib/auth/actions";
import { updateOwnPasswordAction } from "@/lib/auth/supabase-actions";
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

export function AccountClient({ me, users }: { me: User; users: User[] }) {
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
    </div>
  );
}
