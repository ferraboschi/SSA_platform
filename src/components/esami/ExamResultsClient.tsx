"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Icon, PageHeader, type BadgeTone } from "@/components/ui";
import { gradeEnrollmentAction } from "@/lib/exam-links/grading-actions";
import type { ExamOutcome, GradedSubmission } from "@/lib/exam-links/results";

const OUTCOME_TONE: Record<string, BadgeTone> = {
  passed: "success",
  retrial: "warning",
  failed: "danger",
};
const OUTCOME_LABEL: Record<string, string> = {
  passed: "Promosso",
  retrial: "Recupero",
  failed: "Bocciato",
};

function scoreColor(s: number): string {
  return s >= 80 ? "var(--success-fg)" : s >= 70 ? "var(--warning-fg)" : "var(--danger-fg)";
}

export function ExamResultsClient({
  courseId,
  courseTitle,
  hasExam,
  results,
}: {
  courseId: string;
  courseTitle: string;
  hasExam: boolean;
  results: GradedSubmission[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // LIVE monitor: re-fetch real submissions every 25s while enabled.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, 25000);
    return () => clearInterval(id);
  }, [live, router]);

  const confirmedCount = results.filter((r) => r.currentResult).length;

  return (
    <div className="page">
      <Link className="btn btn-sm btn-ghost" href={`/esami/${courseId}`} style={{ marginBottom: 14 }}>
        <Icon name="arrow-l" size={12} />
        Torna all&apos;esame
      </Link>
      <PageHeader
        eyebrow="Esiti & correzione"
        title={`Risultati esame — ${courseTitle}`}
        sub="Consegne reali degli studenti, corrette in automatico sulle domande oggettive. Conferma l'esito: viene scritto sul profilo del corsista."
        actions={
          hasExam ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {results.length} consegne · {confirmedCount} confermate
                {lastRefresh ? ` · agg. ${lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
              <button
                className={`btn btn-sm ${live ? "" : "btn-ghost"}`}
                onClick={() => setLive((v) => !v)}
                title="Aggiornamento automatico ogni 25s"
              >
                <span className={`s-dot ${live ? "success pulse" : ""}`} style={{ marginRight: 5 }} />
                {live ? "LIVE" : "in pausa"}
              </button>
            </div>
          ) : undefined
        }
      />

      {!hasExam ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="text-3">Questo corso non prevede un esame.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="text-3">
            Nessuna consegna ancora. I risultati appaiono qui quando gli studenti completano l&apos;esame dal link.
          </p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Studente</th>
                <th>Test</th>
                <th>Consegna</th>
                <th style={{ textAlign: "right" }}>Auto %</th>
                <th>Esito attuale</th>
                <th>Conferma esito</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <ResultRow
                  key={r.id}
                  r={r}
                  courseId={courseId}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  r,
  courseId,
  expanded,
  onToggle,
}: {
  r: GradedSubmission;
  courseId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const grade = (outcome: ExamOutcome) => {
    if (r.enrollmentId == null) {
      setErr("Studente non trovato tra gli iscritti — impossibile registrare l'esito.");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await gradeEnrollmentAction(r.enrollmentId!, outcome, r.autoScore, courseId);
      if (res.ok) router.refresh();
      else setErr(res.error || "Errore");
    });
  };

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>
          {r.studentName}
          <div className="text-3" style={{ fontSize: 11, fontWeight: 400 }}>{r.studentEmail || "—"}</div>
        </td>
        <td className="text-3">{r.testKey}</td>
        <td className="text-3" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
          {new Date(r.submittedAt).toLocaleDateString("it-IT")}
        </td>
        <td style={{ textAlign: "right", fontWeight: 700, color: scoreColor(r.autoScore) }}>
          {r.autoScore}%
          {r.manualCount > 0 && (
            <div className="text-3" style={{ fontSize: 10, fontWeight: 400 }}>+{r.manualCount} aperte</div>
          )}
        </td>
        <td>
          {r.currentResult ? (
            <Badge tone={OUTCOME_TONE[r.currentResult] ?? "neutral"} dot>
              {OUTCOME_LABEL[r.currentResult] ?? r.currentResult}
              {r.currentScore != null ? ` ${r.currentScore}%` : ""}
            </Badge>
          ) : (
            <span className="text-3" style={{ fontStyle: "italic", fontSize: 12 }}>da confermare</span>
          )}
        </td>
        <td>
          <div style={{ display: "inline-flex", gap: 4 }}>
            {(["passed", "retrial", "failed"] as ExamOutcome[]).map((o) => (
              <button
                key={o}
                className="btn btn-xs"
                disabled={pending || r.enrollmentId == null}
                onClick={() => grade(o)}
                title={r.enrollmentId == null ? "Studente non iscritto" : `Suggerito: ${OUTCOME_LABEL[r.suggested]}`}
                style={{
                  borderColor: r.suggested === o ? `var(--${o === "passed" ? "success" : o === "retrial" ? "warning" : "danger"}-fg)` : undefined,
                  fontWeight: r.suggested === o ? 700 : 400,
                }}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
          {err && <div style={{ color: "var(--danger-fg)", fontSize: 11, marginTop: 4 }}>{err}</div>}
        </td>
        <td>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onToggle} title="Vedi risposte">
            <Icon name={expanded ? "chevron-d" : "chevron"} size={13} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-2)", padding: 0 }}>
            <div style={{ padding: "12px 18px", display: "grid", gap: 6 }}>
              {r.answers.map((a, i) => (
                <div key={a.qid + i} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, fontSize: 12.5, alignItems: "start" }}>
                  <span style={{ marginTop: 2 }}>
                    {a.ok === true ? (
                      <Icon name="check" size={12} className="text-3" style={{ color: "var(--success-fg)" }} />
                    ) : a.ok === false ? (
                      <Icon name="x" size={12} style={{ color: "var(--danger-fg)" }} />
                    ) : (
                      <Icon name="edit" size={11} className="text-3" />
                    )}
                  </span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{a.text}</div>
                    <div className="text-3" style={{ fontSize: 12 }}>
                      Risposta: <strong style={{ color: a.ok === false ? "var(--danger-fg)" : "var(--text)" }}>{a.given}</strong>
                      {a.ok !== null && a.ok === false && <> · Corretta: <strong style={{ color: "var(--success-fg)" }}>{a.correct}</strong></>}
                      {a.ok === null && <> · <em>valutazione manuale</em></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
