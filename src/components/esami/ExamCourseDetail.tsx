"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Badge } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { ExamResult } from "@/lib/domain";
import {
  buildRoster,
  examFamilyLabel,
  examFamilyTone,
  fmtClock,
  seedHash,
  testToken,
  CONN_ORDER,
  type ConnStatus,
  type ExamCourseHeader,
  type ExamTest,
  type RosterRow,
  type RosterStudent,
  type TestState,
} from "@/lib/esami";

const T_BASE = "esami.sakesommelierassociation.it";

const CONN_DOT: Record<ConnStatus, string> = {
  submitted: "var(--success)",
  "in-progress": "var(--indigo)",
  waiting: "var(--warning)",
  absent: "var(--text-mute)",
};

export interface ExamCourseDetailProps {
  header: ExamCourseHeader;
  tests: ExamTest[];
  feedbackTest: ExamTest;
  rosterStudents: { students: RosterStudent[]; handle: string };
  results: ExamResult[];
}

export function ExamCourseDetail(props: ExamCourseDetailProps) {
  const { header } = props;
  const t = useT().esami.detail;
  const dateStr = `${header.day} ${header.month} ${header.year}`;
  return (
    <div className="page">
      <Link className="btn btn-sm btn-ghost" href="/esami" style={{ marginBottom: 14 }}>
        <Icon name="arrow-l" size={12} />
        {t.back}
      </Link>

      <div className="card" style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{ padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <Badge tone={examFamilyTone(header.type)} size="lg">
              {examFamilyLabel(header.type)}
            </Badge>
            {header.done ? (
              <Badge tone="success" size="lg">
                {t.concluso}
              </Badge>
            ) : header.live ? (
              <Badge tone="indigo" size="lg" dot>
                {t.live}
              </Badge>
            ) : (
              <Badge tone="neutral" size="lg">
                {t.daSvolgere}
              </Badge>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn btn-sm" href={`/esame-studente/${header.id}`}>
                <Icon name="user" size={12} />
                {t.studentView}
              </Link>
              <Link className="btn btn-sm btn-primary" href={`/esame-live/${header.id}`}>
                <Icon name="trending" size={12} />
                {t.openLive}
              </Link>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 28, marginBottom: 14 }}>
            {header.shortTitle}
          </h1>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: "var(--text-2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="calendar" size={14} className="text-3" />
              {format(t.course, { date: dateStr })}
              {header.days > 1 ? format(t.daysSuffix, { n: header.days }) : ""}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="exam" size={14} className="text-3" />
              {t.finalExam} <strong>{format(t.dayN, { n: header.examDayNo })}</strong> · {header.examDateLabel}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={14} className="text-3" />
              {header.city}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="users" size={14} className="text-3" />
              {format(t.iscritti, { n: header.enrolled })}
            </span>
          </div>
        </div>
      </div>

      <EsameSection {...props} />
    </div>
  );
}

function EsameSection({ header, tests, feedbackTest, rosterStudents, results }: ExamCourseDetailProps) {
  const t = useT().esami.section;
  const finalTest = tests.find((x) => x.key === "esame");
  const seqTests = tests.filter((x) => x.key !== "esame");
  const [tab, setTab] = useState(seqTests[0] ? seqTests[0].key : "feedback");

  const activeSeq = seqTests.find((x) => x.key === tab);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 22, overflowX: "auto", flexWrap: "nowrap" }}>
        {seqTests.map((x) => (
          <button
            key={x.key}
            className={`tab ${tab === x.key ? "active" : ""}`}
            onClick={() => setTab(x.key)}
            style={{ whiteSpace: "nowrap" }}
          >
            {x.shortLabel}
          </button>
        ))}
        <button
          className={`tab ${tab === "feedback" ? "active" : ""}`}
          onClick={() => setTab("feedback")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.tabFeedback}
        </button>
        {finalTest && (
          <button
            className={`tab ${tab === "esame" ? "active" : ""}`}
            onClick={() => setTab("esame")}
            style={{ whiteSpace: "nowrap" }}
          >
            {t.tabEsame}
          </button>
        )}
        <button
          className={`tab ${tab === "risultati" ? "active" : ""}`}
          onClick={() => setTab("risultati")}
          style={{ whiteSpace: "nowrap" }}
        >
          {t.tabRisultati}
        </button>
      </div>

      {activeSeq && <TestRunner key={activeSeq.key} test={activeSeq} rosterStudents={rosterStudents} />}
      {tab === "feedback" && <FeedbackRunner test={feedbackTest} rosterStudents={rosterStudents} />}
      {tab === "esame" && finalTest && (
        <TestRunner key="esame" test={finalTest} rosterStudents={rosterStudents} />
      )}
      {tab === "risultati" && <EsameRisultati results={results} courseId={header.id} />}
    </div>
  );
}

