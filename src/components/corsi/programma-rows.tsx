"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import {
  StockBadge,
  LOW_STOCK,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import type { SakeState, CostLine } from "./ProgrammaEconomiaSection";

export function SakeRow({
  sake: s,
  dayNo,
  isLast,
  noteOpen,
  catItem,
  need,
  isDropTarget,
  onToggleNote,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  sake: SakeState;
  dayNo: number;
  isLast: boolean;
  noteOpen: boolean;
  catItem?: ScCatalogItem;
  need?: number;
  /** A dragged sake is currently hovering THIS row — show where it will land. */
  isDropTarget?: boolean;
  onToggleNote: () => void;
  onUpdate: (patch: Partial<SakeState>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.programma;
  const [dragging, setDragging] = useState(false);
  const schedaUrl = `https://www.sakecompany.com/sake/${s.code.toLowerCase()}`;
  const hasNote = !!s.note && s.note.trim().length > 0;
  // `||` (not `??`): a null/0 catalog cost must fall back to the stored cost.
  const liveCost = catItem?.cost || s.cost;
  const stock = catItem?.stock ?? null;
  // Behaviour A: a product below the stock-alert limit, used in this course,
  // gets a red outline (a "to-watch" signal — no email is sent here).
  const lowStock = stock != null && stock < LOW_STOCK;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={lowStock ? `${t.stockKo} · ${stock} pz` : undefined}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-2)",
        borderLeft: lowStock ? "3px solid var(--danger-fg, #b42318)" : "3px solid transparent",
        borderTop: isDropTarget ? "2px solid var(--indigo)" : "2px solid transparent",
        opacity: dragging ? 0.4 : 1,
        background: dragging
          ? "var(--indigo-50)"
          : isDropTarget
            ? "var(--indigo-50)"
            : lowStock
              ? "var(--danger-bg, #fde8e6)"
              : "transparent",
        transition: "background var(--dur-fast), border-color var(--dur-fast)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "22px 40px 1fr auto auto", gap: 10, alignItems: "center", padding: "10px 16px" }}>
        <div
          draggable
          onDragStart={(e) => {
            setDragging(true);
            onDragStart();
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDragging(false)}
          title={t.dragTip}
          style={{
            cursor: "grab",
            color: "var(--text-mute)",
            display: "grid",
            placeItems: "center",
            width: 22,
            height: 28,
            borderRadius: 4,
            transition: "all var(--dur-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-2)";
            e.currentTarget.style.color = "var(--text-3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-mute)";
          }}
        >
          <Icon name="grip" size={14} />
        </div>

        {catItem?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={catItem.image}
            alt=""
            style={{ width: 40, height: 50, borderRadius: 3, objectFit: "cover" }}
          />
        ) : (
          <div className="ph-img" style={{ width: 40, height: 50, borderRadius: 3, fontSize: 9 }}>
            {s.code}
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
            <a
              href={schedaUrl}
              target="_blank"
              rel="noopener"
              title={t.schedaTip}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10.5,
                color: "var(--indigo)",
                background: "var(--indigo-50)",
                fontWeight: 500,
              }}
            >
              <Icon name="external" size={9} />
              {t.sakeCompany}
            </a>
            {catItem && <StockBadge stock={stock} />}
            {catItem && need != null && stock != null && stock < need && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--danger-fg)",
                  background: "var(--danger-bg)",
                  padding: "1px 6px",
                  borderRadius: 999,
                }}
                title={t.stockSubstitute}
              >
                {t.stockKo}
              </span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
            {s.code} · {s.size}ML{dayNo ? ` · ${format(t.dayN, { n: dayNo })}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
            {s.type} · {s.sakagura}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 56 }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>
            {formatEuro(liveCost)}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>
            ×{need != null && need > 0 ? need : s.qty}
          </div>
        </div>

        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-icon btn-sm btn-ghost"
            onClick={onToggleNote}
            title={hasNote ? t.editNote : t.addNote}
            style={{
              color: hasNote ? "var(--indigo)" : undefined,
              background: hasNote ? "var(--indigo-50)" : undefined,
              position: "relative",
            }}
          >
            <Icon name="note" size={13} />
            {hasNote && (
              <span
                style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--indigo)" }}
              />
            )}
          </button>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title={t.removeSakeTip}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {noteOpen && (
        <div style={{ padding: "0 16px 14px 60px" }}>
          <textarea
            className="textarea"
            placeholder={t.notePlaceholder}
            value={s.note || ""}
            onChange={(e) => onUpdate({ note: e.target.value })}
            autoFocus
            rows={2}
            style={{ width: "100%", fontSize: 12.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, gap: 6 }}>
            {s.note && (
              <button className="btn btn-sm btn-ghost" onClick={() => onUpdate({ note: "" })}>
                {t.noteClear}
              </button>
            )}
            <button className="btn btn-sm" onClick={onToggleNote}>
              {t.noteClose}
            </button>
          </div>
        </div>
      )}
      {!noteOpen && hasNote && (
        <div
          onClick={onToggleNote}
          style={{
            margin: "0 16px 12px 60px",
            padding: "8px 10px",
            background: "var(--indigo-50)",
            border: "1px solid var(--indigo-100)",
            borderRadius: 4,
            fontSize: 11.5,
            color: "var(--text-2)",
            cursor: "pointer",
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            lineHeight: 1.4,
          }}
        >
          <Icon name="note" size={11} className="text-3" />
          <span style={{ flex: 1 }}>{s.note}</span>
          <Icon name="edit" size={11} className="text-4" />
        </div>
      )}
    </div>
  );
}

export function CostLineRow({
  line,
  locked,
  onChange,
  onRemove,
}: {
  line: CostLine;
  locked?: boolean;
  onChange?: (patch: Partial<CostLine>) => void;
  onRemove?: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.programma;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 110px 28px",
        gap: 10,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-2)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {locked ? (
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{line.label}</div>
        ) : (
          <input
            className="input"
            value={line.label}
            onChange={(e) => onChange?.({ label: e.target.value })}
            style={{
              height: 26,
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid transparent",
              background: "transparent",
              padding: "0 6px",
              marginLeft: -6,
            }}
            onFocus={(e) => {
              e.target.style.border = "1px solid var(--border)";
              e.target.style.background = "var(--surface)";
            }}
            onBlur={(e) => {
              e.target.style.border = "1px solid transparent";
              e.target.style.background = "transparent";
            }}
          />
        )}
        {line.source && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{line.source}</div>}
      </div>
      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-4)",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          €
        </span>
        <input
          type="number"
          className="input"
          style={{
            paddingLeft: 22,
            height: 28,
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            textAlign: "right",
            background: locked ? "var(--surface-2)" : "var(--surface)",
            cursor: locked ? "default" : "text",
            fontWeight: 600,
          }}
          value={line.value}
          readOnly={locked}
          onChange={(e) => onChange?.({ value: Number(e.target.value) || 0 })}
        />
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        {locked ? (
          <span title={t.calcAuto} style={{ color: "var(--text-mute)", display: "grid", placeItems: "center", width: 18, height: 18 }}>
            <Icon name="check" size={11} />
          </span>
        ) : (
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title={t.removeTip}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
