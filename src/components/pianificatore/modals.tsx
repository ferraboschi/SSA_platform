"use client";

import { useId, useState, type CSSProperties } from "react";
import { Avatar, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { CITIES, type CourseTypeKey, type DeliveryMode } from "@/lib/domain";
import {
  TYPE_COLORS,
  TODAY,
  MONTHS,
  fmtDayFull,
  genDates,
  parseYmd,
  shopifyUrl,
  ymd,
  type PlannerEducator,
  type PlannerItem,
  type WindowMonth,
} from "@/lib/pianificatore";
import type { AddAt } from "./types";

const plOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 37, 64, 0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const plDialog: CSSProperties = {
  background: "var(--surface)",
  borderRadius: 12,
  boxShadow: "var(--sh-popover)",
  width: "100%",
  display: "flex",
  flexDirection: "column",
};
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
  const token = "plan-" + useId().replace(/[^a-z0-9]/gi, "");
  const link = `https://corsi.sakesommelierassociation.it/share/${token}?view=pianificatore`;
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
