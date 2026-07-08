"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { ignoreProductAction } from "@/lib/corsi/ignore-product-action";

// Owner's Bug-3 flag: mark a Shopify product as "not a course" (bundle/package
// sale vehicle). Destructive (removes the corso record), so: only rendered by
// the page when the course has zero enrollments, and confirmed in a dialog
// that spells out exactly what happens.
export function IgnoreProductButton({ courseId }: { courseId: string }) {
  const s = useT().corsi.detail.ignore;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (working) return;
    setWorking(true);
    setError(null);
    const res = await ignoreProductAction(courseId).catch(() => ({ ok: false as const, error: s.error }));
    if (res.ok) {
      router.push("/corsi");
      router.refresh();
      return;
    }
    setWorking(false);
    setError(res.error ?? s.error);
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="x" size={13} />
        {s.button}
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.4)" }}
            onClick={() => !working && setOpen(false)}
          />
          <div
            role="dialog"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 201,
              width: "min(520px, 92vw)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--sh-popover)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "var(--danger-bg)",
                  color: "var(--danger-fg)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="warn" size={15} />
              </span>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
              <button
                className="btn btn-icon btn-ghost"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => !working && setOpen(false)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 8px", lineHeight: 1.5 }}>
              {s.hint}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--danger-fg)", margin: "0 0 14px", fontWeight: 600 }}>
              {s.warning}
            </p>

            {error && (
              <div style={{ fontSize: 13, color: "var(--danger-fg)", padding: "0 0 12px" }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setOpen(false)} disabled={working}>
                {s.cancel}
              </button>
              <button className="btn btn-danger" onClick={confirm} disabled={working}>
                {working ? s.working : s.confirm}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
