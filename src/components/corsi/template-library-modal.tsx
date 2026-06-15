"use client";

import { useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { TemplateData } from "@/lib/corsi";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey } from "@/lib/domain";

const TEMPLATE_TYPE_KEYS = (Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((key) => ({
  key,
  label: COURSE_TYPES[key].label,
}));

const fmtIt = (n: number) => n.toLocaleString("it-IT");

export function TemplateLibraryModal({
  templates,
  courseType,
  onClose,
  onApply,
  onDelete,
}: {
  templates: TemplateData[];
  courseType: string;
  onClose: () => void;
  onApply: (t: TemplateData) => void;
  onDelete: (id: string) => void;
}) {
  const tr = useT();
  const t = tr.corsi.templateModal;
  const [filter, setFilter] = useState<string>(courseType || "");
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = filter ? templates.filter((tp) => tp.type === filter) : templates;

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-dialog"
        style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "var(--sh-popover)", width: "100%", maxWidth: 920, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {t.eyebrow}
            </div>
            <h2 className="h1" style={{ fontSize: 20 }}>
              {t.title}
            </h2>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span className="eyebrow">{t.filterByType}</span>
            <button className={`pill ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>
              {t.all}
            </button>
            {TEMPLATE_TYPE_KEYS.map((ty) => (
              <button key={ty.key} className={`pill ${filter === ty.key ? "on" : ""}`} onClick={() => setFilter(ty.key)}>
                {ty.key === courseType && "● "}
                {ty.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-3)" }}>
              {t.emptyForType}{" "}
              <a className="link" href="/template-materiali">
                {t.createIn}
              </a>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {filtered.map((tp) => (
              <TemplateCard
                key={tp.id}
                template={tp}
                matchType={tp.type === courseType}
                expanded={editing === tp.id}
                onToggle={() => setEditing(editing === tp.id ? null : tp.id)}
                onApply={() => onApply(tp)}
                onDelete={() => {
                  if (window.confirm(format(t.deleteConfirm, { name: tp.name }))) onDelete(tp.id);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TemplateCard({
  template: tp,
  matchType,
  expanded,
  onToggle,
  onApply,
  onDelete,
}: {
  template: TemplateData;
  matchType: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApply: () => void;
  onDelete: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.templateModal;
  const totalSakes = tp.days.reduce((s, d) => s + d.sakes.length, 0);
  const totalCost = tp.days.reduce((s, d) => s + d.sakes.reduce((ss, sk) => ss + sk.cost * sk.qty, 0), 0);
  return (
    <div
      className="card"
      style={{
        border: matchType ? "1px solid var(--indigo)" : "1px solid var(--border)",
        boxShadow: matchType ? "var(--sh-2)" : "var(--sh-card)",
      }}
    >
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Badge tone={tp.typeColor === "oro" ? "oro" : "azzurro"}>{tp.typeLabel}</Badge>
              {matchType && (
                <Badge tone="indigo" dot>
                  {t.recommended}
                </Badge>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{tp.name}</div>
            {tp.description && (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>{tp.description}</div>
            )}
          </div>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onDelete} title={t.deleteTip}>
            <Icon name="trash" size={12} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {tp.days.length}
            </strong>{" "}
            {tp.days.length === 1 ? t.dayOne : t.dayMany}
          </span>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {totalSakes}
            </strong>{" "}
            {t.sake}
          </span>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {fmtIt(totalCost)}
            </strong>
            € {t.cost}
          </span>
        </div>

        {tp.lastUsed && (
          <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 8 }}>
            {format(t.lastUsed, { date: tp.lastUsed, n: tp.uses, by: tp.createdBy })}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onToggle} style={{ flex: 1 }}>
          {expanded ? t.hide : t.preview}
        </button>
        <button className="btn btn-sm btn-primary" onClick={onApply} style={{ flex: 1 }}>
          {t.apply}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface)" }}>
          {tp.days.map((d, di) => (
            <div key={di} style={{ marginBottom: di < tp.days.length - 1 ? 10 : 0 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {format(t.dayName, { n: d.day, name: d.name })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {d.sakes.map((s, si) => (
                  <div key={si} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-2)", padding: "3px 0" }}>
                    <span>
                      {s.name}{" "}
                      <span className="text-4 mono" style={{ fontSize: 10 }}>
                        · {s.code}
                      </span>
                    </span>
                    <span className="num" style={{ color: "var(--text-3)" }}>
                      {s.cost}€×{s.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
