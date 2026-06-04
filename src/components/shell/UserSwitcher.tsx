"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon, type AvatarTone } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { User } from "@/lib/domain";
import { signOutAction } from "@/lib/auth/supabase-actions";

export function UserSwitcher({ users }: { users: User[] }) {
  const t = useT();
  const router = useRouter();
  const { session, switchUser, switching } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  const current = session.user;

  return (
    <div className="sb-foot" style={{ position: "relative" }}>
      <Avatar
        name={current.name}
        initials={current.initials}
        tone={current.tone as AvatarTone}
        size="md"
      />
      <div className="sb-foot-info">
        <div className="sb-foot-name">{current.name}</div>
        <div className="sb-foot-role">{current.role}</div>
      </div>
      <button
        className="btn btn-icon btn-sm btn-ghost"
        onClick={() => setOpen((o) => !o)}
        title={t.account.profileSettings}
        disabled={switching}
      >
        <Icon name="settings" size={14} />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
            onClick={() => setOpen(false)}
          ></div>
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "var(--sh-popover)",
              zIndex: 70,
              padding: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--text-4)",
                padding: "6px 8px 4px",
              }}
            >
              {t.account.loginAs}
            </div>
            {users.map((u) => {
              const on = u.id === current.id;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    switchUser(u.id);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "7px 8px",
                    border: "none",
                    background: on ? "var(--indigo-50)" : "transparent",
                    borderRadius: 7,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <Avatar
                    name={u.name}
                    initials={u.initials}
                    tone={u.tone as AvatarTone}
                    size="sm"
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {u.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        color: "var(--text-3)",
                      }}
                    >
                      {u.role}
                    </span>
                  </span>
                  {on && <Icon name="check" size={13} className="text-2" />}
                </button>
              );
            })}
            <div
              style={{
                height: 1,
                background: "var(--border-2)",
                margin: "4px 0",
              }}
            ></div>
            <button
              onClick={() => {
                router.push("/account");
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px",
                border: "none",
                background: "transparent",
                borderRadius: 7,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: 12.5,
                color: "var(--text)",
              }}
            >
              <Icon name="user" size={14} className="text-3" />
              {t.account.profileSettings}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                startSignOut(async () => {
                  await signOutAction();
                  // Navigate client-side once the session cookies are cleared.
                  router.replace("/login");
                  router.refresh();
                });
              }}
              disabled={signingOut}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px",
                border: "none",
                background: "transparent",
                borderRadius: 7,
                cursor: signingOut ? "wait" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: 12.5,
                color: "var(--danger-fg)",
              }}
            >
              <Icon name="logout" size={14} />
              {signingOut ? "…" : t.account.signOut}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
