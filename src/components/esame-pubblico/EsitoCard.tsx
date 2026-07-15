"use client";

// Formative day-test result (owner, batch 7): shown to the STUDENT right after
// handing in, and again on every re-open of their link while it stays active.
// Lists every answer with right/wrong and, per question, an on-demand
// KB-grounded deep-dive ("Approfondisci") — SSA content supporting the
// outcome, whether the answer was correct or not. The FINAL exam never renders
// this card: its outcome stays private until the official correction.

import { useEffect, useState } from "react";
import { CHROME, type Lang } from "./exam-chrome";
import { getDayEsitoAction, getExamExplanationAction } from "@/lib/exam-links/actions";
import type { DayEsito } from "@/lib/exam-links/esito";

const ACCENT: Record<string, string> = {
  passed: "#15803d",
  retrial: "#b45309",
  failed: "#b42318",
};

function Explain({ token, qid, lang }: { token: string; qid: string; lang: Lang }) {
  const t = CHROME[lang];
  const [state, setState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [text, setText] = useState<string | null>(null);

  const run = async () => {
    if (state === "loading") return;
    setState("loading");
    const res = await getExamExplanationAction(token, qid, lang).catch(() => null);
    if (res?.ok && res.text) {
      setText(res.text);
      setState("done");
    } else {
      setState("err");
    }
  };

  if (state === "done" && text) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          background: "#f5f7ff",
          border: "1px solid #dbe2ff",
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          textAlign: "left",
        }}
      >
        {text}
        <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 6, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
          {t.explainSource}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#4f46e5",
          background: "none",
          border: "1px solid #c7d2fe",
          borderRadius: 8,
          padding: "4px 10px",
          cursor: state === "loading" ? "wait" : "pointer",
        }}
      >
        {state === "loading" ? t.explainLoading : `💡 ${t.explainBtn}`}
      </button>
      {state === "err" && (
        <span style={{ fontSize: 11.5, color: "#9ca3af", marginLeft: 8 }}>{t.explainFail}</span>
      )}
    </div>
  );
}

export function EsitoCard({
  esito: initialEsito,
  lang,
  token,
  returnNote,
}: {
  esito: DayEsito;
  lang: Lang;
  /** Valid exam link token — enables the per-question KB deep-dives. */
  token?: string;
  /** Show the "you can come back to this result" note (re-entry view). */
  returnNote?: boolean;
}) {
  const t = CHROME[lang];
  const [esito, setEsito] = useState(initialEsito);

  // The submit-time AI evaluation runs in the background (owner batch 8):
  // while it's in flight the card says so explicitly and refreshes itself
  // until the votes land — the page never looks frozen without a reason.
  useEffect(() => {
    if (!esito.aiPending || !token) return;
    let alive = true;
    let tries = 0;
    const id = setInterval(async () => {
      if (++tries > 24) {
        clearInterval(id);
        return;
      }
      const res = await getDayEsitoAction(token).catch(() => null);
      if (!alive) return;
      if (res?.ok && res.esito && !res.esito.aiPending) {
        setEsito(res.esito);
        clearInterval(id);
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esito.aiPending, token]);
  const accent = esito.outcome ? ACCENT[esito.outcome] : "#4f46e5";
  const outcomeLabel =
    esito.outcome === "passed" ? t.previewPassed : esito.outcome === "retrial" ? t.previewRetrial : t.previewFailed;

  return (
    <div className="exam-public-thanks" style={{ textAlign: "center" }}>
      <h2 style={{ marginBottom: 6 }}>{t.dayResultTitle}</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", margin: "0 0 14px" }}>{t.dayResultNote}</p>

      {esito.aiPending && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            fontSize: 13,
            color: "#4f46e5",
            background: "#f5f7ff",
            border: "1px solid #dbe2ff",
            borderRadius: 10,
            padding: "10px 14px",
            margin: "0 auto 14px",
            maxWidth: 520,
          }}
          role="status"
        >
          <span aria-hidden style={{ animation: "spin 1.2s linear infinite", display: "inline-block" }}>⏳</span>
          {t.aiWait}
        </div>
      )}

      {esito.pct != null ? (
        <div
          style={{
            border: `2px solid ${accent}`,
            borderRadius: 12,
            padding: "16px 22px",
            margin: "0 auto 16px",
            maxWidth: 320,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: accent }}>
            {t.previewScore}
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: accent, lineHeight: 1.05, margin: "4px 0" }}>
            {esito.pct}%
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{outcomeLabel}</div>
          <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)", marginTop: 8 }}>
            {esito.correct}/{esito.gradable}
            {esito.manual > 0 ? ` · ${esito.manual} ${t.previewManual}` : ""}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--text-2, #374151)", marginBottom: 14 }}>{t.previewNotGradable}</p>
      )}

      <div style={{ textAlign: "left", maxWidth: 620, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3, #6b7280)", margin: "0 0 8px" }}>
          {t.reviewList}
        </div>
        {esito.detail.map((d, i) => (
          <div
            key={d.qid}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e5e7eb",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 3 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 20,
                  color: d.ok === true ? "#15803d" : d.ok === false ? "#b42318" : "#9ca3af",
                  fontWeight: 800,
                }}
              >
                {d.ok === true ? "✓" : d.ok === false ? "✗" : "…"}
              </span>
              {i + 1}. {d.text}
            </div>
            <div style={{ color: "var(--text-2, #374151)", marginLeft: 20 }}>
              <span style={{ color: "var(--text-3, #6b7280)" }}>{t.yourAnswer}:</span> {d.given || "—"}
            </div>
            {d.ok === false && d.correctText !== "—" && (
              <div style={{ color: "#15803d", marginLeft: 20 }}>
                <span style={{ color: "var(--text-3, #6b7280)" }}>{t.reviewCorrectAnswer}:</span> {d.correctText}
              </div>
            )}
            {d.ok === null && d.aiVote == null && !d.aiFailed && (
              <div style={{ fontSize: 11.5, color: "#9ca3af", marginLeft: 20 }}>({t.reviewPendingBadge})</div>
            )}
            {d.aiFailed && (
              <div style={{ fontSize: 11.5, color: "#b45309", marginLeft: 20 }}>({t.aiFailedNote})</div>
            )}
            {d.aiVote != null && (
              <div
                style={{
                  marginLeft: 20,
                  marginTop: 6,
                  padding: "8px 10px",
                  background: "#f5f7ff",
                  border: "1px solid #dbe2ff",
                  borderRadius: 10,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                }}
              >
                <strong>
                  {t.aiVoteLabel}: {d.aiVote}/5
                  {d.aiPoints != null && d.aiMaxPoints != null ? ` · ${d.aiPoints}/${d.aiMaxPoints}` : ""}
                </strong>
                {d.aiRationale && <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{d.aiRationale}</div>}
              </div>
            )}
            {token && <div style={{ marginLeft: 20 }}><Explain token={token} qid={d.qid} lang={lang} /></div>}
          </div>
        ))}
      </div>

      {returnNote && (
        <p style={{ fontSize: 12, color: "var(--text-4, #9ca3af)", marginTop: 14 }}>{t.dayResultReturn}</p>
      )}
    </div>
  );
}
