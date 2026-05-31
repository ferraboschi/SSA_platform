"use client";

import Link from "next/link";
import { Icon, Badge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import {
  examFamilyLabel,
  examFamilyTone,
  type ExamHubData,
  type ExamHubItem,
} from "@/lib/esami";

export function EsamiHub({ data }: { data: ExamHubData }) {
  const t = useT().esami.hub;
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
      </div>

      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <HubKPI
          label={t.kpiDaFare}
          value={data.daFare.length}
          sub={format(t.kpiDaFareSub, { n: data.studentsDaFare })}
          accent="indigo"
        />
        <HubKPI
          label={t.kpiConclusi}
          value={data.fatti.length}
          sub={format(t.kpiConclusiSub, { n: data.allResultsCount })}
        />
        <HubKPI
          label={t.kpiPassRate}
          value={`${data.passRate}%`}
          sub={t.kpiPassRateSub}
          accent="green"
        />
        <HubKPI label={t.kpiTemplate} value="2" sub={t.kpiTemplateSub} />
      </div>

      <ExamList
        title={t.listDaFareTitle}
        hint={t.listDaFareHint}
        courses={data.daFare}
        tone="indigo"
        empty={t.listDaFareEmpty}
      />
      <div style={{ height: 24 }} />
      <ExamList
        title={t.listFattiTitle}
        hint={t.listFattiHint}
        courses={data.fatti}
        tone="success"
        empty={t.listFattiEmpty}
      />
    </div>
  );
}

function HubKPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "indigo" | "green";
}) {
  return (
    <div className="kpi">
      {accent && <span className={`kpi-accent ${accent}`} />}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 26 }}>
        {value}
      </div>
      {sub && <div className="kpi-foot">{sub}</div>}
    </div>
  );
}

function ExamList({
  title,
  hint,
  courses,
  tone,
  empty,
}: {
  title: string;
  hint: string;
  courses: ExamHubItem[];
  tone: "indigo" | "success";
  empty: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 15 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tone === "success" ? "var(--success)" : "var(--indigo)",
            }}
          />
          {title}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-4)" }}>· {hint}</span>
        <span className="num" style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>
          {courses.length}
        </span>
      </div>
      {courses.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {courses.map((c) => (
            <ExamCourseRow key={c.id} course={c} done={tone === "success"} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamCourseRow({ course: c, done }: { course: ExamHubItem; done: boolean }) {
  const t = useT().esami.hub;
  const miniPct = c.miniTotal ? (c.miniDone / c.miniTotal) * 100 : 0;
  const passPct = c.resultsTotal ? Math.round((c.passed / c.resultsTotal) * 100) : 0;
  return (
    <Link
      href={`/esami/${c.id}`}
      className="card card-hover"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto",
          gap: 16,
          alignItems: "center",
          padding: "16px 20px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
            <Badge tone={examFamilyTone(c.type)}>{examFamilyLabel(c.type)}</Badge>
            {c.live && (
              <Badge tone="indigo" dot>
                {t.rowLive}
              </Badge>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.shortTitle}</div>
          <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>
            {c.day} {c.month} {c.year} · {c.city} · {format(t.rowIscritti, { n: c.enrolled })}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t.rowFinalExam}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>
            {format(t.rowDayN, { n: c.examDayNo })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
            {c.examDateLabel}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t.rowMiniTest}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
              {c.miniDone}/{c.miniTotal}
            </span>
            <div className="bar" style={{ width: 54 }}>
              <i style={{ width: `${miniPct}%`, background: "var(--indigo)" }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>
            {c.feedbackStatus === "inviato"
              ? format(t.rowFeedbackSent, { r: c.feedbackResponses, t: c.feedbackTotal })
              : t.rowFeedbackReady}
          </div>
        </div>

        <div>
          {done ? (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {t.rowEsito}
              </div>
              <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--success-fg)" }}>
                {format(t.rowPromossi, { p: c.passed, t: c.resultsTotal })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{passPct}%</div>
            </>
          ) : (
            <>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {t.rowStato}
              </div>
              {c.live ? (
                <Badge tone="indigo" dot>
                  {t.rowInProgress}
                </Badge>
              ) : (
                <Badge tone="neutral">{t.rowPianificato}</Badge>
              )}
            </>
          )}
        </div>

        <Icon name="arrow" size={16} className="text-4" />
      </div>
    </Link>
  );
}