function TestRunner({
  test,
  rosterStudents,
}: {
  test: ExamTest;
  rosterStudents: { students: RosterStudent[]; handle: string };
}) {
  const tr = useT().esami;
  const t = tr.runner;
  const [state, setState] = useState<TestState>(test.state);
  const [dashOpen, setDashOpen] = useState(test.state === "aperto" || test.state === "chiuso");
  const [copied, setCopied] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [dashView, setDashView] = useState<"partecipanti" | "domande">(
    test.state === "bozza" ? "domande" : "partecipanti",
  );

  const roster = useMemo(
    () =>
      buildRoster(rosterStudents.students, rosterStudents.handle, {
        key: test.key,
        state,
        questions: test.questions,
        hasScore: test.hasScore,
      }),
    [rosterStudents, test.key, test.questions, test.hasScore, state],
  );

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!test.hasTimer || state !== "aperto") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [test.hasTimer, state]);
  const totalSec = (test.duration || 0) * 60;
  const remaining = Math.max(0, totalSec - elapsed);

  const prefix = test.kind === "prova" ? "p" : test.kind === "esame" ? "e" : "t";
  const link = `${T_BASE}/${prefix}/${testToken(rosterStudents.handle, test.key)}`;
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText("https://" + link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const connected = roster.filter((r) => r.checkedIn).length;
  const inProg = roster.filter((r) => r.conn === "in-progress").length;
  const submitted = roster.filter((r) => r.conn === "submitted").length;
  const submittedRows = roster.filter((r) => r.conn === "submitted");
  const avg = submittedRows.length
    ? Math.round(submittedRows.reduce((s, r) => s + r.score, 0) / submittedRows.length)
    : null;

  const stateBadge: { label: string; tone: BadgeTone } =
    state === "bozza"
      ? { label: t.stateBozza, tone: "neutral" }
      : state === "aperto"
        ? { label: t.stateAperto, tone: "indigo" }
        : { label: t.stateChiuso, tone: "success" };

  const metaLine = `${test.topic} · ${format(t.metaQuestions, { n: test.questions.length })} · ${test.when} · ${
    test.hasTimer ? format(t.withTime, { d: test.duration ?? 0 }) : t.noTime
  }`;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            padding: "18px 22px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: test.kind === "prova" || test.kind === "esame" ? "var(--navy)" : "var(--indigo)",
                color: "white",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {test.tag}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{test.title}</div>
                <Badge tone={stateBadge.tone} dot={state === "aperto"}>
                  {stateBadge.label}
                </Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>{metaLine}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {test.hasTimer && state === "aperto" && (
              <div style={{ textAlign: "right" }}>
                <div
                  className="num"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: remaining < 300 ? "var(--danger-fg)" : "var(--text)",
                  }}
                >
                  {fmtClock(remaining)}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{t.timeRemaining}</div>
              </div>
            )}
            {state === "bozza" && (
              <button className="btn btn-primary" onClick={() => { setState("aperto"); setDashOpen(true); setElapsed(0); }}>
                <Icon name="play" size={13} />
                {test.isFinal ? t.startExam : t.startTest}
              </button>
            )}
            {state === "aperto" && (
              <button className="btn btn-danger" onClick={() => setState("chiuso")}>
                <Icon name="stop" size={12} />
                {t.stopClose}
              </button>
            )}
            {state === "chiuso" && (
              <button className="btn" onClick={() => setState("aperto")}>
                <Icon name="refresh" size={12} />
                {t.reopen}
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border-2)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: state === "bozza" ? "var(--text-mute)" : "var(--success)",
              }}
            />
            {format(t.linkLabel, { s: state === "bozza" ? t.linkInactive : t.linkPasswordless })}
          </span>
          <code
            style={{
              flex: 1,
              minWidth: 200,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: state === "bozza" ? "var(--text-4)" : "var(--text-2)",
              background: "var(--surface)",
              border: "1px solid var(--border-2)",
              borderRadius: 6,
              padding: "7px 10px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {link}
          </code>
          <button
            className="btn btn-sm"
            onClick={copy}
            disabled={state === "bozza"}
            style={copied ? { color: "var(--success-fg)", borderColor: "var(--success)" } : undefined}
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? t.copied : t.copy}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <Icon name="smartphone" size={12} />
            {t.responsiveNote}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            {state === "aperto" && <span className="s-dot success pulse" style={{ width: 9, height: 9 }} />}
            <div className="h3">{state === "aperto" ? t.dashLive : t.dashEsiti}</div>
            <Badge tone="neutral">{format(t.connected, { a: connected, b: roster.length })}</Badge>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dashOpen && (
              <div className="segmented sm">
                <button className={dashView === "partecipanti" ? "on" : ""} onClick={() => setDashView("partecipanti")}>
                  {t.perParticipant}
                </button>
                <button className={dashView === "domande" ? "on" : ""} onClick={() => setDashView("domande")}>
                  {t.perQuestion}
                </button>
              </div>
            )}
            <button className="btn btn-sm" onClick={() => setDashOpen((o) => !o)}>
              <Icon name="chevron-d" size={12} className={dashOpen ? "flip-up" : ""} />
              {dashOpen ? t.compress : t.expand}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: test.hasScore ? "repeat(4,1fr)" : "repeat(3,1fr)",
            borderBottom: dashOpen ? "1px solid var(--border-2)" : "none",
          }}
        >
          <DashStat label={t.statConnessi} value={`${connected}/${roster.length}`} icon="users" />
          <DashStat label={t.statInCorso} value={inProg} icon="edit" tone="indigo" />
          <DashStat label={t.statConsegnati} value={submitted} icon="check" tone="success" />
          {test.hasScore && <DashStat label={t.statMedia} value={avg != null ? `${avg}%` : "—"} icon="trending" last />}
        </div>

        {dashOpen && dashView === "domande" && <QuestionStats roster={roster} test={test} />}
        {dashOpen && dashView === "partecipanti" && state === "bozza" && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-4)" }}>
            <Icon name="play" size={22} className="text-4" />
            <div style={{ fontSize: 13.5, marginTop: 10, fontWeight: 500, color: "var(--text-3)" }}>{t.notStartedTitle}</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>{t.notStartedBody}</div>
          </div>
        )}
        {dashOpen && dashView === "partecipanti" && state !== "bozza" && (
          <ParticipantTable roster={roster} test={test} openRow={openRow} setOpenRow={setOpenRow} />
        )}
      </div>
    </div>
  );
}

