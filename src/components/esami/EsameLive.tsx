"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { ExamLiveSession } from "@/lib/domain";

export interface EsameLiveProps {
  courseId: string;
  shortTitle: string;
  month: string;
  year: number;
  city: string;
  duration: number;
  sessions: ExamLiveSession[];
}

export function EsameLive({ courseId, shortTitle, month, year, city, duration, sessions }: EsameLiveProps) {
  const t = useT().esami.live;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const live = useMemo<ExamLiveSession[]>(() => {
    return sessions.map((s, i) => {
      if (s.status === "submitted" || s.status === "not-started") return s;
      const newProg = Math.min(100, s.progress + (tick * 3 + (i % 4)));
      const submitted = newProg >= 100;
      return {
        ...s,
        progress: newProg,
        status: submitted ? "submitted" : "in-progress",
        score: submitted ? Math.max(s.score ?? 75, 65 + ((i * 7) % 35)) : null,
      };
    });
  }, [tick, sessions]);

  const elapsed = Math.min(duration, 12 + tick * 2);
  const remaining = duration - elapsed;

  const notStarted = live.filter((s) => s.status === "not-started").length;
  const inProgress = live.filter((s) => s.status === "in-progress").length;
  const submitted = live.filter((s) => s.status === "submitted").length;
  const inProgressAvg = inProgress
    ? Math.round(live.filter((s) => s.status === "in-progress").reduce((a, x) => a + x.progress, 0) / inProgress)
    : 0;

  const submittedScores = live
    .filter((s) => s.status === "submitted")
    .map((s) => s.score)
    .filter((sc): sc is number => sc != null);
  const avgScore = submittedScores.length
    ? Math.round(submittedScores.reduce((a, b) => a + b, 0) / submittedScores.length)
    : null;

  const buckets = Array(10).fill(0) as number[];
  submittedScores.forEach((sc) => {
    buckets[Math.min(9, Math.floor(sc / 10))]++;
  });
  const maxBucket = Math.max(...buckets, 1);

  const sorted = [...live].sort((a, b) => b.progress - a.progress);

  return (
    <div style={{ background: "#0A1124", color: "white", minHeight: "100vh" }}>
      <div
        style={{
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "#0A1124",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link
            href={`/corsi/${courseId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              padding: "6px 10px",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => e.currentTarget.style.setProperty("background", "rgba(255,255,255,0.06)")}
            onMouseLeave={(e) => e.currentTarget.style.setProperty("background", "transparent")}
          >
            <Icon name="arrow-l" size={13} />
            {t.back}
          </Link>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
              {t.eyebrow}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 2 }}>
              {shortTitle}{" "}
              <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>
                · {month} {year} · {city}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: "rgba(0, 217, 36, 0.12)",
              border: "1px solid rgba(0, 217, 36, 0.3)",
              borderRadius: 999,
            }}
          >
            <span className="s-dot success pulse" />
            <span className="mono" style={{ fontSize: 11, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600 }}>
              {t.inProgress}
            </span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {String(Math.floor(remaining)).padStart(2, "0")}:{String(Math.floor((remaining % 1) * 60)).padStart(2, "0")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "none" }}>
              {t.addTime}
            </button>
            <button className="btn btn-sm" style={{ background: "var(--warning)", color: "white", borderColor: "transparent", boxShadow: "none" }}>
              <Icon name="pause" size={11} />
              {t.pause}
            </button>
            <button className="btn btn-sm btn-danger">
              <Icon name="stop" size={11} />
              {t.stop}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "24px 28px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr) 1.5fr",
          gap: 28,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <LiveKpi label={t.kpiEnrolled} value={live.length} sub={format(t.kpiEnrolledSub, { n: notStarted })} />
        <LiveKpi label={t.kpiInProgress} value={inProgress} accentColor="#8A82FF" sub={format(t.kpiInProgressSub, { n: inProgressAvg })} />
        <LiveKpi
          label={t.kpiSubmitted}
          value={submitted}
          accentColor="#00D924"
          sub={format(t.kpiSubmittedSub, { n: live.length ? Math.round((submitted / live.length) * 100) : 0 })}
        />
        <LiveKpi
          label={t.kpiAvg}
          value={avgScore !== null ? avgScore + "%" : "—"}
          sub={
            submittedScores.length
              ? format(t.kpiAvgSub, {
                  pass: submittedScores.filter((s) => s >= 80).length,
                  fail: submittedScores.filter((s) => s < 70).length,
                })
              : t.kpiAvgWaiting
          }
        />

        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            {t.distribution}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
            {buckets.map((n, i) => {
              const color = i >= 8 ? "#00D924" : i === 7 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} style={{ flex: 1, position: "relative", height: "100%", background: "rgba(255,255,255,0.04)", borderRadius: 2 }}>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: (n / maxBucket) * 100 + "%",
                      background: color,
                      borderRadius: 2,
                      minHeight: n > 0 ? 3 : 0,
                      transition: "height 500ms var(--ease-out)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            <span>0%</span>
            <span>50%</span>
            <span style={{ color: "var(--warning)" }}>70%</span>
            <span style={{ color: "#00D924" }}>80%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      <div style={{ padding: 28, display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t.students}</h2>
            <div className="segmented" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button className="on" style={{ color: "white", background: "rgba(255,255,255,0.1)" }}>
                {t.filterAll}
              </button>
              <button style={{ color: "rgba(255,255,255,0.6)" }}>{t.filterInProgress}</button>
              <button style={{ color: "rgba(255,255,255,0.6)" }}>{t.filterSubmitted}</button>
            </div>
          </div>
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            {sorted.map((s, i) => (
              <LiveRow key={s.email} s={s} last={i === sorted.length - 1} />
            ))}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 14 }}>{t.recentActivity}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {live
              .filter((s) => s.status === "submitted")
              .slice(0, 6)
              .map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: (s.score ?? 0) >= 80 ? "#00D924" : (s.score ?? 0) >= 70 ? "var(--warning)" : "var(--danger)",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {t.delivered} · {s.durationMin}m
                    </div>
                  </div>
                  <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>
                    {s.score}
                  </span>
                </div>
              ))}
          </div>

          <div style={{ marginTop: 20, padding: 18, background: "rgba(99, 91, 255, 0.1)", border: "1px solid rgba(99, 91, 255, 0.25)", borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: 8 }}>
              <Icon name="sparkle" size={10} /> {t.aiCorrection}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{format(t.aiResponses, { n: submitted * 8 })}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.45, marginBottom: 12 }}>
              {t.aiPre} <strong style={{ color: "white" }}>{Math.round(submitted * 1.5)}</strong> {t.aiPost}
            </div>
            <button className="btn btn-sm" style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "none" }}>
              {t.aiQueue}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveKpi({ label, value, sub, accentColor }: { label: string; value: number | string; sub?: string; accentColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 36, fontWeight: 600, color: accentColor || "white", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function LiveRow({ s, last }: { s: ExamLiveSession; last: boolean }) {
  const t = useT().esami.live;
  const tone =
    s.status === "submitted"
      ? (s.score ?? 0) >= 80
        ? "#00D924"
        : (s.score ?? 0) >= 70
          ? "var(--warning)"
          : "var(--danger)"
      : s.status === "in-progress"
        ? "#635BFF"
        : "rgba(255,255,255,0.2)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr 240px 90px auto",
        gap: 14,
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)",
      }}
      onMouseEnter={(e) => e.currentTarget.style.setProperty("background", "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => e.currentTarget.style.setProperty("background", "transparent")}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone }} />
      <div>
        <div style={{ fontSize: 13 }}>{s.name}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          {s.checkedIn ? t.checkedIn : t.waiting}
          {s.status === "in-progress" && ` · ${s.durationMin} min`}
        </div>
      </div>
      <div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ width: s.progress + "%", height: "100%", background: tone, borderRadius: 2, transition: "width 400ms var(--ease-out)" }} />
        </div>
        <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, letterSpacing: "var(--ls-caps)", textTransform: "uppercase" }}>
          {s.status === "submitted"
            ? t.statusSubmitted
            : s.status === "in-progress"
              ? `${s.progress}% · ${Math.round(s.progress * 1.1)} di 110`
              : t.statusNotStarted}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {s.score !== null && s.score !== undefined ? (
          <span className="num" style={{ fontSize: 18, fontWeight: 600, color: tone }}>
            {s.score}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>%</span>
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-icon btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none" }}>
          <Icon name="user" size={11} />
        </button>
        <button className="btn btn-icon btn-sm" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "none" }}>
          <Icon name="more" size={11} />
        </button>
      </div>
    </div>
  );
}
