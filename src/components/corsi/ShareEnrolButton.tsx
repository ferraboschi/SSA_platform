"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";

/**
 * Shares a course's public ENROLMENT link (the storefront signup URL) so the
 * owner can send it to prospects and build the course WhatsApp group. Clones the
 * ShareEducatorButton popover UI: readonly link + copy + "Apri", plus a secondary
 * WhatsApp action (pre-filled wa.me caption). When `enrolUrl` is empty (a draft or
 * not-yet-synced course) the trigger is disabled with a hint.
 */
export function ShareEnrolButton({
  enrolUrl,
  title,
}: {
  enrolUrl: string;
  title: string;
}) {
  const t = useT().corsi.detail;
  const s = t.enrol;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const available = enrolUrl.trim().length > 0;

  async function copy() {
    if (!available) return;
    try {
      await navigator.clipboard.writeText(enrolUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  // Open programmatically in the same click tick — a declarative
  // <a target="_blank"> can land on an empty about:blank tab in some browsers.
  function openPreview() {
    if (!available) return;
    const w = window.open(enrolUrl, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = enrolUrl;
  }

  // Short caption + the enrol link, pre-filled into WhatsApp's compose box.
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title}\n${enrolUrl}`)}`;

  if (!available) {
    return (
      <button className="btn" disabled title={s.unavailable}>
        <Icon name="whatsapp" size={13} />
        {s.button}
      </button>
    );
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="whatsapp" size={13} />
        {s.button}
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.4)" }}
            onClick={() => setOpen(false)}
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
                  background: "var(--indigo-50)",
                  color: "var(--indigo-600)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="whatsapp" size={15} />
              </span>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
              <button
                className="btn btn-icon btn-ghost"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => setOpen(false)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 14px", lineHeight: 1.5 }}>
              {s.hint}
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                readOnly
                value={enrolUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{ flex: 1, fontSize: 12.5, fontFamily: "var(--font-mono)" }}
              />
              <button className="btn btn-primary" onClick={copy} style={{ flexShrink: 0 }}>
                <Icon name={copied ? "check" : "copy"} size={13} />
                {copied ? s.copied : s.copy}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <a
                className="btn btn-sm"
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="whatsapp" size={12} />
                {s.sendWhatsapp}
              </a>
              <button type="button" className="btn btn-sm" onClick={openPreview}>
                <Icon name="external" size={12} />
                {s.open}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
