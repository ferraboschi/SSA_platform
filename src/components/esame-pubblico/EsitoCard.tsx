"use client";

// Formative day-test result (owner, batch 7): shown to the STUDENT right after
// handing in, and again on every re-open of their link while it stays active.
// Lists every answer with right/wrong and, per question, an on-demand
// KB-grounded deep-dive ("Approfondisci") — SSA content supporting the
// outcome, whether the answer was correct or not. The FINAL exam never renders
// this card: its outcome stays private until the official correction.

import { useEffect, useState } from "react";
import { CHROME, type Lang } from "./exam-chrome";
import { getDayEsitoAction, getExamExplanationAction, getLinkStateAction } from "@/lib/exam-links/actions";
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
  // When the educator CLOSES the link, an esito already on screen must vanish
  // too (owner batch 9) — same 30s fail-open poll the runner uses while the
  // test is in progress. Re-opening the link is already blocked server-side.
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!token || closed) return;
    const id = setInterval(() => {
      getLinkStateAction(token)
        .then((r) => {
          // Only the EDUCATOR closure wipes the esito: the natural end-of-day
          // expiry (reason "expired") must not flash "closed by the educator"
          // at midnight — re-opening is blocked server-side anyway.
          if (r.ok && r.closed && r.reason === "closed") setClosed(true);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [token, closed]);

  // The submit-time AI evaluation runs in the background (owner batch 8):
  // while it's in flight the card says so explicitly and refreshes itself
  // until the votes land — the page never looks frozen without a reason.
  const [aiSlow, setAiSlow] = useState(false);
  useEffect(() => {
    if (!esito.aiPending || !token) return;
    let alive = true;
    let tries = 0;
    const id = setInterval(async () => {
      if (++tries > 24) {
        // ~2 minutes without a verdict: stop polling but SAY so — a silent
        // eternal hourglass reads as a frozen page.
        setAiSlow(true);
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

  if (closed) {
    return (
      <div className="exam-public-thanks" style={{ textAlign: "center" }}>
        <div className="exam-public-thanks-check">✕</div>
        <h2>{t.closedTitle}</h2>
        <p>{t.closedBody}</p>
      </div>
    );
  }

  return (
    <div className="exam-public-thanks" style={{ textAlign: "center" }}>
      <h2 style={{ marginBottom: 6 }}>{t.dayResultTitle}</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", margin: "0 0 14px" }}>{t.dayResultNote}</p>

      {/* While the AI is still grading the open answers, NO number is shown:
          a provisional (objective-only) score would flash "100%" and then
          drop when the real combined one lands — the owner saw exactly that.
          The card says "being verified" and swaps in the final score once. */}
      {esito.aiPending ? (
        <div
          style={{
            border: "2px solid #dbe2ff",
            background: "#f5f7ff",
            borderRadius: 12,
            padding: "18px 22px",
            margin: "0 auto 16px",
            maxWidth: 420,
          }}
          role="status"
        >
          <div aria-hidden style={{ fontSize: 30, marginBottom: 4 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#4f46e5", marginBottom: 6 }}>
            {t.aiVerifying}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", lineHeight: 1.5 }}>
            {aiSlow ? t.aiSlow : t.aiWait}
          </div>
        </div>
      ) : esito.pct != null ? (
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

      {/* Per-section subtotals (owner batch 10) — once the score is settled. */}
      {!esito.aiPending && (esito.sections?.length ?? 0) > 1 && (
        <div style={{ maxWidth: 420, margin: "0 auto 18px", textAlign: "left" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3, #6b7280)", margin: "0 0 8px" }}>
            {t.sectionsTitle}
          </div>
          {esito.sections!.map((s) => {
            const color = s.pct >= 80 ? "#15803d" : s.pct >= 70 ? "#b45309" : "#b42318";
            return (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
                <span style={{ flex: "0 0 40%", color: "var(--text-2, #374151)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ flex: 1, height: 6, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, s.pct))}%`, borderRadius: 999, background: color }} />
                </span>
                <span style={{ flex: "0 0 44px", textAlign: "right", fontWeight: 700, color }}>{s.pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: "left", maxWidth: 620, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3, #6b7280)", margin: "0 0 8px" }}>
          {t.reviewList}
        </div>
        {esito.detail.map((d, i) => {
          // Loud per-answer verdict (owner batch 9): a colored chip + row
          // accent, not a lone 13px glyph. Green = right, red = wrong,
          // gray = still under evaluation.
          const chip = d.unanswered
            ? { icon: "—", txt: t.verdictUnanswered, bg: "#fde8e6", fg: "#b42318" }
            : d.ok === true
              ? { icon: "✓", txt: t.verdictRight, bg: "#e8f6ee", fg: "#1a7f43" }
              : d.ok === false && d.partial
                ? { icon: "◐", txt: t.verdictPartial, bg: "#fef3c7", fg: "#b45309" }
                : d.ok === false
                  ? { icon: "✗", txt: t.verdictWrong, bg: "#fde8e6", fg: "#b42318" }
                  : d.aiVote != null
                    ? // The AI verdict LANDED: the chip must agree with the "Voto
                      // AI: n/5" box right below it, not keep saying "in
                      // valutazione" forever (open answers keep ok === null).
                      // GREEN only at 5/5 = full marks. The batch-17 rubric
                      // already sends a scope-correct answer (even a synthetic
                      // one) to 5, so brevity isn't penalised; a 4/5 carries a
                      // REAL minor imprecision (75% of the points) → stays partial
                      // to match the number in the box below it.
                      d.aiVote >= 5
                      ? { icon: "✓", txt: t.verdictRight, bg: "#e8f6ee", fg: "#1a7f43" }
                      : d.aiVote >= 2
                        ? { icon: "◐", txt: t.verdictPartial, bg: "#fef3c7", fg: "#b45309" }
                        : { icon: "✗", txt: t.verdictWrong, bg: "#fde8e6", fg: "#b42318" }
                    : d.aiFailed
                      ? { icon: "!", txt: t.verdictReview, bg: "#fef3c7", fg: "#b45309" }
                      : { icon: "…", txt: t.reviewPendingBadge, bg: "#f3f4f6", fg: "#6b7280" };
          return (
          <div
            key={d.qid}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e5e7eb",
              borderLeft: `3px solid ${chip.fg}`,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 9px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: ".02em",
                  textTransform: "uppercase",
                  background: chip.bg,
                  color: chip.fg,
                  whiteSpace: "nowrap",
                }}
              >
                {chip.icon} {chip.txt}
              </span>
              <span>
                {i + 1}. {d.text}
              </span>
            </div>
            <div style={{ color: "var(--text-2, #374151)", marginLeft: 20 }}>
              <span style={{ color: "var(--text-3, #6b7280)" }}>{t.yourAnswer}:</span> {d.given || "—"}
            </div>
            {d.ok === false && d.correctText !== "—" && (
              <div style={{ color: "#15803d", marginLeft: 20 }}>
                <span style={{ color: "var(--text-3, #6b7280)" }}>{t.reviewCorrectAnswer}:</span> {d.correctText}
              </div>
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
            {/* "Ripassa qui" only where there is something to review — a fully
                correct answer needs no pointer back to the course section. */}
            {d.cat && d.ok !== true && !(d.aiVote != null && d.aiVote >= 5) && (
              <div style={{ fontSize: 11.5, color: "var(--text-3, #6b7280)", marginLeft: 20, marginTop: 4 }}>
                📖 {t.sectionRef}: <strong>{d.cat}</strong>
              </div>
            )}
            {token && <div style={{ marginLeft: 20 }}><Explain token={token} qid={d.qid} lang={lang} /></div>}
          </div>
          );
        })}
      </div>

      {returnNote && (
        <p style={{ fontSize: 12, color: "var(--text-4, #9ca3af)", marginTop: 14 }}>{t.dayResultReturn}</p>
      )}
    </div>
  );
}
