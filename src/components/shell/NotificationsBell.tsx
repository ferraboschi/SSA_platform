"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import { setNotificationDismissedAction } from "@/lib/notifications/actions";
import type { IconName } from "@/components/ui";
import type { Notification } from "@/lib/domain";

export function NotificationsBell({
  notifications,
}: {
  notifications: Notification[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [, startTransition] = useTransition();
  // Optimistic override so a click hides/shows the row instantly, before the
  // server round-trip + router.refresh confirm it.
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const isDismissed = (nt: Notification) =>
    override[nt.id] ?? nt.dismissed ?? false;

  const active = useMemo(
    () => notifications.filter((nt) => !isDismissed(nt)),
    [notifications, override],
  );
  const resolved = useMemo(
    () => notifications.filter((nt) => isDismissed(nt)),
    [notifications, override],
  );
  const n = active.length;

  function toggle(id: string, dismissed: boolean) {
    setOverride((o) => ({ ...o, [id]: dismissed }));
    startTransition(async () => {
      await setNotificationDismissedAction(id, dismissed);
      router.refresh();
    });
  }

  function row(nt: Notification, kind: "active" | "resolved") {
    const k = t.notifications.kinds[nt.kind];
    const dismissed = kind === "resolved";
    return (
      <div
        key={nt.id}
        style={{
          position: "relative",
          borderBottom: "1px solid var(--border-2)",
          opacity: dismissed ? 0.62 : 1,
        }}
      >
        <Link
          href={nt.href}
          onClick={() => setOpen(false)}
          style={{
            display: "flex",
            gap: 11,
            padding: "12px 40px 12px 16px",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: 7,
              background: dismissed ? "var(--surface-2)" : "var(--danger-bg)",
              color: dismissed ? "var(--text-4)" : "var(--danger-fg)",
              flexShrink: 0,
            }}
          >
            <Icon name={nt.icon as IconName} size={14} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              {format(k.title, nt.params)}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 11.5,
                color: "var(--text-2)",
                marginTop: 2,
                lineHeight: 1.45,
              }}
            >
              {format(k.body, nt.params)}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 10.5,
                color: "var(--text-4)",
                marginTop: 4,
              }}
            >
              {format(k.meta, nt.params)}
            </span>
            {!dismissed && nt.email && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  color: "var(--indigo-600)",
                  marginTop: 5,
                  background: "var(--indigo-50)",
                  padding: "2px 7px",
                  borderRadius: 5,
                }}
              >
                <Icon name="mail" size={10} />
                {format(t.notifications.emailVia, { email: nt.email })}
              </span>
            )}
          </span>
        </Link>
        <button
          className="btn btn-icon btn-ghost"
          title={dismissed ? t.notifications.restore : t.notifications.dismiss}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(nt.id, !dismissed);
          }}
          style={{
            position: "absolute",
            top: 9,
            right: 8,
            width: 24,
            height: 24,
          }}
        >
          <Icon name={dismissed ? "refresh" : "check"} size={13} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-icon btn-ghost"
        title={t.notifications.title}
        onClick={() => setOpen((o) => !o)}
        style={{ position: "relative" }}
      >
        <Icon name="bell" size={15} />
        {n > 0 && (
          <span
            className="num"
            style={{
              position: "absolute",
              top: 1,
              right: 1,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              borderRadius: 8,
              background: "var(--danger)",
              color: "white",
              fontSize: 9.5,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              lineHeight: 1,
            }}
          >
            {n}
          </span>
        )}
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
              top: "calc(100% + 8px)",
              right: 0,
              width: 380,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--sh-popover)",
              zIndex: 70,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-2)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                {t.notifications.title}
              </span>
              {n > 0 && (
                <Badge tone="danger" dot>
                  {n} {t.notifications.toHandle}
                </Badge>
              )}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {n === 0 && !showResolved && (
                <div
                  style={{
                    padding: 28,
                    textAlign: "center",
                    color: "var(--text-3)",
                    fontSize: 12.5,
                  }}
                >
                  {t.notifications.empty}
                </div>
              )}
              {active.map((nt) => row(nt, "active"))}
              {showResolved && resolved.map((nt) => row(nt, "resolved"))}
            </div>

            {resolved.length > 0 && (
              <button
                onClick={() => setShowResolved((s) => !s)}
                style={{
                  width: "100%",
                  padding: "9px 16px",
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  background: "var(--surface-2)",
                  border: "none",
                  borderTop: "1px solid var(--border-2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Icon
                  name={showResolved ? "arrow-up" : "arrow-dn"}
                  size={12}
                />
                {showResolved
                  ? t.notifications.hideResolved
                  : format(t.notifications.showResolved, {
                      count: String(resolved.length),
                    })}
              </button>
            )}

            {n > 0 && (
              <div
                style={{
                  padding: "9px 16px",
                  fontSize: 10.5,
                  color: "var(--text-4)",
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="info" size={11} />
                {t.notifications.resendNote}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
