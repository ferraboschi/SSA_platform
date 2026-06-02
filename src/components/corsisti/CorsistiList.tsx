"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Icon, KPI } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { Corsista, ExamResultStatus } from "@/lib/domain";

type Source = "tutti" | "attuali" | "storici" | "ripartecipanti";

export interface CorsistiStats {
  total: number;
  returning: number;
  historical: number;
  passed: number;
}

export function CorsistiList({ items, stats }: { items: Corsista[]; stats: CorsistiStats }) {
  const t = useT().corsisti.list;
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("tutti");
  const [examFilter, setExamFilter] = useState<ExamResultStatus | "">("");
  const [visible, setVisible] = useState(60);
  const [showSE, setShowSE] = useState(false);

  const seCount = useMemo(
    () => items.filter((s) => s.cluster === "sake_experience").length,
    [items],
  );

  // The KPIs must reflect the SAME set the table shows under the SE toggle —
  // otherwise "Totale corsisti" overcounts the visible rows by the hidden
  // Sake-Experience cluster (~834).
  const base = useMemo(
    () => (showSE ? items : items.filter((s) => s.cluster !== "sake_experience")),
    [items, showSE],
  );
  const liveStats = useMemo(
    () => ({
      total: base.length,
      returning: base.filter((s) => s.isReturning).length,
      historical: base.filter((s) => s.historical).length,
      passed: base.filter((s) => s.courses.some((c) => c.examResult === "passed")).length,
    }),
    [base],
  );

  const list = useMemo(() => {
    let l = base.slice();
    if (source === "attuali") l = l.filter((s) => !s.historical);
    if (source === "storici") l = l.filter((s) => s.historical);
    if (source === "ripartecipanti") l = l.filter((s) => s.isReturning);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((s) => (s.name + s.email + s.city).toLowerCase().includes(q));
    }
    if (examFilter) l = l.filter((s) => s.courses.some((c) => c.examResult === examFilter));
    return l.sort((a, b) => b.totalSpent - a.totalSpent);
  }, [base, search, source, examFilter]);

  const segments: [Source, string][] = [
    ["tutti", t.segAll],
    ["attuali", t.segCurrent],
    ["storici", t.segHistorical],
    ["ripartecipanti", t.segReturning],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">
            {format(t.sub, { total: liveStats.total, returning: liveStats.returning, passed: liveStats.passed })}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="download" size={13} />
            {t.exportCsv}
          </button>
        </div>
      </div>

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <KPI anim label={t.kpiTotal} value={liveStats.total} sub={t.kpiTotalSub} />
        <KPI anim label={t.kpiCurrent} value={liveStats.total - liveStats.historical} sub={t.kpiCurrentSub} />
        <KPI
          anim
          label={t.kpiReturning}
          value={liveStats.returning}
          sub={liveStats.total ? Math.round((liveStats.returning / liveStats.total) * 100) + "%" : "—"}
          accent="oro"
        />
        <KPI anim label={t.kpiCertified} value={liveStats.passed} sub={t.kpiCertifiedSub} accent="green" />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 320px" }}>
          <Icon name="search" size={14} className="topbar-search-icon" />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented">
          {segments.map(([k, l]) => (
            <button key={k} className={source === k ? "on" : ""} onClick={() => setSource(k)}>
              {l}
            </button>
          ))}
        </div>
        <select
          className="select"
          style={{ width: "auto" }}
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value as ExamResultStatus | "")}
        >
          <option value="">{t.examAll}</option>
          <option value="passed">{t.examPassed}</option>
          <option value="retrial">{t.examRetrial}</option>
          <option value="failed">{t.examFailed}</option>
        </select>
        {seCount > 0 && (
          <button
            className={`btn btn-sm ${showSE ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowSE((v) => !v)}
            title={t.seClusterTip}
          >
            {showSE ? "✓ " : "+ "}
            {format(t.seCluster, { n: seCount })}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>
          {format(t.count, { n: list.length })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colCorsista}</th>
              <th>{t.colCitta}</th>
              <th>{t.colStoria}</th>
              <th>{t.colEsito}</th>
              <th style={{ textAlign: "right" }}>{t.colSpeso}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, visible).map((s) => {
              const lastCourse = s.courses[s.courses.length - 1];
              const certificate = s.courses.some((c) => c.examResult === "passed");
              const retrial = s.courses.some((c) => c.examResult === "retrial");
              const failed = s.courses.some((c) => c.examResult === "failed");
              return (
                <tr
                  key={s.email}
                  className="clickable"
                  onClick={() => router.push(`/corsisti/${encodeURIComponent(s.email)}`)}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Avatar name={s.name} tone={s.historical ? "navy" : undefined} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          {s.historical && <Badge tone="neutral">{t.badgeHistorical}</Badge>}
                          {s.isReturning && !s.historical && <Badge tone="oro">{t.badgeReturning}</Badge>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                          <a
                            href={`mailto:${s.email}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-3)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            <Icon name="mail" size={11} className="text-4" />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.email}
                            </span>
                          </a>
                          <a
                            href={`tel:${(s.phone || "").replace(/\s/g, "")}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-3)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontFamily: "var(--font-mono)",
                            }}
                            title={s.phone}
                          >
                            <Icon name="phone" size={11} className="text-4" />
                            {s.phone}
                            {s.hasWhatsApp && (
                              <span
                                style={{
                                  color: "var(--success-fg)",
                                  fontSize: 10,
                                  marginLeft: 2,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                              >
                                <Icon name="whatsapp" size={10} />
                                {t.whatsapp}
                              </span>
                            )}
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-3">{s.city}</td>
                  <td>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      <strong style={{ color: "var(--text)" }}>{s.courses.length}</strong>{" "}
                      {format(t.historyCourses, { year: s.firstSeen.split("-")[0] })}
                    </div>
                    {lastCourse && (
                      <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 2 }}>
                        {format(t.historyLast, {
                          title: lastCourse.courseTitle,
                          month: lastCourse.month,
                          year: lastCourse.year,
                        })}
                      </div>
                    )}
                  </td>
                  <td>
                    {certificate ? (
                      <Badge tone="success">{t.badgePassed}</Badge>
                    ) : retrial ? (
                      <Badge tone="warning">{t.badgeRetrial}</Badge>
                    ) : failed ? (
                      <Badge tone="danger">{t.badgeFailed}</Badge>
                    ) : (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {s.totalSpent.toLocaleString("it-IT")}€
                  </td>
                  <td>
                    <Icon name="chevron" size={13} className="text-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > visible && (
        <div style={{ padding: 14, textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
          {format(t.showingMore, { shown: Math.min(visible, list.length), n: list.length })}{" "}
          <button className="link" onClick={() => setVisible((v) => v + 200)}>
            {t.loadMore}
          </button>
          {list.length - visible > 200 && (
            <>
              {" · "}
              <button className="link" onClick={() => setVisible(list.length)}>
                {t.loadAll ?? "mostra tutti"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
