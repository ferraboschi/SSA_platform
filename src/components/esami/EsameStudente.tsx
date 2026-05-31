"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { EXAM_PREVIEW_I18N } from "@/lib/i18n/examPreview";
import type { ReportLang } from "@/lib/i18n/report";
import type { ExamQuestion } from "@/lib/domain";

type Device = "mobile" | "tablet" | "desktop";
const LANGS: ReportLang[] = ["it", "en", "ja"];
const DEVICES: { key: Device; labelKey: "deviceMobile" | "deviceTablet" | "deviceDesktop"; icon: "smartphone" | "tablet" | "monitor" }[] = [
  { key: "mobile", labelKey: "deviceMobile", icon: "smartphone" },
  { key: "tablet", labelKey: "deviceTablet", icon: "tablet" },
  { key: "desktop", labelKey: "deviceDesktop", icon: "monitor" },
];

export interface EsameStudenteProps {
  courseId: string;
  month: string;
  year: number;
  questions: ExamQuestion[];
}

export function EsameStudente({ courseId, month, year, questions }: EsameStudenteProps) {
  const t = useT().esami.studente;
  const [device, setDevice] = useState<Device>("mobile");
  const [qIdx, setQIdx] = useState(0);
  const [lang, setLang] = useState<ReportLang>("it");
  const q = questions[qIdx];

  if (!q) return <div className="page">{t.notFound}</div>;

  return (
    <div className="page">
      <Link className="btn btn-sm btn-ghost" style={{ marginBottom: 14 }} href={`/esami/${courseId}`}>
        <Icon name="arrow-l" size={12} />
        {t.back}
      </Link>

      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <div className="page-sub">{t.sub}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, marginTop: 20, flexWrap: "wrap" }}>
        <div className="segmented">
          {DEVICES.map((d) => (
            <button key={d.key} className={device === d.key ? "on" : ""} onClick={() => setDevice(d.key)}>
              <Icon name={d.icon} size={11} />
              {t[d.labelKey]}
            </button>
          ))}
        </div>
        <div className="segmented">
          {LANGS.map((l) => (
            <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn btn-icon btn-sm" onClick={() => setQIdx(Math.max(0, qIdx - 1))}>
            <Icon name="arrow-l" size={12} />
          </button>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
            {format(t.questionOf, { i: qIdx + 1, n: questions.length })}
          </span>
          <button className="btn btn-icon btn-sm" onClick={() => setQIdx(Math.min(questions.length - 1, qIdx + 1))}>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, var(--indigo-50), var(--bg))",
          padding: device === "mobile" ? "40px" : "32px",
          borderRadius: 12,
          display: "flex",
          justifyContent: "center",
          border: "1px solid var(--border)",
        }}
      >
        <DeviceFrame device={device} browserUrl={t.browserUrl}>
          <StudentScreen q={q} qIdx={qIdx} total={questions.length} lang={lang} month={month} year={year} imgPlaceholder={t.imgPlaceholder} />
        </DeviceFrame>
      </div>
    </div>
  );
}

