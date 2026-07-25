"use client";

// Internal feedback summary for staff (no per-student PDF). Renders real means
// from the feedback submissions: rating average + 1–5 distribution, choice
// distributions, and collected open responses.

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import type { FeedbackAggregateResult } from "@/lib/exam-links/feedback-results";
import {
  loadFeedbackSynthesisAction,
  generateFeedbackSynthesisAction,
} from "@/lib/esami/feedback-synthesis-actions";
import type { FeedbackSynthesis } from "@/lib/esami/feedback-synthesis";

/** Free-text → safe HTML: escape, then render **bold** and line breaks so the
 *  AI report's markdown headings read cleanly without a markdown dependency. */
function synthesisHtml(text: string): string {
  const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export function FeedbackSummary({
  data,
  courseId,
  family,
}: {
  data: FeedbackAggregateResult;
  courseId?: string;
  family?: "nihonshu" | "shochu" | null;
}) {
  const [synth, setSynth] = useState<FeedbackSynthesis | null>(null);
  const [busy, startGen] = useTransition();
  const [synthError, setSynthError] = useState<string | null>(null);

  // Load the cached report (if any) once — a generation persists it server-side.
  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    loadFeedbackSynthesisAction(Number(courseId))
      .then((s) => alive && setSynth(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [courseId]);

  const generate = () => {
    if (!courseId || !family) return;
    setSynthError(null);
    startGen(async () => {
      const r = await generateFeedbackSynthesisAction(Number(courseId), family).catch(
        () => ({ ok: false, error: "Sintesi non riuscita." }) as Awaited<ReturnType<typeof generateFeedbackSynthesisAction>>,
      );
      if (r.ok && r.synthesis) setSynth(r.synthesis);
      else setSynthError(r.error || "Sintesi non riuscita.");
    });
  };
  // Offer "Rigenera" once new responses arrived since the cached report.
  const stale = synth != null && synth.responses !== data.responses;
  // Overall course rating = mean of every rating question's average.
  const ratingAvgs = data.questions
    .filter((q) => q.kind === "rating" && q.ratingAvg != null)
    .map((q) => q.ratingAvg as number);
  const overall = ratingAvgs.length
    ? Math.round((ratingAvgs.reduce((s, v) => s + v, 0) / ratingAvgs.length) * 10) / 10
    : null;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="h3">Feedback di fine corso · media interna</div>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {data.responses} risposte
          {overall != null && (
            <> · media <strong className="num" style={{ color: "var(--oro)" }}>{overall.toFixed(1)}/5</strong></>
          )}
        </span>
      </div>

      {data.responses === 0 ? (
        <div style={{ padding: "18px 20px", fontSize: 13, color: "var(--text-4)" }}>
          Nessuna risposta al feedback ancora raccolta per questo corso.
        </div>
      ) : (
        <div>
          {/* AI SYNTHESIS (owner): one report for SSA organizers — what worked,
              what didn't, which sections to deepen, plus the free-text comments
              analysed semantically. A test's grading this is NOT. On-demand. */}
          {courseId && family && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: synth ? 10 : 0, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  ✦ Sintesi per gli organizzatori
                </div>
                <button className="btn btn-sm" disabled={busy} onClick={generate}>
                  {busy ? "Genero…" : synth ? "Rigenera" : "Genera sintesi AI"}
                </button>
              </div>
              {stale && !busy && (
                <div style={{ fontSize: 11.5, color: "var(--warning-fg)", marginBottom: 8 }}>
                  Sono arrivate nuove risposte dopo questa sintesi ({synth!.responses} → {data.responses}). Rigenera per aggiornarla.
                </div>
              )}
              {synthError && (
                <div style={{ fontSize: 12.5, color: "var(--danger-fg)", marginBottom: 8 }}>{synthError}</div>
              )}
              {synth ? (
                <>
                  <div
                    style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" }}
                    dangerouslySetInnerHTML={{ __html: synthesisHtml(synth.text) }}
                  />
                  <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 10 }}>
                    Analisi semantica su {synth.responses} risposte · {new Date(synth.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </>
              ) : (
                !busy && (
                  <div style={{ fontSize: 12.5, color: "var(--text-4)" }}>
                    Genera un report unico (cosa ha funzionato, cosa no, sezioni da approfondire, temi dai commenti liberi) — è una sintesi, non una correzione.
                  </div>
                )
              )}
            </div>
          )}
          {/* Satisfaction per THEMATIC AREA (educator): one bar per area, height
              ∝ the mean rating. Shown only when the feedback spans ≥2 areas —
              a single area would just duplicate the overall. */}
          {data.areas.filter((a) => a.ratingAvg != null).length >= 2 && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
                Soddisfazione per area
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", height: 130, overflowX: "auto" }}>
                {data.areas.map((a) => {
                  const pct = a.ratingAvg != null ? a.ratingAvg / 5 : 0;
                  const color = a.ratingAvg == null ? "var(--border)" : a.ratingAvg >= 4 ? "var(--success, #15803d)" : a.ratingAvg >= 3 ? "var(--oro)" : "var(--danger-fg, #b42318)";
                  return (
                    <div key={a.name} style={{ flex: "1 0 64px", minWidth: 64, maxWidth: 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span className="num" style={{ fontSize: 13, fontWeight: 700, color }}>
                        {a.ratingAvg != null ? a.ratingAvg.toFixed(1) : "—"}
                      </span>
                      <div style={{ width: "70%", display: "flex", alignItems: "flex-end", height: 80 }}>
                        <div style={{ width: "100%", height: `${Math.max(4, pct * 80)}px`, background: color, borderRadius: "3px 3px 0 0" }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>
                        {a.name}
                      </span>
                      <span style={{ fontSize: 9.5, color: "var(--text-4)" }}>{a.answered} ris.</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data.questions.map((q, qi) => (
            <div
              key={q.qid}
              style={{ padding: "14px 20px", borderBottom: qi < data.questions.length - 1 ? "1px solid var(--border-2)" : "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>
                  <span className="mono" style={{ color: "var(--text-4)", marginRight: 6 }}>
                    {(qi + 1).toString().padStart(2, "0")}
                  </span>
                  {q.text}
                </span>
                {q.kind === "rating" && q.ratingAvg != null && (
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--oro)" }}>
                    {q.ratingAvg.toFixed(1)}
                  </span>
                )}
              </div>

              {q.kind === "rating" && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 44, paddingLeft: 23 }}>
                  {q.ratingBuckets.map((n, i) => {
                    const mx = Math.max(1, ...q.ratingBuckets);
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: "60%", height: (n / mx) * 32 + 2, background: "var(--oro)", borderRadius: "2px 2px 0 0" }} />
                        <span style={{ fontSize: 9.5, color: "var(--text-4)" }}>{i + 1}★</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {q.kind === "choice" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 23 }}>
                  {q.optionLabels.map((opt, i) => {
                    const mx = Math.max(1, ...q.optionCounts);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 160, fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {opt}
                        </span>
                        <div className="bar" style={{ flex: 1, maxWidth: 240 }}>
                          <i style={{ width: `${(q.optionCounts[i] / mx) * 100}%`, background: "var(--indigo)" }} />
                        </div>
                        <span className="num" style={{ fontSize: 11, color: "var(--text-3)", minWidth: 20 }}>
                          {q.optionCounts[i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {q.kind === "open" && (
                <div style={{ paddingLeft: 23 }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-4)", marginBottom: 6 }}>
                    <Icon name="edit" size={11} /> {q.openResponses.length} risposte aperte
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.openResponses.slice(0, 20).map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--text-2)", padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6, borderLeft: "3px solid var(--indigo)" }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
