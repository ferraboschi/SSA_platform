"use client";

import { useMemo, useState } from "react";
import { Badge, Icon, KPI, type BadgeTone } from "@/components/ui";
import { useT, useLocale, format } from "@/lib/i18n";
import { monthIndexIt, type ReportCourse } from "@/lib/dashboard";
import type { CourseLifecycle } from "@/lib/domain";

function lifeTone(lc: CourseLifecycle): BadgeTone {
  if (lc === "passato") return "success";
  if (lc === "bozza") return "neutral";
  if (lc === "archiviato") return "danger";
  return "azzurro";
}

export function MonthlyReportModal({
  courses,
  onClose,
}: {
  courses: ReportCourse[];
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const m = t.dashboard.monthReportModal;

  const lifeLabel = (lc: CourseLifecycle): string => {
    if (lc === "passato") return m.lifeConcluso;
    if (lc === "pubblicato") return m.lifeAttivo;
    if (lc === "bozza") return m.lifeBozza;
    if (lc === "archiviato") return m.lifeAnnullato;
    return lc;
  };

  const periods = useMemo(() => {
    const map = new Map<string, { year: number; mIdx: number }>();
    courses.forEach((c) => {
      const mIdx = monthIndexIt(c.monthKey);
      if (mIdx < 0) return; // skip courses with an unparseable month
      const k = `${c.year}-${mIdx}`;
      if (!map.has(k)) map.set(k, { year: c.year, mIdx });
    });
    return [...map.values()].sort((a, b) => b.year - a.year || b.mIdx - a.mIdx);
  }, [courses]);

  const withPast =
    periods.find((p) =>
      courses.some(
        (c) => c.year === p.year && monthIndexIt(c.monthKey) === p.mIdx && c.lifecycle === "passato",
      ),
    ) || periods[0];

  const [key, setKey] = useState(`${withPast.year}-${withPast.mIdx}`);
  const [yy, mm] = key.split("-").map(Number);

  const inMonth = courses
    .filter((c) => c.year === yy && monthIndexIt(c.monthKey) === mm)
    .sort((a, b) => (a.day || 0) - (b.day || 0));
  const svolti = inMonth.filter((c) => c.lifecycle === "passato");
  const exam = svolti.reduce(
    (a, c) => {
      if (c.examResults) {
        a.p += c.examResults.passed;
        a.t += c.examResults.passed + c.examResults.retrial + c.examResults.failed;
      }
      return a;
    },
    { p: 0, t: 0 },
  );
  const passPct = exam.t ? Math.round((exam.p / exam.t) * 100) : null;
  const econ = svolti.reduce((s, c) => s + c.margin, 0);
  const ricaviSvolti = svolti.reduce((s, c) => s + c.revenue, 0);
  const educators = [...new Set(inMonth.map((c) => c.educatorName).filter(Boolean))] as string[];
  const iscritti = inMonth.reduce((s, c) => s + c.enrolled, 0);
  const cities = [...new Set(inMonth.map((c) => c.city))];

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
          maxWidth: 860,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              {m.eyebrow}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>
              {new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, mm, 1))} {yy}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              className="select"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              style={{ width: "auto", minWidth: 150, textTransform: "capitalize" }}
            >
              {periods.map((p) => {
                const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(
                  new Date(2000, p.mIdx, 1),
                );
                return (
                  <option key={`${p.year}-${p.mIdx}`} value={`${p.year}-${p.mIdx}`}>
                    {label} {p.year}
                  </option>
                );
              })}
            </select>
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div className="kpi-grid cols-3" style={{ marginBottom: 16 }}>
            <KPI label={m.newCourses} value={inMonth.length} sub={m.newCoursesSub} accent="indigo" />
            <KPI
              label={m.coursesHeld}
              value={svolti.length}
              sub={svolti.length === inMonth.length ? m.allDone : m.doneInMonth}
            />
            <KPI
              label={m.passPct}
              value={passPct === null ? "—" : passPct}
              unit={passPct === null ? "" : "%"}
              sub={exam.t ? format(m.examsLine, { p: exam.p, t: exam.t }) : m.noExams}
              accent="green"
            />
            <KPI
              label={m.economy}
              value={(econ >= 0 ? "+" : "") + Math.round(econ / 1000)}
              unit="k €"
              sub={econ >= 0 ? m.netGain : m.netLoss}
              accent={econ >= 0 ? "green" : "danger"}
            />
            <KPI
              label={m.educatorsInvolved}
              value={educators.length}
              sub={educators.slice(0, 3).join(", ") || "—"}
              accent="oro"
            />
            <KPI
              label={m.totalEnrolled}
              value={iscritti}
              sub={format(m.citiesRevenue, {
                cities: cities.length,
                revenue: (ricaviSvolti / 1000).toFixed(1),
              })}
            />
          </div>

          {inMonth.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-3)",
                border: "1px dashed var(--border)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {m.noCourses}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{m.thDate}</th>
                    <th>{m.thCourse}</th>
                    <th>{m.thEducator}</th>
                    <th>{m.thCity}</th>
                    <th style={{ textAlign: "center" }}>{m.thEnrolled}</th>
                    <th>{m.thResult}</th>
                    <th>{m.thStatus}</th>
                    <th style={{ textAlign: "right" }}>{m.thMargin}</th>
                  </tr>
                </thead>
                <tbody>
                  {inMonth.map((c) => {
                    const cIdx = monthIndexIt(c.monthKey);
                    const monthShort =
                      cIdx >= 0
                        ? new Intl.DateTimeFormat(locale, { month: "short" })
                            .format(new Date(2000, cIdx, 1))
                            .replace(".", "")
                        : "—";
                    return (
                      <tr key={c.id}>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          <strong>{c.day}</strong> {monthShort}
                        </td>
                        <td>
                          <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
                          <span style={{ marginLeft: 8, fontWeight: 500 }}>{c.shortTitle}</span>
                        </td>
                        <td className="text-3">{c.educatorName ?? "—"}</td>
                        <td className="text-3">{c.city}</td>
                        <td className="num" style={{ textAlign: "center" }}>
                          {c.enrolled}/{c.capacity}
                        </td>
                        <td>
                          {c.examResults ? (
                            <span className="mono" style={{ fontSize: 11.5 }}>
                              <span style={{ color: "var(--success-fg)" }}>{c.examResults.passed}P</span>·
                              {c.examResults.retrial}R·
                              <span style={{ color: "var(--danger-fg)" }}>{c.examResults.failed}B</span>
                            </span>
                          ) : (
                            <span className="text-mute">—</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={lifeTone(c.lifecycle)}>{lifeLabel(c.lifecycle)}</Badge>
                        </td>
                        <td
                          className="num"
                          style={{
                            textAlign: "right",
                            color: c.margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)",
                            fontWeight: 600,
                          }}
                        >
                          {c.margin >= 0 ? "+" : ""}
                          {c.margin.toLocaleString(locale)} €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-4)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="info" size={11} />
            {m.footerNote}
          </span>
          <button className="btn btn-sm" onClick={() => window.print()}>
            <Icon name="download" size={12} />
            {m.exportPdf}
          </button>
        </div>
      </div>
    </div>
  );
}