function DashStat({
  label,
  value,
  icon,
  tone,
  last,
}: {
  label: string;
  value: string | number;
  icon: "users" | "edit" | "check" | "trending";
  tone?: "success" | "indigo";
  last?: boolean;
}) {
  return (
    <div style={{ padding: "16px 20px", borderRight: last ? "none" : "1px solid var(--border-2)", display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: tone === "success" ? "var(--success-bg)" : tone === "indigo" ? "var(--indigo-50)" : "var(--surface-2)",
          color: tone === "success" ? "var(--success-fg)" : tone === "indigo" ? "var(--indigo-600)" : "var(--text-3)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon name={icon} size={15} />
      </div>
      <div>
        <div className="num" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function ParticipantTable({
  roster,
  test,
  openRow,
  setOpenRow,
}: {
  roster: RosterRow[];
  test: ExamTest;
  openRow: string | null;
  setOpenRow: (v: string | null) => void;
}) {
  const tr = useT().esami;
  const t = tr.runner;
  const sorted = [...roster].sort(
    (a, b) => CONN_ORDER[a.conn] - CONN_ORDER[b.conn] || b.score - a.score,
  );
  const cols = "1.6fr 1fr 1.4fr 0.7fr 32px";
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          gap: 12,
          padding: "10px 20px",
          borderBottom: "1px solid var(--border-2)",
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps)",
          color: "var(--text-4)",
          fontWeight: 600,
        }}
      >
        <span>{t.thPartecipante}</span>
        <span>{t.thStato}</span>
        <span>{t.thRisposte}</span>
        {test.hasScore ? <span style={{ textAlign: "right" }}>{t.thPunteggio}</span> : <span />}
        <span />
      </div>
      {sorted.map((r) => {
        const isOpen = openRow === r.email;
        return (
          <div key={r.email} style={{ borderBottom: "1px solid var(--border-2)" }}>
            <div
              onClick={() => r.checkedIn && setOpenRow(isOpen ? null : r.email)}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 12,
                padding: "12px 20px",
                alignItems: "center",
                cursor: r.checkedIn ? "pointer" : "default",
                background: isOpen ? "var(--surface-2)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Avatar name={r.name} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.name}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.email}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: CONN_DOT[r.conn] }} />
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{tr.conn[r.conn]}</span>
              </div>
              {r.checkedIn ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
                  {test.hasScore && (
                    <span style={{ color: "var(--success-fg)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Icon name="check" size={11} />
                      {r.nCorrect}
                    </span>
                  )}
                  {test.hasScore && (
                    <span style={{ color: "var(--danger-fg)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Icon name="x" size={11} />
                      {r.nWrong}
                    </span>
                  )}
                  {!test.hasScore && <span style={{ color: "var(--text-2)" }}>{format(t.dateGiven, { n: r.nAnswered })}</span>}
                  <span style={{ color: "var(--text-4)" }}>{format(t.missing, { n: r.nMissing })}</span>
                </div>
              ) : (
                <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>—</span>
              )}
              {test.hasScore ? (
                <div style={{ textAlign: "right" }}>
                  {r.conn === "submitted" ? (
                    <span
                      className="num"
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: r.score >= 80 ? "var(--success-fg)" : r.score >= 70 ? "var(--warning-fg)" : "var(--danger-fg)",
                      }}
                    >
                      {r.score}%
                    </span>
                  ) : r.conn === "in-progress" ? (
                    <span style={{ fontSize: 11, color: "var(--text-4)" }}>{t.inCorso}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text-4)" }}>—</span>
                  )}
                </div>
              ) : (
                <span />
              )}
              <div style={{ textAlign: "center", color: "var(--text-4)" }}>
                {r.checkedIn && <Icon name="chevron-d" size={13} className={isOpen ? "flip-up" : ""} />}
              </div>
            </div>
            {isOpen && <ParticipantDetail r={r} test={test} />}
          </div>
        );
      })}
    </div>
  );
}

