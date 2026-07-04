"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Avatar, Icon } from "@/components/ui";
import { createPlannerShareLink } from "@/lib/share-links/actions";
import { useT, format } from "@/lib/i18n";
import type { PlannerEducator } from "@/lib/pianificatore";
import { plOverlay, plDialog } from "./modal-styles";

const shareRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  border: "1px solid var(--border-2)",
  borderRadius: 8,
  cursor: "pointer",
  background: "var(--surface)",
};

// ---------- Share modal ----------
export function PL_ShareModal({
  educators,
  adminName,
  onClose,
}: {
  educators: PlannerEducator[];
  adminName: string | null;
  onClose: () => void;
}) {
  const t = useT().pianificatore.shareModal;
  const [admin, setAdmin] = useState(true);
  const [eduSel, setEduSel] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  // Real, signed, expiring read-only link to the public planner share page.
  const [link, setLink] = useState("");
  useEffect(() => {
    let alive = true;
    createPlannerShareLink().then((r) => {
      if (alive && r.ok && r.url) setLink(r.url);
    });
    return () => {
      alive = false;
    };
  }, []);
  const recipients = (admin ? 1 : 0) + eduSel.length;
  const toggleEdu = (id: string) =>
    setEduSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const copy = () => {
    try {
      navigator.clipboard.writeText(link);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 540, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              {t.eyebrow}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{t.sub}</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t.withWhom}
          </div>
          <label style={shareRow}>
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1 }}>
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: "var(--indigo-50)",
                  color: "var(--indigo-600)",
                }}
              >
                <Icon name="user" size={13} />
              </span>
              <span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.adminRow}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>
                  {adminName || t.adminFallback} · {t.adminAccess}
                </span>
              </span>
            </span>
          </label>
          <div className="eyebrow" style={{ margin: "16px 0 8px" }}>
            {t.educatorsLabel}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
            {educators.map((e) => (
              <label key={e.id} style={shareRow}>
                <input type="checkbox" checked={eduSel.includes(e.id)} onChange={() => toggleEdu(e.id)} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <Avatar name={e.name} initials={e.initials} size="sm" />
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>
                      {e.role} · {e.city}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            {t.linkLabel}{" "}
            {recipients > 0 && (
              <span style={{ color: "var(--text-4)", fontWeight: 400 }}>· {format(t.recipients, { n: recipients })}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input mono"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, fontSize: 11.5 }}
            />
            <button className={`btn ${copied ? "" : "btn-primary"}`} onClick={copy} style={{ whiteSpace: "nowrap" }}>
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? t.copied : t.copy}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={11} />
            {t.readonlyNote}
          </div>
        </div>
      </div>
    </div>
  );
}
