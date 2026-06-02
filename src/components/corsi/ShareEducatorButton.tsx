"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { createShareLink } from "@/lib/share-links/actions";

export function ShareEducatorButton({ courseId }: { courseId: string }) {
  const t = useT().corsi.detail;
  const s = t.share;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setOpen(true);
    if (url || loading) return;
    setLoading(true);
    setError(null);
    const res = await createShareLink(courseId);
    setLoading(false);
    if (res.ok && res.url) {
      setUrl(res.url);
      setExpiresAt(res.expiresAt ?? null);
    } else {
      setError(res.error ?? s.error);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <>
      <button className="btn" onClick={generate}>
        <Icon name="share" size={13} />
        {t.shareEducator}
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
                <Icon name="share" size={15} />
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

            {loading && (
              <div style={{ fontSize: 13, color: "var(--text-3)", padding: "12px 0" }}>{s.generating}</div>
            )}
            {error && (
              <div style={{ fontSize: 13, color: "var(--danger-fg)", padding: "12px 0" }}>{error}</div>
            )}

            {url && (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: 1, fontSize: 12.5, fontFamily: "var(--font-mono)" }}
                  />
                  <button className="btn btn-primary" onClick={copy} style={{ flexShrink: 0 }}>
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? s.copied : s.copy}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <a className="btn btn-sm" href={url} target="_blank" rel="noopener">
                    <Icon name="external" size={12} />
                    {s.open}
                  </a>
                  {expiryLabel && (
                    <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>
                      {s.expires} {expiryLabel}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
