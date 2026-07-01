"use client";

import { Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { COURSE_TYPES, type CourseTypeKey, type MaterialTemplate } from "@/lib/domain";

function tmTypeTone(type: CourseTypeKey): "oro" | "azzurro" {
  return COURSE_TYPES[type].color === "oro" ? "oro" : "azzurro";
}

function tmTemplateStats(t: MaterialTemplate) {
  const totalSakes = t.days.reduce((s, d) => s + d.sakes.length, 0);
  const sakeCost = t.days.reduce((s, d) => s + d.sakes.reduce((ss, sk) => ss + (sk.cost || 0) * sk.qty, 0), 0);
  return { totalSakes, sakeCost };
}

function dayUnit(n: number, t: { dayOne: string; dayMany: string }) {
  return n === 1 ? t.dayOne : t.dayMany;
}

function Stat3({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function LibraryCard({
  template: t,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  template: MaterialTemplate;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tm = useT().templateMateriali;
  const c = tm.card;
  const { totalSakes, sakeCost } = tmTemplateStats(t);
  const materialiPerStudent = (t.materiali.diplomaPerStudent || 0) + (t.materiali.libroPerStudent || 0);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 16, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <Badge tone={tmTypeTone(t.type)}>{COURSE_TYPES[t.type].label}</Badge>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
            {t.days.length} {dayUnit(t.days.length, tm)}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{t.name}</div>
        {t.description && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.45 }}>{t.description}</div>}

        <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-2)" }}>
          <Stat3 value={t.days.length} label={dayUnit(t.days.length, tm)} />
          <Stat3 value={totalSakes} label={c.sake} />
          <Stat3 value={formatEuro(sakeCost)} label={c.sakeCost} />
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 3 }}>
          <span>
            <Icon name="graduation" size={11} className="text-4" /> {c.lblEducator}{" "}
            <strong className="num">{formatEuro(t.materiali.educatorPerDay)}</strong>
            {c.unitPerDay} · {c.lblMateriali} <strong className="num">{formatEuro(materialiPerStudent)}</strong>
            {c.unitPerStudent}
          </span>
          <span className="text-4" style={{ fontSize: 10.5 }}>
            {format(c.lastUse, { last: t.lastUsed, uses: t.uses, by: t.createdBy })}
          </span>
        </div>
      </div>
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", gap: 6 }}>
        <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={onOpen}>
          <Icon name="edit" size={11} />
          {c.openEdit}
        </button>
        <button className="btn btn-sm btn-icon" title={c.duplicate} onClick={onDuplicate}>
          <Icon name="copy" size={12} />
        </button>
        <button className="btn btn-sm btn-icon" title={c.delete} onClick={onDelete}>
          <Icon name="trash" size={12} />
        </button>
      </div>
    </div>
  );
}

export function TemplateLibrary({
  templates,
  filter,
  setFilter,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  templates: MaterialTemplate[];
  filter: CourseTypeKey | "";
  setFilter: (f: CourseTypeKey | "") => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (t: MaterialTemplate) => void;
  onDelete: (t: MaterialTemplate) => void;
}) {
  const lib = useT().templateMateriali.library;
  const list = filter ? templates.filter((t) => t.type === filter) : templates;
  const types = Object.keys(COURSE_TYPES) as CourseTypeKey[];

  return (
    <>
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{lib.eyebrow}</div>
          <h1 className="page-title">{lib.title}</h1>
          <p className="page-sub">{lib.sub}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onCreate}>
            <Icon name="plus" size={13} />
            {lib.newTemplate}
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 24,
          padding: "14px 20px",
          background: "linear-gradient(180deg, var(--indigo-50), var(--surface))",
          border: "1px solid var(--indigo-100)",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={14} className="text-2" />
          <span className="eyebrow">{lib.hwTitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-2)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="calendar" size={13} className="text-3" />
            {lib.hwStep1Pre}
            <strong>{lib.hwStep1Strong}</strong>
          </span>
          <Icon name="arrow" size={12} className="text-4" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="grid" size={13} className="text-3" />
            {lib.hwStep2Pre}
            <strong>{lib.hwStep2Strong}</strong>
          </span>
          <Icon name="arrow" size={12} className="text-4" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="book" size={13} className="text-3" />
            {lib.hwStep3Pre}
            <strong>{lib.hwStep3Strong}</strong>
            {lib.hwStep3Post}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span className="eyebrow">{lib.filterByType}</span>
        <button className={`pill ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>
          {lib.all}
        </button>
        {types.map((ty) => (
          <button key={ty} className={`pill ${filter === ty ? "on" : ""}`} onClick={() => setFilter(filter === ty ? "" : ty)}>
            {COURSE_TYPES[ty].label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {list.map((t) => (
          <LibraryCard
            key={t.id}
            template={t}
            onOpen={() => onOpen(t.id)}
            onDuplicate={() => onDuplicate(t)}
            onDelete={() => onDelete(t)}
          />
        ))}
        {list.length === 0 && (
          <div className="card card-pad" style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-3)", padding: 40 }}>
            {lib.emptyType}
            <button className="link" onClick={onCreate}>
              {lib.createFirst}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
