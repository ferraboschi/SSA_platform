"use client";

// Internal feedback summary for staff (no per-student PDF). Renders real means
// from the feedback submissions: rating average + 1–5 distribution, choice
// distributions, and collected open responses.

import { Icon } from "@/components/ui";
import type { FeedbackAggregateResult } from "@/lib/exam-links/feedback-results";

export function FeedbackSummary({ data }: { data: FeedbackAggregateResult }) {
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
