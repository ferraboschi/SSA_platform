"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { setThresholdsAction } from "@/lib/data/settings-actions";
import type { DashThresholds } from "@/lib/domain";

const numStyle = { width: 72, height: 32, padding: "0 8px", textAlign: "right" as const };

function Row({
  icon,
  title,
  sub,
  children,
}: {
  icon: "download" | "book" | "exam";
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--border-2)",
      }}
    >
      <span
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 30,
          height: 30,
          borderRadius: 7,
          background: "var(--surface-2)",
          color: "var(--text-2)",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function DashThresholdsModal({
  thresholds,
  onClose,
}: {
  thresholds: DashThresholds;
  onClose: () => void;
}) {
  const t = useT();
  const [shipDays, setShipDays] = useState(String(thresholds.shipDays));
  const [bookMin, setBookMin] = useState(String(thresholds.bookMin));
  const [sakeExamPct, setSakeExamPct] = useState(String(thresholds.sakeExamPct));
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      await setThresholdsAction({
        shipDays: Math.max(0, Number(shipDays) || 0),
        bookMin: Math.max(0, Number(bookMin) || 0),
        sakeExamPct: Math.min(100, Math.max(0, Number(sakeExamPct) || 0)),
      });
      onClose();
    });
  };

  const m = t.dashboard.thresholdsModal;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 37, 64, 0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 200,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          boxShadow: "var(--sh-popover)",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              {m.eyebrow}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{m.title}</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: "6px 22px 14px" }}>
          <Row icon="download" title={m.shipTitle} sub={m.shipSub}>
            <input
              className="input num"
              type="number"
              min="0"
              value={shipDays}
              onChange={(e) => setShipDays(e.target.value)}
              style={numStyle}
            />
          </Row>
          <Row icon="book" title={m.bookTitle} sub={m.bookSub}>
            <input
              className="input num"
              type="number"
              min="0"
              value={bookMin}
              onChange={(e) => setBookMin(e.target.value)}
              style={numStyle}
            />
          </Row>
          <Row icon="exam" title={m.sakeTitle} sub={m.sakeSub}>
            <input
              className="input num"
              type="number"
              min="0"
              max="100"
              value={sakeExamPct}
              onChange={(e) => setSakeExamPct(e.target.value)}
              style={numStyle}
            />
          </Row>
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            background: "var(--surface-2)",
          }}
        >
          <button className="btn" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            <Icon name="check" size={12} />
            {m.save}
          </button>
        </div>
      </div>
    </div>
  );
}
