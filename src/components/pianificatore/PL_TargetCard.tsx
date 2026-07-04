"use client";

import { useT, format } from "@/lib/i18n";

// ---------- Target card ----------
export interface TargetCardData {
  key: string;
  label: string;
  cur: number;
  tgt: number;
  suffix: string;
  hint?: string;
  delta?: number;
}

export function PL_TargetCard({
  card,
  edit,
  last,
  onChange,
}: {
  card: TargetCardData;
  edit: boolean;
  last: boolean;
  onChange: (v: number) => void;
}) {
  const t = useT().pianificatore.targets;
  const pct = card.tgt ? Math.min(100, Math.round((card.cur / card.tgt) * 100)) : 0;
  const reached = card.cur >= card.tgt;
  const barCls = reached ? "success" : pct >= 60 ? "azzurro" : "warning";
  return (
    <div style={{ padding: "16px 18px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          letterSpacing: "var(--ls-caps)",
          textTransform: "uppercase",
          marginBottom: 8,
          minHeight: 26,
        }}
      >
        {card.label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span
          className="num"
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: reached ? "var(--success-fg)" : "var(--text)",
          }}
        >
          {card.cur}
          {card.suffix}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-4)" }}>/</span>
        {edit ? (
          <input
            className="input"
            type="number"
            value={card.tgt}
            onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
            style={{ width: 58, height: 28, padding: "0 6px", fontSize: 14 }}
          />
        ) : (
          <span className="num" style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>
            {card.tgt}
            {card.suffix}
          </span>
        )}
      </div>
      <div className={`bar ${barCls}`} style={{ marginTop: 8 }}>
        <i style={{ width: pct + "%" }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
          minHeight: 16,
        }}
      >
        <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>
          {card.hint || (reached ? t.reached : format(t.missing, { n: Math.max(0, card.tgt - card.cur) }))}
        </span>
        {card.delta != null && card.delta > 0 && (
          <span className="num" style={{ fontSize: 10, color: "var(--indigo-600)", fontWeight: 600 }}>
            +{card.delta} {t.plannedShort}
          </span>
        )}
      </div>
    </div>
  );
}