function DeviceFrame({ device, browserUrl, children }: { device: Device; browserUrl: string; children: ReactNode }) {
  if (device === "mobile") {
    return (
      <div style={{ width: 380, height: 760, borderRadius: 42, background: "var(--navy)", padding: 12, boxShadow: "var(--sh-4)", position: "relative" }}>
        <div style={{ width: 100, height: 22, background: "var(--navy)", borderRadius: "0 0 16px 16px", position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 2 }} />
        <div style={{ width: "100%", height: "100%", background: "var(--surface)", borderRadius: 32, overflow: "hidden" }}>{children}</div>
      </div>
    );
  }
  if (device === "tablet") {
    return (
      <div style={{ width: 720, height: 540, borderRadius: 22, background: "var(--navy)", padding: 14, boxShadow: "var(--sh-4)" }}>
        <div style={{ width: "100%", height: "100%", background: "var(--surface)", borderRadius: 12, overflow: "hidden" }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{ width: 940, height: 560, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--sh-4)" }}>
      <div style={{ height: 32, background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        <span className="mono" style={{ marginLeft: 16, fontSize: 11, color: "var(--text-4)" }}>
          {browserUrl}
        </span>
      </div>
      <div style={{ height: "calc(100% - 32px)", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function StudentScreen({
  q,
  qIdx,
  total,
  lang,
  month,
  year,
  imgPlaceholder,
}: {
  q: ExamQuestion;
  qIdx: number;
  total: number;
  lang: ReportLang;
  month: string;
  year: number;
  imgPlaceholder: string;
}) {
  const p = EXAM_PREVIEW_I18N[lang];
  const [selected, setSelected] = useState<number[]>([]);
  const minutes = 42;
  const pct = ((qIdx + 1) / total) * 100;
  const questionText = lang === "ja" ? p.jaQuestionStub : q.text;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)" }}>
          SSA · {month} {year}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="s-dot success pulse" />
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>
            {String(minutes).padStart(2, "0")}:00
          </span>
        </div>
      </div>

      <div style={{ padding: "10px 20px 14px" }}>
        <div className="bar">
          <i style={{ width: pct + "%", background: "var(--indigo)" }} />
        </div>
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text-4)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", fontWeight: 600 }}>
          <span>
            {p.questionLabel} {qIdx + 1} / {total}
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: "12px 20px", overflow: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {q.cat.toUpperCase()} · {q.points} {p.points}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3, margin: 0, marginBottom: 22, letterSpacing: "-0.005em" }}>{questionText}</h2>

        {q.type === "image" && (
          <div className="ph-img" style={{ height: 150, marginBottom: 16, borderRadius: 6 }}>
            {imgPlaceholder}
          </div>
        )}

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.options ?? ["Vero", "Falso"]).map((opt, i) => {
              const isSel = selected.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (q.type === "multi") setSelected(isSel ? selected.filter((x) => x !== i) : [...selected, i]);
                    else setSelected(isSel ? [] : [i]);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 16px",
                    textAlign: "left",
                    border: "1.5px solid " + (isSel ? "var(--indigo)" : "var(--border)"),
                    borderRadius: 8,
                    background: isSel ? "var(--indigo-50)" : "var(--surface)",
                    fontSize: 14,
                    fontWeight: 500,
                    transition: "all var(--dur-fast)",
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: q.type === "multi" ? 4 : "50%",
                      border: "1.5px solid " + (isSel ? "var(--indigo)" : "var(--border-strong)"),
                      background: isSel ? "var(--indigo)" : "transparent",
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isSel && <Icon name={q.type === "multi" ? "check" : "dot"} size={11} />}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === "open" && (
          <textarea
            placeholder={p.openPlaceholder}
            style={{ width: "100%", padding: 12, fontSize: 14, border: "1.5px solid var(--border)", borderRadius: 8, minHeight: 140, fontFamily: "var(--font-sans)", lineHeight: 1.5, resize: "vertical" }}
          />
        )}

        {q.type === "fill" && <input className="input" placeholder="___" style={{ width: "100%", fontSize: 15, height: 42 }} />}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.pairs ?? []).map((pair, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
                <div style={{ padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 500 }}>{pair.l}</div>
                <Icon name="arrow" size={14} />
                <select className="select" defaultValue="">
                  <option value="">{p.chooseOption}</option>
                  {(q.pairs ?? []).map((pp, j) => (
                    <option key={j}>{pp.r}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items ?? []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1.5px solid var(--border)", borderRadius: 8 }}>
                <span style={{ width: 22, height: 22, display: "grid", placeItems: "center", background: "var(--surface-2)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{it}</span>
                <Icon name="more" size={13} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)" }}>
        <button className="btn btn-sm">← {p.back}</button>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>
          {qIdx + 1} / {total}
        </span>
        <button className="btn btn-sm btn-primary">{p.next} →</button>
      </div>
    </div>
  );
}
