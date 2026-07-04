"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { CITIES, type CourseTypeKey, type DeliveryMode } from "@/lib/domain";
import {
  TYPE_COLORS,
  TODAY,
  MONTHS,
  fmtDayFull,
  genDates,
  parseYmd,
  ymd,
  type PlannerEducator,
  type WindowMonth,
} from "@/lib/pianificatore";
import type { AddAt } from "./types";
import { plOverlay, plDialog } from "./modal-styles";

// ---------- Add modal ----------
export interface AddForm {
  type: CourseTypeKey;
  mode: DeliveryMode;
  dates: string[];
  city: string | null;
  educatorId: string | null;
  note: string;
}

export function PL_AddModal({
  at,
  win,
  types,
  typeLabels,
  educators,
  onConfirm,
  onClose,
}: {
  at: AddAt;
  win: WindowMonth[];
  types: CourseTypeKey[];
  typeLabels: Record<CourseTypeKey, string>;
  educators: PlannerEducator[];
  onConfirm: (f: AddForm) => void;
  onClose: () => void;
}) {
  const t = useT().pianificatore.addModal;
  const placed = at.mIdx !== null && at.mIdx !== undefined;
  const y0 = placed ? at.year || win.find((w) => w.mIdx === at.mIdx)?.year || win[0].year : win[0].year;
  const m0 = placed ? at.mIdx! : win[0].mIdx;
  const defStart = ymd(new Date(y0, m0, 14));
  const todayYmd = ymd(TODAY);

  const [type, setTypeState] = useState<CourseTypeKey>(at.type || "introduttivo");
  const [mode, setModeState] = useState<DeliveryMode>("presenza");
  const [start, setStartState] = useState(defStart);
  const [dates, setDates] = useState<string[]>(() =>
    genDates(defStart, at.type || "introduttivo", "presenza"),
  );
  const [city, setCity] = useState(at.city || "");
  const [educatorId, setEducatorId] = useState(at.educatorId || "");
  const [note, setNote] = useState("");

  const isQualified = (id: string, ty: CourseTypeKey) =>
    educators.find((e) => e.id === id)?.qualifications.includes(ty) ?? false;
  const eligibleEdu = educators.filter((e) => e.qualifications.includes(type));

  // Type/mode/start drive the session schedule: regenerate dates inline on
  // change (no effect) so user-editable dates reset coherently.
  const setType = (ty: CourseTypeKey) => {
    setTypeState(ty);
    setDates(genDates(start, ty, mode));
    if (educatorId && !isQualified(educatorId, ty)) setEducatorId("");
  };
  const setMode = (m: DeliveryMode) => {
    setModeState(m);
    setDates(genDates(start, type, m));
  };
  const setStart = (s: string) => {
    const clamped = s && s < todayYmd ? todayYmd : s;
    setStartState(clamped);
    setDates(genDates(clamped, type, mode));
  };

  const tc = TYPE_COLORS[type];
  const total = dates.length;
  const unitLabel = mode === "online" ? t.appointments : t.days;
  const sorted = [...dates].filter(Boolean).sort();
  const firstD = sorted.length ? parseYmd(sorted[0]) : null;
  const placeLabel = firstD ? `${MONTHS[firstD.getMonth()]} ${firstD.getFullYear()}` : t.dash;
  const valid = dates.length > 0 && dates.every(Boolean);

  const setSessionDate = (i: number, val: string) =>
    setDates((ds) =>
      ds.map((d, j) => {
        if (j !== i) return d;
        const min = i === 0 ? todayYmd : ds[i - 1];
        return val && val < min ? min : val;
      }),
    );
  const addSession = () =>
    setDates((ds) => {
      const last = ds.length ? parseYmd(ds[ds.length - 1]) : parseYmd(start);
      const step = mode === "online" ? 7 : 1;
      const d = new Date(last);
      d.setDate(last.getDate() + step);
      return [...ds, ymd(d)];
    });
  const removeSession = (i: number) => setDates((ds) => ds.filter((_, j) => j !== i));

  return (
    <div style={plOverlay} onClick={onClose}>
      <div style={{ ...plDialog, maxWidth: 540, maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              {t.eyebrow}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{t.title}</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
          <div className="field">
            <div className="field-label">{t.typeLabel}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {types.map((ty) => {
                const c = TYPE_COLORS[ty];
                const on = type === ty;
                return (
                  <button
                    key={ty}
                    onClick={() => setType(ty)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 11px",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      border: `1px solid ${on ? c.solid : "var(--border)"}`,
                      background: on ? c.soft : "var(--surface)",
                      color: on ? c.ink : "var(--text-2)",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c.solid }} />
                    {typeLabels[ty]}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "end" }}>
            <div className="field">
              <div className="field-label">{t.modeLabel}</div>
              <div className="segmented" style={{ width: "100%" }}>
                <button
                  className={mode === "presenza" ? "on" : ""}
                  onClick={() => setMode("presenza")}
                  style={{ flex: 1 }}
                >
                  <Icon name="pin" size={11} />
                  {t.inPerson}
                </button>
                <button className={mode === "online" ? "on" : ""} onClick={() => setMode("online")} style={{ flex: 1 }}>
                  <Icon name="globe" size={11} />
                  {t.online}
                </button>
              </div>
            </div>
            <div className="field">
              <div className="field-label">{t.startDate}</div>
              <input
                className="input"
                type="date"
                value={start}
                min={todayYmd}
                onChange={(e) => setStart(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="field" style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px" }}>
            <div
              className="field-label"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
            >
              <span>{t.courseDates}</span>
              <span className="num" style={{ color: "var(--text-4)", fontWeight: 500 }}>
                {total} {unitLabel} · {mode === "online" ? t.weekly : t.consecutive}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dates.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="num" style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: tc.ink, flexShrink: 0 }}>
                    {i + 1}/{total}
                  </span>
                  <input
                    className="input"
                    type="date"
                    value={d}
                    min={i === 0 ? todayYmd : dates[i - 1]}
                    onChange={(e) => setSessionDate(i, e.target.value)}
                    style={{ flex: 1, height: 32 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-3)", width: 92, flexShrink: 0 }}>
                    {d ? fmtDayFull(d) : ""}
                  </span>
                  {total > 1 && (
                    <button
                      className="btn btn-icon btn-sm btn-ghost"
                      onClick={() => removeSession(i)}
                      title={t.removeSession}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={addSession}>
              <Icon name="plus" size={11} />
              {t.addSession}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mode === "online" ? "1fr" : "1fr 1fr", gap: 12 }}>
            {mode !== "online" && (
              <div className="field">
                <div className="field-label">{t.cityLabel}</div>
                <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">{t.cityTbd}</option>
                  {CITIES.filter((c) => c !== "Online").map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <div className="field-label">
                {t.educatorLabel}{" "}
                <span style={{ color: "var(--text-4)", fontWeight: 400 }}>
                  · {format(t.eligibleHint, { type: typeLabels[type] })}
                </span>
              </div>
              <select className="select" value={educatorId} onChange={(e) => setEducatorId(e.target.value)}>
                <option value="">{t.educatorTbd}</option>
                {eligibleEdu.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {mode === "online" && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-3)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: -6,
              }}
            >
              <Icon name="globe" size={12} />
              {t.onlineNote}
            </div>
          )}

          <div className="field">
            <div className="field-label">
              {t.notesLabel} <span style={{ color: "var(--text-4)", fontWeight: 400 }}>{t.notesOpt}</span>
            </div>
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notesPlaceholder}
              style={{ width: "100%", minHeight: 56, padding: "8px 10px", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="calendar" size={12} />
            {t.placesIn} <strong style={{ color: "var(--text-2)" }}>{placeLabel}</strong>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>
              {t.cancel}
            </button>
            <button
              className="btn btn-primary"
              disabled={!valid}
              style={!valid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              onClick={() =>
                valid &&
                onConfirm({
                  type,
                  mode,
                  dates: sorted,
                  city: mode === "online" ? "Online" : city || null,
                  educatorId: educatorId || null,
                  note: note.trim(),
                })
              }
            >
              <Icon name="plus" size={12} />
              {t.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
