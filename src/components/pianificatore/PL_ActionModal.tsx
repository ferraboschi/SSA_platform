"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import {
  TYPE_COLORS,
  MONTHS,
  fmtDayFull,
  shopifyUrl,
  type PlannerItem,
} from "@/lib/pianificatore";
import { plOverlay, plDialog } from "./modal-styles";

// ---------- Action modal ----------
export function PL_ActionModal({
  item,
  onNote,
  onRemove,
  onClose,
}: {
  item: PlannerItem;
  onNote: (note: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const pian = useT().pianificatore;
  const t = pian.actionModal;
  const common = pian.common;
  const tc = TYPE_COLORS[item.type];
  const [note, setNote] = useState(item.note || "");
  const monthLabel =
    item.mIdx !== null && item.mIdx !== undefined
      ? `${MONTHS[item.mIdx]} ${item.year || ""}`.trim()
      : t.unplaced;
  const sessions = item.sessions || [];
  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 460, maxHeight: "86vh" }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: tc.solid, minHeight: 40 }} />
            <div>
              <div className="eyebrow" style={{ marginBottom: 3 }}>
                {t.eyebrow}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {item.typeLabel}
                {item.city ? ` · ${item.city}` : ""}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-3)",
                  marginTop: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name={item.mode === "online" ? "globe" : "pin"} size={11} />
                {item.mode === "online" ? t.online : t.inPerson} · {monthLabel}
                {item.educator ? ` · ${item.educator.name}` : ` · ${t.educatorTbd}`}
              </div>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: 22, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {sessions.length}{" "}
              {item.mode === "online" ? common.appointments : common.days}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sessions.map((s) => (
                <div
                  key={s.n}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    background: "var(--surface-2)",
                    borderRadius: 6,
                    border: "1px solid var(--border-2)",
                  }}
                >
                  <span className="num" style={{ width: 32, fontSize: 11.5, fontWeight: 700, color: tc.ink }}>
                    {s.n}/{s.total}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{fmtDayFull(s.date)}</span>
                  <span className="num" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-4)" }}>
                    {s.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field-label">{t.notesLabel}</div>
            <textarea
              className="input"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                onNote(e.target.value);
              }}
              placeholder={t.notesPlaceholder}
              style={{ width: "100%", minHeight: 60, padding: "8px 10px", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              lineHeight: 1.5,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              background: "var(--surface-2)",
              borderRadius: 6,
              padding: "10px 12px",
            }}
          >
            <Icon name="info" size={13} className="text-4" />
            <span>
              {t.shopifyPre} <strong>{t.shopifyBold}</strong> {t.shopifyPost}
            </span>
          </div>
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <button className="btn btn-danger" onClick={onRemove}>
            <Icon name="trash" size={12} />
            {t.remove}
          </button>
          <a
            className="btn btn-primary"
            href={shopifyUrl(item.typeLabel + (item.city ? " " + item.city : ""))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={12} />
            {t.createShopify}
          </a>
        </div>
      </div>
    </div>
  );
}
