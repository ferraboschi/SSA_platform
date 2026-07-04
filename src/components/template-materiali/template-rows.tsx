"use client";

import { useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import {
  SakeProductPicker,
  StockBadge,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import type { MaterialDay, MaterialExtra, Sake } from "@/lib/domain";

export function SumKpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "var(--success-fg)" : tone === "bad" ? "var(--danger-fg)" : "var(--text)";
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export function CostGroupLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "var(--ls-caps)",
        textTransform: "uppercase",
        color: "var(--text-4)",
        marginTop: 14,
        marginBottom: 2,
      }}
    >
      {text}
    </div>
  );
}

export function MaterialeRow({
  icon,
  label,
  hint,
  value,
  onChange,
  last,
  suffix,
}: {
  icon: IconName;
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  last?: boolean;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--surface-2)", color: "var(--text-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{hint}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <div style={{ position: "relative", width: 96 }}>
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 12, pointerEvents: "none" }}>€</span>
          <input
            type="number"
            className="input"
            value={value}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            style={{ paddingLeft: 20, height: 30, fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right", fontWeight: 600 }}
          />
        </div>
        {suffix && <span style={{ fontSize: 9.5, color: "var(--text-4)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function ExtraCostRow({
  cost: c,
  last,
  onChange,
  onRemove,
}: {
  cost: MaterialExtra;
  last?: boolean;
  onChange: (patch: Partial<MaterialExtra>) => void;
  onRemove: () => void;
}) {
  const ed = useT().templateMateriali.editor;
  const pers: { key: MaterialExtra["per"]; label: string }[] = [
    { key: "iscritto", label: ed.perIscritto },
    { key: "corso", label: ed.perCorso },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border-2)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--indigo-50)", color: "var(--indigo-600)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="tag" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          className="input"
          value={c.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={ed.costNamePlaceholder}
          style={{ height: 28, fontSize: 13, fontWeight: 500, marginBottom: 5 }}
        />
        <div style={{ display: "inline-flex", gap: 4 }}>
          {pers.map((p) => (
            <button
              key={p.key}
              onClick={() => onChange({ per: p.key })}
              className={`pill ${c.per === p.key ? "on" : ""}`}
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", width: 84 }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 12, pointerEvents: "none" }}>€</span>
        <input
          type="number"
          className="input"
          value={c.value}
          onChange={(e) => onChange({ value: Number(e.target.value) || 0 })}
          style={{ paddingLeft: 20, height: 30, fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right", fontWeight: 600 }}
        />
      </div>
      <button className="btn btn-icon btn-sm btn-ghost" title={ed.addCost} onClick={onRemove}>
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function SakeField({
  label,
  value,
  onChange,
  type,
  mono,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500, marginBottom: 3 }}>{label}</div>
      <input
        className="input"
        type={type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 30, fontSize: 12.5, fontFamily: mono ? "var(--font-mono)" : undefined }}
      />
    </div>
  );
}

function TemplateSakeRow({
  sake: s,
  catItem,
  isLast,
  isOver,
  onUpdate,
  onRemove,
  onDragStartRow,
  onDragEnterRow,
  onDropRow,
  onDragEndRow,
}: {
  sake: Sake;
  catItem?: ScCatalogItem;
  isLast: boolean;
  isOver: boolean;
  onUpdate: (patch: Partial<Sake>) => void;
  onRemove: () => void;
  onDragStartRow: () => void;
  onDragEnterRow: () => void;
  onDropRow: () => void;
  onDragEndRow: () => void;
}) {
  const sk = useT().templateMateriali.sake;
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnterRow}
      onDrop={(e) => {
        e.preventDefault();
        onDropRow();
      }}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-2)",
        borderTop: isOver ? "2px solid var(--indigo)" : "2px solid transparent",
        opacity: dragging ? 0.4 : 1,
        background: isOver ? "var(--indigo-50)" : "transparent",
        transition: "background var(--dur-fast)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "22px 40px 1fr auto auto auto", gap: 10, alignItems: "center", padding: "10px 16px" }}>
        <div
          draggable
          onDragStart={(e) => {
            setDragging(true);
            onDragStartRow();
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragging(false);
            onDragEndRow();
          }}
          title={sk.dragTitle}
          style={{ cursor: "grab", color: "var(--text-mute)", display: "grid", placeItems: "center", width: 22, height: 28, borderRadius: 4 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.setProperty("background", "var(--surface-2)");
            e.currentTarget.style.setProperty("color", "var(--text-3)");
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.setProperty("background", "transparent");
            e.currentTarget.style.setProperty("color", "var(--text-mute)");
          }}
        >
          <Icon name="grip" size={14} />
        </div>
        {catItem?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={catItem.image}
            alt={s.name}
            style={{ width: 40, height: 50, borderRadius: 3, objectFit: "cover" }}
          />
        ) : (
          <div className="ph-img" style={{ width: 40, height: 50, borderRadius: 3, fontSize: 9 }}>
            {s.code}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.name}
            </span>
            {catItem && <StockBadge stock={catItem.stock} />}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
            {s.code} · {s.size}ML
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{(s.type || catItem?.productType) ? `${s.type || catItem?.productType} · ` : ""}{s.sakagura || catItem?.vendor}</span>
            {catItem?.url && (
              <a
                href={catItem.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--indigo)", fontSize: 11 }}
              >
                <Icon name="external" size={10} /> prodotto
              </a>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 50 }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>
            {formatEuro((catItem?.cost ?? s.cost) || 0)}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>×{s.qty}</div>
        </div>
        <button
          className="btn btn-icon btn-sm btn-ghost"
          title={sk.editSake}
          onClick={() => setOpen((o) => !o)}
          style={{ color: open ? "var(--indigo)" : undefined, background: open ? "var(--indigo-50)" : undefined }}
        >
          <Icon name="edit" size={12} />
        </button>
        <button className="btn btn-icon btn-sm btn-ghost" title={sk.removeSake} onClick={onRemove}>
          <Icon name="trash" size={12} />
        </button>
      </div>

      {open && (
        <div style={{ padding: "0 16px 14px 16px", animation: "expandIn 160ms var(--ease-out)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
            <SakeField label={sk.fldNome} value={s.name} onChange={(v) => onUpdate({ name: v })} />
            <SakeField label={sk.fldCodice} value={s.code} mono onChange={(v) => onUpdate({ code: v })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <SakeField label={sk.fldTipo} value={s.type} onChange={(v) => onUpdate({ type: v })} />
            <SakeField label={sk.fldSakagura} value={s.sakagura} onChange={(v) => onUpdate({ sakagura: v })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <SakeField label={sk.fldFormato} value={s.size} type="number" onChange={(v) => onUpdate({ size: Math.round(Number(v)) || 0 })} />
            <SakeField label={sk.fldCosto} value={s.cost} type="number" onChange={(v) => onUpdate({ cost: Number(v) || 0 })} />
            <SakeField label={sk.fldQuantita} value={s.qty} type="number" onChange={(v) => onUpdate({ qty: Math.max(1, Math.round(Number(v)) || 1) })} />
          </div>
        </div>
      )}
    </div>
  );
}

export function DayCard({
  day: d,
  canRemove,
  catBySku,
  onRename,
  onRemoveDay,
  onPickSake,
  onUpdateSake,
  onRemoveSake,
  onReorderSake,
}: {
  day: MaterialDay;
  canRemove: boolean;
  catBySku: Map<string, ScCatalogItem>;
  onRename: (name: string) => void;
  onRemoveDay: () => void;
  onPickSake: (item: ScCatalogItem) => void;
  onUpdateSake: (si: number, patch: Partial<Sake>) => void;
  onRemoveSake: (si: number) => void;
  onReorderSake: (from: number, to: number) => void;
}) {
  const tm = useT().templateMateriali;
  const dy = tm.day;
  const [editingName, setEditingName] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const cost = d.sakes.reduce((s, sk) => s + ((sk.code && catBySku.get(sk.code)?.cost) || sk.cost || 0) * sk.qty, 0);

  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">{format(dy.giorno, { n: d.day })}</span>
          {editingName ? (
            <input
              className="input"
              autoFocus
              value={d.name}
              onChange={(e) => onRename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setEditingName(false);
              }}
              style={{ marginTop: 4, height: 30, fontSize: 15, fontWeight: 600 }}
            />
          ) : (
            <div
              className="h3"
              style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              onClick={() => setEditingName(true)}
            >
              {d.name}
              <Icon name="edit" size={12} className="text-4" />
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {d.sakes.length} {tm.card.sake} · {formatEuro(cost)}
          </span>
          {canRemove && (
            <button className="btn btn-icon btn-sm btn-ghost" title={dy.removeDay} onClick={onRemoveDay}>
              <Icon name="trash" size={12} />
            </button>
          )}
        </div>
      </div>

      <div>
        {d.sakes.map((s, si) => (
          <TemplateSakeRow
            key={si}
            sake={s}
            catItem={s.code ? catBySku.get(s.code) : undefined}
            isLast={si === d.sakes.length - 1}
            isOver={overIdx === si}
            onUpdate={(patch) => onUpdateSake(si, patch)}
            onRemove={() => onRemoveSake(si)}
            onDragStartRow={() => {
              dragIndex.current = si;
            }}
            onDragEnterRow={() => {
              if (dragIndex.current !== null && dragIndex.current !== si) setOverIdx(si);
            }}
            onDropRow={() => {
              if (dragIndex.current !== null) onReorderSake(dragIndex.current, si);
              dragIndex.current = null;
              setOverIdx(null);
            }}
            onDragEndRow={() => {
              dragIndex.current = null;
              setOverIdx(null);
            }}
          />
        ))}
        {d.sakes.length === 0 && (
          <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>{dy.noSake}</div>
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
        <SakeProductPicker
          onPick={onPickSake}
          excludeSkus={d.sakes.map((s) => s.code)}
          placeholder={dy.addSake}
        />
      </div>
    </div>
  );
}
