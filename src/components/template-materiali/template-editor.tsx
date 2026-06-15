"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { fetchSakeCatalog } from "@/lib/integrations/sakecompany/actions";
import {
  SakeProductPicker,
  StockBadge,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import {
  COURSE_TYPES,
  COST_RATES,
  defaultMaterialCosts,
  type CourseTypeKey,
  type MaterialDay,
  type MaterialExtra,
  type MaterialTemplate,
  type Sake,
} from "@/lib/domain";

function dayUnit(n: number, t: { dayOne: string; dayMany: string }) {
  return n === 1 ? t.dayOne : t.dayMany;
}
function dayUnitFem(n: number, t: { dayOneFem: string; dayManyFem: string }) {
  return n === 1 ? t.dayOneFem : t.dayManyFem;
}

export function SummaryLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "5px 0",
        borderBottom: last ? "none" : "1px dashed var(--border-2)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

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

export function SakeField({
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

export function TemplateSakeRow({
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
            {((catItem?.cost ?? s.cost) || 0).toLocaleString("it-IT")}€
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
            {d.sakes.length} {tm.card.sake} · {cost.toLocaleString("it-IT")} €
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

export function TemplateEditor({
  template: t,
  onChange,
  onBack,
  onFlash,
}: {
  template: MaterialTemplate;
  onChange: (next: MaterialTemplate) => void;
  onBack: () => void;
  onFlash: (msg: string) => void;
}) {
  const tm = useT().templateMateriali;
  const ed = tm.editor;
  const totalSakes = t.days.reduce((s, d) => s + d.sakes.length, 0);

  // Simulated enrollee count → drives the cost automatisms (materials per
  // student, bottles = ceil(students / 15)).
  const [simStudents, setSimStudents] = useState(15);
  // Live Sake Company catalog (by SKU) → shows real photo/stock on each sake row.
  // MUST be declared before any reduce() that reads catBySku — those callbacks
  // run synchronously during render, so referencing it earlier hits the TDZ
  // (ReferenceError: Cannot access 'catBySku' before initialization) and crashes
  // the editor whenever a day has at least one sake.
  const [catBySku, setCatBySku] = useState<Map<string, ScCatalogItem>>(new Map());
  useEffect(() => {
    let alive = true;
    fetchSakeCatalog().then((c) => {
      if (alive)
        setCatBySku(
          new Map(c.filter((i) => i.sku).map((i) => [i.sku as string, i])),
        );
    });
    return () => {
      alive = false;
    };
  }, []);

  // Sake cost inherited LIVE from the catalog (by SKU), fallback to stored.
  const sakeCost = t.days.reduce(
    (s, d) => s + d.sakes.reduce((ss, sk) => ss + (((sk.code && catBySku.get(sk.code)?.cost) || sk.cost || 0) * sk.qty), 0),
    0,
  );

  const setField = (patch: Partial<MaterialTemplate>) => onChange({ ...t, ...patch });
  const setDays = (days: MaterialDay[]) => onChange({ ...t, days });

  // Changing the course type re-applies the type-based diploma/libro rates
  // (115/9 certificato · 60/8 introduttivo), keeping everything else.
  const setType = (type: CourseTypeKey) => {
    const def = defaultMaterialCosts(type);
    onChange({
      ...t,
      type,
      materiali: {
        ...t.materiali,
        diplomaPerStudent: def.diplomaPerStudent,
        libroPerStudent: def.libroPerStudent,
      },
    });
  };

  const addDay = () => {
    const n = t.days.length + 1;
    setDays([...t.days, { day: n, name: format(tm.newDayName, { n }), sakes: [] }]);
  };
  const removeDay = (idx: number) => {
    if (t.days.length === 1) {
      onFlash(tm.toast.mustHaveOneDay);
      return;
    }
    const days = t.days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 }));
    setDays(days);
  };
  const renameDay = (idx: number, name: string) => setDays(t.days.map((d, i) => (i === idx ? { ...d, name } : d)));

  // Add a sake by picking a real Sake Company product (code = its SKU, used to
  // look up live stock/image). Price stays 0 — it comes from a future Airtable
  // integration; qty is the base (multiplied per course enrollment elsewhere).
  const pickSake = (idx: number, item: ScCatalogItem) => {
    const sizeMatch = /(\d{3,4})\s?ml/i.exec(item.name);
    if (item.sku && t.days[idx].sakes.some((s) => s.code === item.sku)) return; // no dup
    const sake: Sake = {
      code: item.sku ?? "",
      name: item.productTitle,
      type: item.productType ?? item.variantTitle ?? "",
      sakagura: item.vendor ?? "",
      size: sizeMatch ? Number(sizeMatch[1]) : 0,
      cost: item.cost ?? 0, // real cost from the Airtable "Master product list"
      qty: 1,
      note: "",
    };
    setDays(t.days.map((d, i) => (i === idx ? { ...d, sakes: [...d.sakes, sake] } : d)));
  };
  const updateSake = (idx: number, si: number, patch: Partial<Sake>) =>
    setDays(t.days.map((d, i) => (i === idx ? { ...d, sakes: d.sakes.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : d)));
  const removeSake = (idx: number, si: number) =>
    setDays(t.days.map((d, i) => (i === idx ? { ...d, sakes: d.sakes.filter((_, j) => j !== si) } : d)));

  const setMateriali = (patch: Partial<MaterialTemplate["materiali"]>) =>
    onChange({ ...t, materiali: { ...t.materiali, ...patch } });

  const extra = t.materiali.extra || [];
  const setExtra = (next: MaterialExtra[]) => onChange({ ...t, materiali: { ...t.materiali, extra: next } });
  const addExtraCost = (per: "iscritto" | "corso" = "iscritto") =>
    setExtra([...extra, { id: "x-" + Date.now(), label: ed.newCostLabel, value: 0, per }]);
  const updateExtraCost = (id: string, patch: Partial<MaterialExtra>) =>
    setExtra(extra.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeExtraCost = (id: string) => setExtra(extra.filter((c) => c.id !== id));

  const extraPerStudent = extra.filter((c) => c.per === "iscritto").reduce((s, c) => s + (c.value || 0), 0);
  const extraPerCourse = extra.filter((c) => c.per === "corso").reduce((s, c) => s + (c.value || 0), 0);
  const materialiPerStudent =
    (t.materiali.diplomaPerStudent || 0) + (t.materiali.libroPerStudent || 0) + extraPerStudent;

  // The standard per-course categories (location, food, cocktail, accommodation,
  // transport, ADV) are COURSE-specific and live in the course's Programma &
  // economia — NOT in the template. Only operator-added fixed extras count here.
  const perCourseTotal = extraPerCourse;

  const reorderSake = (idx: number, from: number, to: number) =>
    setDays(
      t.days.map((d, i) => {
        if (i !== idx) return d;
        if (to < 0 || to >= d.sakes.length || from === to) return d;
        const sakes = [...d.sakes];
        const [moved] = sakes.splice(from, 1);
        sakes.splice(to, 0, moved);
        return { ...d, sakes };
      }),
    );

  const educatorTotal = t.materiali.educatorPerDay * t.days.length;
  const gestioneTotal = (t.materiali.gestionePerDay || 0) * t.days.length;
  const perDayTotal = educatorTotal + gestioneTotal;

  // Cost automatisms driven by the simulated enrollee count.
  const N = Math.max(0, simStudents);
  const bottlesPerSku = Math.ceil(N / 15) || (N > 0 ? 1 : 0);
  const totalBottles = totalSakes * bottlesPerSku;
  const bottleCost = t.days.reduce(
    (s, d) =>
      s +
      d.sakes.reduce((ss, sk) => {
        const liveCost = (sk.code && catBySku.get(sk.code)?.cost) || sk.cost;
        return ss + bottlesPerSku * liveCost;
      }, 0),
    0,
  );
  const materialiCourse = materialiPerStudent * N + perCourseTotal;
  const courseTotal = perDayTotal + materialiCourse + bottleCost;
  const costPerPerson = N > 0 ? Math.round(courseTotal / N) : 0;
  // Reference price comes from the course type (Shopify list price) — not asked.
  // NB: the REAL course P/L accounts for discounts and free participants (net),
  // so this is a gross projection, not a simple price × N on the real course.
  const typePrice = COURSE_TYPES[t.type]?.price ?? 0;
  const revenue = typePrice * N;
  const margin = revenue - courseTotal;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
  // Per-iscritto (variable) vs fixed split for the two cost sections.
  const variableExtra = extra.filter((c) => c.per === "iscritto");
  const fixedExtra = extra.filter((c) => c.per === "corso");
  const variablePerStudentTotal = materialiPerStudent; // diploma+libro+extra/iscritto
  const fixedTotal = perDayTotal + perCourseTotal; // educator/gestione (×days) + per-course

  return (
    <>
      <button className="btn btn-sm btn-ghost" style={{ marginBottom: 14 }} onClick={onBack}>
        <Icon name="arrow-l" size={12} />
        {ed.backAll}
      </button>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {ed.templateWord}
            </div>
            <input
              className="input"
              value={t.name}
              onChange={(e) => setField({ name: e.target.value })}
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", height: 44, padding: "0 10px", marginLeft: -10, marginBottom: 10 }}
            />
            <textarea
              className="textarea"
              rows={2}
              placeholder={ed.descPlaceholder}
              value={t.description}
              onChange={(e) => setField({ description: e.target.value })}
              style={{ fontSize: 12.5 }}
            />
          </div>
          <div style={{ width: 200 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <div className="field-label">{ed.courseType}</div>
              <select className="select" value={t.type} onChange={(e) => setType(e.target.value as CourseTypeKey)}>
                {(Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((k) => (
                  <option key={k} value={k}>
                    {COURSE_TYPES[k].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="card" style={{ padding: "10px 14px", boxShadow: "none", border: "1px solid var(--indigo-100)", background: "var(--indigo-50)" }}>
              <div style={{ fontSize: 11, color: "var(--indigo-600)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>
                {ed.durationLabel}
              </div>
              <div className="num" style={{ fontSize: 26, fontWeight: 600, color: "var(--indigo-600)", lineHeight: 1.1 }}>
                {t.days.length} {dayUnit(t.days.length, tm)}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
                {format(ed.durationNote, { n: t.days.length, unit: dayUnitFem(t.days.length, tm) })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Riassunto economico (in alto, tutto su una riga allineata) ───── */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 110 }}>
            <div className="field-label" style={{ marginBottom: 4 }}>Num iscritti</div>
            <input
              type="number"
              className="input"
              min={0}
              value={simStudents}
              onChange={(e) => setSimStudents(Math.max(0, Number(e.target.value) || 0))}
              style={{ height: 34 }}
            />
          </div>
          <SumKpi label="Prezzo / persona" value={`${typePrice.toLocaleString("it-IT")} €`} sub="da Shopify (tipo corso)" />
          <SumKpi label="Costo totale" value={`${courseTotal.toLocaleString("it-IT")} €`} sub={`di cui sake ${bottleCost.toLocaleString("it-IT")} €`} />
          <SumKpi label="Costo / persona" value={`${costPerPerson.toLocaleString("it-IT")} €`} />
          <SumKpi
            label="P/L corso (stima)"
            value={`${margin >= 0 ? "+" : ""}${margin.toLocaleString("it-IT")} €`}
            sub={`${marginPct}% su ricavi`}
            tone={margin >= 0 ? "ok" : "bad"}
          />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="info" size={11} />
          Stima lorda. Il P/L reale del corso tiene conto di sconti e partecipanti gratuiti (incasso netto).
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
            <div>
              <div className="eyebrow">{ed.daysAndSake}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                {t.days.length} {dayUnit(t.days.length, tm)} · {totalSakes} {tm.card.sake} · {ed.summaryCost}{" "}
                <strong className="num">{sakeCost.toLocaleString("it-IT")} €</strong>
              </div>
            </div>
            <button className="btn btn-sm btn-primary" onClick={addDay}>
              <Icon name="plus" size={12} />
              {ed.addDay}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {t.days.map((d, idx) => (
              <DayCard
                key={idx}
                day={d}
                catBySku={catBySku}
                canRemove={t.days.length > 1}
                onRename={(name) => renameDay(idx, name)}
                onRemoveDay={() => removeDay(idx)}
                onPickSake={(item) => pickSake(idx, item)}
                onUpdateSake={(si, patch) => updateSake(idx, si, patch)}
                onRemoveSake={(si) => removeSake(idx, si)}
                onReorderSake={(from, to) => reorderSake(idx, from, to)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {ed.materialiTitle}
          </div>
          <div className="card card-pad">
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>{ed.materialiIntro}</div>

            {/* ── DIPLOMI E LIBRI DI TESTO — per iscritto (× iscritti) ── */}
            <CostGroupLabel text="Diplomi e libri di testo · per iscritto (× iscritti)" />
            <MaterialeRow
              icon="tag"
              label="Diplomi SSA"
              hint={`Introduttivo ${COST_RATES.diploma.introduttivo} € · Certificato/Shochu ${COST_RATES.diploma.certificato} € — applicato in automatico al tipo corso`}
              value={t.materiali.diplomaPerStudent}
              suffix={ed.perStudentSuffix}
              onChange={(v) => setMateriali({ diplomaPerStudent: v })}
            />
            <MaterialeRow
              icon="book"
              label="Libri di testo"
              hint={`Introduttivo ${COST_RATES.libro.introduttivo} € · Certificato/Shochu ${COST_RATES.libro.certificato} € — applicato in automatico al tipo corso`}
              value={t.materiali.libroPerStudent}
              suffix={ed.perStudentSuffix}
              last={variableExtra.length === 0}
              onChange={(v) => setMateriali({ libroPerStudent: v })}
            />
            {variableExtra.map((c, i) => (
              <ExtraCostRow
                key={c.id}
                cost={c}
                last={i === variableExtra.length - 1}
                onChange={(patch) => updateExtraCost(c.id, patch)}
                onRemove={() => removeExtraCost(c.id)}
              />
            ))}
            <div style={{ fontSize: 11, color: "var(--text-3)", padding: "4px 2px 6px" }}>
              <Icon name="info" size={11} style={{ marginRight: 5, verticalAlign: "-1px" }} />
              + il <strong>sake</strong> (auto): {bottleCost.toLocaleString("it-IT")} € su {N} iscritti
            </div>
            <button className="btn btn-sm" style={{ width: "100%", marginTop: 6 }} onClick={() => addExtraCost("iscritto")}>
              <Icon name="plus" size={12} />
              Aggiungi costo variabile
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
              <span className="text-3">Subtotale variabile</span>
              <strong className="num">{variablePerStudentTotal.toLocaleString("it-IT")} €/iscritto · {(variablePerStudentTotal * N + bottleCost).toLocaleString("it-IT")} € totali</strong>
            </div>

            {/* ── EDUCATOR E GESTIONE SSA — per giornata ── */}
            <div style={{ marginTop: 18 }}>
              <CostGroupLabel text="Educator e gestione SSA · per giornata" />
            </div>
            <MaterialeRow
              icon="graduation"
              label="Educator a giornata"
              hint={format(ed.matEducatorHint, {
                days: t.days.length,
                unit: dayUnit(t.days.length, tm),
                total: educatorTotal.toLocaleString("it-IT"),
              })}
              value={t.materiali.educatorPerDay}
              suffix={ed.perDaySuffix}
              onChange={(v) => setMateriali({ educatorPerDay: v })}
            />
            <MaterialeRow
              icon="settings"
              label="Gestione SSA a giornata"
              hint={format(ed.matGestioneHint, {
                days: t.days.length,
                unit: dayUnit(t.days.length, tm),
                total: gestioneTotal.toLocaleString("it-IT"),
              })}
              value={t.materiali.gestionePerDay}
              suffix={ed.perDaySuffix}
              onChange={(v) => setMateriali({ gestionePerDay: v })}
            />
            <div style={{ fontSize: 11, color: "var(--text-4)", padding: "6px 2px 2px", lineHeight: 1.5 }}>
              <Icon name="info" size={11} style={{ marginRight: 5, verticalAlign: "-1px" }} />
              Location, food pairing, cocktail, alloggio, trasferte e ADV sono <strong>specifici di ogni corso</strong>:
              si impostano nella sezione <strong>Programma &amp; economia</strong> del corso, non qui nel template.
            </div>
            {fixedExtra.map((c, i) => (
              <ExtraCostRow
                key={c.id}
                cost={c}
                last={i === fixedExtra.length - 1}
                onChange={(patch) => updateExtraCost(c.id, patch)}
                onRemove={() => removeExtraCost(c.id)}
              />
            ))}
            <button className="btn btn-sm" style={{ width: "100%", marginTop: 6 }} onClick={() => addExtraCost("corso")}>
              <Icon name="plus" size={12} />
              Aggiungi costo fisso
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
              <span className="text-3">Subtotale fisso</span>
              <strong className="num">{fixedTotal.toLocaleString("it-IT")} €</strong>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 11.5,
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={12} style={{ color: "var(--success-fg)" }} />
            Salvataggio automatico — ogni modifica viene salvata.
          </div>
        </div>
      </div>
    </>
  );
}
