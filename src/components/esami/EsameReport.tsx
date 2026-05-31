"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { REPORT_I18N, type ReportLang } from "@/lib/i18n/report";
import type { ExamFamily, ExamResult } from "@/lib/domain";

interface ReportCourse {
  day: number;
  month: string;
  year: number;
  city: string;
  educatorName: string;
}

export interface EsameReportProps {
  result: ExamResult;
  family: ExamFamily;
  course: ReportCourse;
}

const LANGS: ReportLang[] = ["it", "en", "ja"];
const LOCALE_TAG: Record<ReportLang, string> = { it: "it-IT", en: "en-GB", ja: "ja-JP" };

export function EsameReport({ result, family, course }: EsameReportProps) {
  const t = useT().esami.reportView;
  const [lang, setLang] = useState<ReportLang>("it");
  const [view, setView] = useState<"single" | "trio">("single");

  const statusLabel =
    result.status === "passed" ? t.statusPassed : result.status === "retrial" ? t.statusRetrial : t.statusFailed;
  const statusColor =
    result.status === "passed"
      ? "var(--success-fg)"
      : result.status === "retrial"
        ? "var(--warning-fg)"
        : "var(--danger-fg)";

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t.eyebrow}
          </div>
          <h1 className="display" style={{ fontSize: 28 }}>
            {result.name}
          </h1>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-3)" }}>
            {t.scorePrefix}{" "}
            <strong className="num" style={{ color: statusColor }}>
              {result.score}%
            </strong>{" "}
            · {statusLabel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="segmented">
            <button className={view === "single" ? "on" : ""} onClick={() => setView("single")}>
              {t.viewSingle}
            </button>
            <button className={view === "trio" ? "on" : ""} onClick={() => setView("trio")}>
              {t.viewTrio}
            </button>
          </div>
          {view === "single" && (
            <div className="segmented">
              {LANGS.map((l) => (
                <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button className="btn">
            <Icon name="download" size={13} />
            {t.download}
          </button>
          <button className="btn btn-primary">
            <Icon name="mail" size={13} />
            {t.sendEmail}
          </button>
        </div>
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, var(--indigo-50), var(--surface-2))",
          padding: 32,
          borderRadius: 12,
          display: "flex",
          justifyContent: "center",
          gap: 24,
          overflow: "auto",
          border: "1px solid var(--border)",
        }}
      >
        {view === "single" ? (
          <ReportPage result={result} family={family} course={course} lang={lang} />
        ) : (
          LANGS.map((l) => <ReportPage key={l} result={result} family={family} course={course} lang={l} mini />)
        )}
      </div>
    </div>
  );
}

function ReportPage({
  result,
  family,
  course,
  lang,
  mini,
}: {
  result: ExamResult;
  family: ExamFamily;
  course: ReportCourse;
  lang: ReportLang;
  mini?: boolean;
}) {
  const t = REPORT_I18N[lang];
  const isPass = result.status === "passed";
  const isRetrial = result.status === "retrial";
  const FS = mini ? 0.65 : 1;
  const W = mini ? 340 : 540;
  const statusFg = isPass ? "var(--success-fg)" : isRetrial ? "var(--warning-fg)" : "var(--danger-fg)";
  const statusBg = isPass ? "var(--success-bg)" : isRetrial ? "var(--warning-bg)" : "var(--danger-bg)";
  const statusBorder = isPass ? "var(--success)" : isRetrial ? "var(--warning)" : "var(--danger)";
  const issued = new Date(result.completedAt).toLocaleDateString(LOCALE_TAG[lang], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        width: W,
        minHeight: mini ? 480 : 760,
        background: "white",
        boxShadow: "var(--sh-4)",
        padding: 32 * FS,
        fontFamily: lang === "ja" ? "'Hiragino Mincho ProN', 'Yu Mincho', serif" : "var(--font-sans)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        gap: 16 * FS,
        borderRadius: 4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 * FS, borderBottom: "1.5px solid var(--navy)" }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600 }}>
            Sake Sommelier Association
          </div>
          <div style={{ fontWeight: 600, fontSize: 13 * FS, marginTop: 4, letterSpacing: "-0.005em" }}>{t.cert}</div>
        </div>
        <div style={{ width: 36 * FS, height: 36 * FS, background: "var(--navy)", color: "white", display: "grid", placeItems: "center", borderRadius: 4, position: "relative", overflow: "hidden" }}>
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, var(--indigo) 0%, transparent 60%)", opacity: 0.6 }} />
          <span style={{ position: "relative", zIndex: 1, fontWeight: 700, fontSize: 18 * FS, letterSpacing: "-0.02em" }}>S</span>
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>
          {t.family[family]}
        </div>
        <h1 style={{ fontSize: 28 * FS, margin: 0, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{result.name}</h1>
        <div style={{ marginTop: 8, fontSize: 11 * FS, color: "var(--text-3)" }}>
          {t.examDate}:{" "}
          <strong style={{ color: "var(--text-2)" }}>
            {course.day} {course.month} {course.year}
          </strong>{" "}
          · {t.location}: {course.city} · {t.educator}: {course.educatorName}
        </div>
      </div>

      <div
        style={{
          padding: 18 * FS,
          background: statusBg,
          border: "1.5px solid " + statusBorder,
          borderRadius: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
            {t.score}
          </div>
          <div className="num" style={{ fontSize: 40 * FS, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: statusFg }}>
            {result.score}
            <span style={{ fontSize: 20 * FS, color: "var(--text-3)", fontWeight: 500 }}>%</span>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 24 * FS, color: statusFg, letterSpacing: "-0.01em" }}>
          {isPass ? t.passedTitle : isRetrial ? t.retrialTitle : t.failedTitle}
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>
          {t.aiSummary}
        </div>
        <p style={{ fontSize: 11.5 * FS, lineHeight: 1.55, color: "var(--text)", margin: 0 }}>{t.advice[result.status]}</p>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>
          {t.breakdown}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 * FS }}>
          {result.sections.map((sec) => (
            <div key={sec.cat} style={{ display: "grid", gridTemplateColumns: "1fr 50px", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11.5 * FS, marginBottom: 3, fontWeight: 500 }}>{sec.label}</div>
                <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2 }}>
                  <div
                    style={{
                      width: sec.pct + "%",
                      height: "100%",
                      background: sec.pct >= 80 ? "var(--success)" : sec.pct >= 70 ? "var(--warning)" : "var(--danger)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
              <div
                className="num"
                style={{
                  textAlign: "right",
                  fontSize: 11 * FS,
                  fontWeight: 600,
                  color: sec.pct >= 80 ? "var(--success-fg)" : sec.pct >= 70 ? "var(--warning-fg)" : "var(--danger-fg)",
                }}
              >
                {Math.round(sec.pct)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.wrongImportant.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 9.5 * FS, letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>
            {t.importantWrong}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 * FS }}>
            {result.wrongImportant.slice(0, 2).map((w, i) => (
              <div key={i} style={{ paddingLeft: 12 * FS, borderLeft: "3px solid var(--danger)" }}>
                <div style={{ fontSize: 11 * FS, lineHeight: 1.4, color: "var(--text)", marginBottom: 4 * FS }}>{w.text}</div>
                <div className="mono" style={{ fontSize: 10 * FS, color: "var(--danger-fg)" }}>
                  ✗ {t.yourAnswer}: {w.wrongAnswer}
                </div>
                <div className="mono" style={{ fontSize: 10 * FS, color: "var(--success-fg)" }}>
                  ✓ {t.correctAnswer}: {w.correctAnswer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: "auto",
          paddingTop: 12 * FS,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9.5 * FS,
          color: "var(--text-4)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>
          {t.issued}: {issued}
        </span>
        <span>{t.footer}</span>
      </div>
    </div>
  );
}