function ParticipantDetail({ r, test }: { r: RosterRow; test: ExamTest }) {
  const t = useT().esami.runner;
  return (
    <div style={{ padding: "6px 20px 18px 20px", background: "var(--surface-2)", animation: "expandIn 160ms var(--ease-out)" }}>
      <div style={{ display: "flex", gap: 18, padding: "10px 0 14px", fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
        {test.hasScore && (
          <span>
            <strong className="num" style={{ color: "var(--success-fg)" }}>{r.nCorrect}</strong> {t.detCorrette}
          </span>
        )}
        {test.hasScore && (
          <span>
            <strong className="num" style={{ color: "var(--danger-fg)" }}>{r.nWrong}</strong> {t.detSbagliate}
          </span>
        )}
        <span>
          <strong className="num">{r.nMissing}</strong> {t.detMancanti}
        </span>
        <span>
          {t.detTempoTotale} <strong className="num">{fmtClock(r.totalTime)}</strong>
        </span>
        {test.hasScore && r.conn === "submitted" && (
          <span style={{ marginLeft: "auto" }}>
            {t.detPunteggio} <strong className="num">{r.score}%</strong>
          </span>
        )}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, overflow: "hidden" }}>
        {test.questions.map((q, qi) => {
          const a = r.answers[qi];
          const givenText =
            q.options && a.given != null ? q.options[a.given] : a.answered ? t.answerSent : null;
          const correctText =
            q.options && q.correct
              ? (q.correct as number[]).map((i) => q.options?.[i]).join(", ")
              : "—";
          return (
            <div
              key={q.id ?? qi}
              style={{
                display: "grid",
                gridTemplateColumns: "26px 1fr auto",
                gap: 10,
                padding: "10px 14px",
                borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none",
                alignItems: "start",
              }}
            >
              <div style={{ paddingTop: 1 }}>
                {!a.answered ? (
                  <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px dashed var(--border-strong)", display: "inline-block" }} />
                ) : !test.hasScore ? (
                  <Icon name="check" size={14} className="text-3" />
                ) : a.correct ? (
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--success)", color: "white", display: "grid", placeItems: "center" }}>
                    <Icon name="check" size={10} />
                  </span>
                ) : (
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--danger)", color: "white", display: "grid", placeItems: "center" }}>
                    <Icon name="x" size={10} />
                  </span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: a.answered ? 4 : 0 }}>
                  <span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>
                    {(qi + 1).toString().padStart(2, "0")}
                  </span>
                  {q.text}
                </div>
                {a.answered && (
                  <div style={{ fontSize: 11.5, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                    <span style={{ color: test.hasScore ? (a.correct ? "var(--success-fg)" : "var(--danger-fg)") : "var(--text-2)" }}>
                      {t.answerLabel} <strong>{givenText}</strong>
                    </span>
                    {test.hasScore && !a.correct && (
                      <span style={{ color: "var(--text-3)" }}>
                        {t.correctLabel} <strong>{correctText}</strong>
                      </span>
                    )}
                  </div>
                )}
                {!a.answered && <span style={{ fontSize: 11, color: "var(--text-4)" }}>{t.notAnswered}</span>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                {a.timeSec != null ? fmtClock(a.timeSec) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionStats({ roster, test }: { roster: RosterRow[]; test: ExamTest }) {
  const t = useT().esami.runner;
  return (
    <div>
      {test.questions.map((q, qi) => {
        const ans = roster.map((r) => r.answers[qi]).filter((a) => a.answered);
        const nCorrect = ans.filter((a) => a.correct).length;
        const pct = ans.length ? Math.round((nCorrect / ans.length) * 100) : 0;
        const dist = (q.options || []).map((opt, oi) => ({
          opt,
          oi,
          count: ans.filter((a) => a.given === oi).length,
          correct: q.correct ? (q.correct as number[]).includes(oi) : false,
        }));
        const maxCount = Math.max(1, ...dist.map((d) => d.count));
        const tone = !test.hasScore
          ? "var(--indigo)"
          : pct >= 70
            ? "var(--success)"
            : pct >= 50
              ? "var(--warning)"
              : "var(--danger)";
        return (
          <div
            key={q.id ?? qi}
            style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: dist.length ? 10 : 0 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", paddingTop: 2 }}>
                {(qi + 1).toString().padStart(2, "0")}
              </span>
              <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{q.text}</div>
              {test.hasScore && (
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: tone }}>
                    {pct}%
                  </span>
                  <div style={{ fontSize: 10, color: "var(--text-4)" }}>{format(t.correctOf, { n: nCorrect, t: ans.length })}</div>
                </div>
              )}
              {!test.hasScore && <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{format(t.nResponses, { n: ans.length })}</span>}
            </div>
            {dist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 23 }}>
                {dist.map((d) => (
                  <div key={d.oi} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 150,
                        fontSize: 11.5,
                        color: d.correct && test.hasScore ? "var(--success-fg)" : "var(--text-3)",
                        fontWeight: d.correct && test.hasScore ? 600 : 400,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {d.correct && test.hasScore && <Icon name="check" size={10} style={{ color: "var(--success)" }} />}
                      {d.opt}
                    </span>
                    <div className="bar" style={{ flex: 1, maxWidth: 240 }}>
                      <i style={{ width: `${(d.count / maxCount) * 100}%`, background: d.correct && test.hasScore ? "var(--success)" : "var(--indigo)" }} />
                    </div>
                    <span className="num" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 20 }}>
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ paddingLeft: 23, fontSize: 11.5, color: "var(--text-4)" }}>
                {test.hasScore ? t.openEvalAI : t.openEvalText}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeedbackRunner({
  test,
  rosterStudents,
}: {
  test: ExamTest;
  rosterStudents: { students: RosterStudent[]; handle: string };
}) {
  return (
    <div>
      <TestRunner test={test} rosterStudents={rosterStudents} />
      <FeedbackAggregate test={test} rosterStudents={rosterStudents} />
    </div>
  );
}

function FeedbackAggregate({
  test,
  rosterStudents,
}: {
  test: ExamTest;
  rosterStudents: { students: RosterStudent[]; handle: string };
}) {
  const t = useT().esami.runner;
  const roster = useMemo(
    () =>
      buildRoster(rosterStudents.students, rosterStudents.handle, {
        key: test.key,
        state: test.state,
        questions: test.questions,
        hasScore: test.hasScore,
      }),
    [rosterStudents, test.key, test.questions, test.hasScore, test.state],
  );
  const answeredRoster = roster.filter((r) => r.conn === "submitted" || r.conn === "in-progress");
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head">
        <div className="h3">{t.aggTitle}</div>
        <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{format(t.nResponses, { n: answeredRoster.length })}</span>
      </div>
      <div>
        {test.questions.map((q, qi) => {
          const ans = answeredRoster.map((r) => r.answers[qi]).filter((a) => a.answered);
          if (q.type === "rating") {
            const ratings = answeredRoster.map((r) => 3 + (seedHash(r.email + test.key + qi + "rt") % 3));
            const avg = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;
            const buckets = [1, 2, 3, 4, 5].map((v) => ratings.filter((x) => x === v).length);
            const mx = Math.max(1, ...buckets);
            return (
              <div key={q.id ?? qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>
                    <span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>
                      {(qi + 1).toString().padStart(2, "0")}
                    </span>
                    {q.text}
                  </span>
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--oro)" }}>
                    {avg.toFixed(1)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 44, paddingLeft: 23 }}>
                  {buckets.map((n, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: "60%", height: (n / mx) * 32 + 2, background: "var(--oro)", borderRadius: "2px 2px 0 0" }} />
                      <span style={{ fontSize: 9.5, color: "var(--text-4)" }}>{i + 1}★</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          if (q.options) {
            const dist = q.options.map((opt, oi) => ({ opt, count: ans.filter((a) => a.given === oi).length }));
            const mx = Math.max(1, ...dist.map((d) => d.count));
            return (
              <div key={q.id ?? qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  <span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>
                    {(qi + 1).toString().padStart(2, "0")}
                  </span>
                  {q.text}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 23 }}>
                  {dist.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 150, fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {d.opt}
                      </span>
                      <div className="bar" style={{ flex: 1, maxWidth: 240 }}>
                        <i style={{ width: `${(d.count / mx) * 100}%`, background: "var(--indigo)" }} />
                      </div>
                      <span className="num" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 20 }}>
                        {d.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={q.id ?? qi} style={{ padding: "14px 20px", borderBottom: qi < test.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>
                  {(qi + 1).toString().padStart(2, "0")}
                </span>
                {q.text}
              </div>
              <div style={{ paddingLeft: 23, fontSize: 11.5, color: "var(--text-4)" }}>
                <Icon name="edit" size={11} /> {format(t.openResponses, { n: ans.length })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExamRisultatiMeta({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 22 }}>
        {value}
      </div>
      {sub && <div className="kpi-foot">{sub}</div>}
    </div>
  );
}

function EsameRisultati({ results, courseId }: { results: ExamResult[]; courseId: string }) {
  const t = useT().esami.risultati;
  if (!results.length) {
    return (
      <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--text-3)" }}>
        <div className="h2" style={{ marginBottom: 6 }}>
          {t.notDoneTitle}
        </div>
        <div style={{ fontSize: 13 }}>{t.notDoneBody}</div>
      </div>
    );
  }
  const passed = results.filter((r) => r.status === "passed").length;
  const retrial = results.filter((r) => r.status === "retrial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  // Demo results always carry a numeric score; coalesce to stay null-safe.
  const avg = Math.round(results.reduce((s, r) => s + (r.score ?? 0), 0) / results.length);
  const buckets = Array(10).fill(0) as number[];
  results.forEach((r) => {
    buckets[Math.min(9, Math.floor((r.score ?? 0) / 10))]++;
  });
  const maxBucket = Math.max(...buckets, 1);
  const minScore = Math.min(...results.map((r) => r.score ?? 0));
  const maxScore = Math.max(...results.map((r) => r.score ?? 0));
  const sorted = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div>
      <div className="kpi-grid cols-4" style={{ marginBottom: 24 }}>
        <ExamRisultatiMeta label={t.kpiPromossi} value={`${passed}/${results.length}`} sub={`${Math.round((passed / results.length) * 100)}%`} />
        <ExamRisultatiMeta label={t.kpiRiserva} value={retrial} sub={t.kpiRiservaSub} />
        <ExamRisultatiMeta label={t.kpiBocciati} value={failed} sub={t.kpiBocciatiSub} />
        <ExamRisultatiMeta label={t.kpiMedia} value={`${avg}%`} sub={format(t.kpiMediaSub, { min: minScore, max: maxScore })} />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div className="h3">{t.distrTitle}</div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {buckets.map((n, i) => {
              const color = i >= 8 ? "var(--success)" : i === 7 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{n || ""}</div>
                  <div
                    style={{
                      width: "100%",
                      height: `${(n / maxBucket) * 100}%`,
                      background: color,
                      borderRadius: "3px 3px 0 0",
                      minHeight: n > 0 ? 4 : 0,
                      transition: "height 500ms var(--ease-out)",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{i * 10}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.thStudente}</th>
              <th>{t.thPunteggio}</th>
              <th>{t.thDurata}</th>
              <th>{t.thDeboli}</th>
              <th>{t.thEsito}</th>
              <th>{t.thReport}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const weakest = [...r.sections].sort((a, b) => a.pct - b.pct)[0];
              return (
                <tr key={r.email}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={r.name} size="sm" />
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 140 }}>
                      <span
                        className="num"
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: r.status === "passed" ? "var(--success-fg)" : r.status === "retrial" ? "var(--warning-fg)" : "var(--danger-fg)",
                        }}
                      >
                        {r.score ?? 0}%
                      </span>
                      <div
                        className={`bar ${r.status === "passed" ? "success" : r.status === "retrial" ? "warning" : "danger"}`}
                        style={{ width: 70 }}
                      >
                        <i style={{ width: `${r.score ?? 0}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="num text-3">{r.durationMin}m</td>
                  <td>{weakest && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{weakest.short} · {Math.round(weakest.pct)}%</span>}</td>
                  <td>
                    {r.status === "passed" && <Badge tone="success">{t.promosso}</Badge>}
                    {r.status === "retrial" && <Badge tone="warning">{t.riserva}</Badge>}
                    {r.status === "failed" && <Badge tone="danger">{t.bocciato}</Badge>}
                  </td>
                  <td>
                    <Link className="btn btn-sm" href={`/esami/${courseId}/report/${encodeURIComponent(r.email)}`}>
                      <Icon name="book" size={11} />
                      {t.pdf}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
