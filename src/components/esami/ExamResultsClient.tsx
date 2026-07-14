"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Icon, PageHeader, type BadgeTone } from "@/components/ui";
import { gradeEnrollmentAction, gradePartecipanteAction } from "@/lib/exam-links/grading-actions";
import { certifiedScore } from "@/lib/exam-links/grading";
import { gradeOpenAnswerAction, type GradeOpenResult } from "@/lib/esami/ai-actions";
import {
  runCourseCorrectionAction,
  getCourseCorrectionAction,
} from "@/lib/esami/correction-actions";
import { getExamProgressForStaffAction } from "@/lib/exam-links/live-progress-actions";
import type { CorrectionDraft, OpenGrade } from "@/lib/esami/correction-types";
import { FeedbackSummary } from "./FeedbackSummary";
import { SendResultsSection, type ConfirmedResultRow } from "./SendResultsSection";
import type { ExamOutcome, GradedSubmission } from "@/lib/exam-links/results";
import type { FeedbackAggregateResult } from "@/lib/exam-links/feedback-results";

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
// Tone token stem per outcome — drives the confirmed-button fill (bg/fg vars).
const OUTCOME_STEM: Record<string, "success" | "warning" | "danger"> = {
  passed: "success",
  retrial: "warning",
  failed: "danger",
};

// One tab per test type (Esame / Giorno N / Feedback), so the results view
// isn't a single table mixing final + day-tests of the same student.
const FIXED_TEST_LABEL: Record<string, string> = { final: "Esame", feedback: "Feedback" };
function testLabel(key: string): string {
  if (FIXED_TEST_LABEL[key]) return FIXED_TEST_LABEL[key];
  const m = /^day(\d+)$/.exec(key);
  return m ? `Giorno ${m[1]}` : key;
}
function testOrder(key: string): number {
  if (key === "final") return 0; // Esame first (the certifying exam / default tab)
  const m = /^day(\d+)$/.exec(key);
  if (m) return 10 + Number(m[1]);
  if (key === "feedback") return 100;
  return 50;
}

// Human labels for the per-question category (KB-section key). Old questions
// carry slugs ("storia", "produzione-s"), newer ones full labels ("Ingredienti");
// normalise both, and group the answer detail under these headers.
const CAT_LABELS: Record<string, string> = {
  storia: "Storia",
  produzione: "Produzione",
  varieta: "Varietà & Stili",
  ingredienti: "Ingredienti",
  degustazione: "Degustazione",
  servizio: "Servizio",
  classificazione: "Classificazione",
};
function catLabel(cat?: string): string {
  const raw = (cat ?? "").trim();
  if (!raw) return "Altre domande";
  const norm = raw.toLowerCase().replace(/-s$/, "");
  return CAT_LABELS[norm] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

function scoreColor(s: number): string {
  return s >= 80 ? "var(--success-fg)" : s >= 70 ? "var(--warning-fg)" : "var(--danger-fg)";
}

export function ExamResultsClient({
  courseId,
  courseTitle,
  hasExam,
  family = null,
  results,
  feedback,
  adminEmail = "",
  emailsLive = false,
  embedded = false,
  onChanged,
}: {
  courseId: string;
  courseTitle: string;
  hasExam: boolean;
  /** Exam family — enables the batch "Correggi" run (final exam). */
  family?: "nihonshu" | "shochu" | null;
  results: GradedSubmission[];
  feedback?: FeedbackAggregateResult | null;
  adminEmail?: string;
  emailsLive?: boolean;
  /** Rendered inside a course tab: drop the page wrapper + back link. */
  embedded?: boolean;
  /** Embedded loader callback: re-fetch the data after an outcome is confirmed
   *  (router.refresh can't reach a tab's client-loaded data). */
  onChanged?: () => void;
}) {
  // Confirmed results = graded submissions whose outcome has been confirmed,
  // DEDUPED by student (a re-submission would otherwise create a duplicate row
  // and collide on the React key). Results are newest-first, so the first wins —
  // except that a CORSISTA row beats a companion sharing the same email, matching
  // findConfirmedResultByEmail's tie-break (the send/report surfaces route to the
  // corsista, so the label here must name the same person).
  const sorted = [...results].sort(
    (a, b) => Number(b.enrollmentId != null) - Number(a.enrollmentId != null),
  );
  const confirmed: ConfirmedResultRow[] = [];
  const seenConfirmed = new Set<string>();
  for (const r of sorted) {
    if (!r.currentResult) continue;
    const key = (r.studentEmail || r.studentName).toLowerCase().trim();
    if (seenConfirmed.has(key)) continue;
    seenConfirmed.add(key);
    confirmed.push({
      name: r.studentName,
      email: r.studentEmail,
      score: r.currentScore,
      status: r.currentResult as string,
    });
  }
  const [expanded, setExpanded] = useState<number | null>(null);

  // One tab per test type. Group the submissions by test key; the tabs are
  // Esame (final, default) → Giorno N → Feedback (aggregate, no per-row table).
  const byTest = new Map<string, GradedSubmission[]>();
  for (const r of results) {
    const arr = byTest.get(r.testKey);
    if (arr) arr.push(r);
    else byTest.set(r.testKey, [r]);
  }
  const tabKeys = [...byTest.keys()].sort((a, b) => testOrder(a) - testOrder(b));
  if (feedback) tabKeys.push("feedback");
  const [tab, setTab] = useState<string>(() =>
    byTest.has("final") ? "final" : (tabKeys[0] ?? "final"),
  );
  // The active tab may vanish after a live refresh (e.g. filtered out) — fall
  // back to the first available so the view never goes blank.
  const activeTab = tabKeys.includes(tab) ? tab : (tabKeys[0] ?? "final");
  const tabRows = activeTab === "feedback" ? [] : (byTest.get(activeTab) ?? []);
  const showOutcome = activeTab === "final";

  const router = useRouter();
  const [live, setLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Correction drafts (the "Correggi" run output), keyed by submission id.
  // Loaded lazily on mount; refreshed after a run. Advisory only — staff still
  // confirms the official verdict with the buttons on each row.
  const [drafts, setDrafts] = useState<Record<number, CorrectionDraft>>({});
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(null);
  // Attendance for the ACTIVE test (subject key → present) — flags submissions
  // whose student was (or was later marked) absent at the relevant roll call.
  const [presentMap, setPresentMap] = useState<Record<string, boolean> | undefined>(undefined);
  const [correcting, startCorrection] = useTransition();
  const [correctionMsg, setCorrectionMsg] = useState<string | null>(null);

  // The batch runs PER TEST (owner batch 7: paid day tests get the same AI
  // correction as the final) — reload run/drafts when the tab changes.
  const correctionTest = activeTab === "feedback" ? "final" : activeTab;
  useEffect(() => {
    let alive = true;
    getCourseCorrectionAction(courseId, correctionTest)
      .then((r) => {
        if (!alive) return;
        if (r.drafts) setDrafts(r.drafts as Record<number, CorrectionDraft>);
        setTemplateUpdatedAt(r.templateUpdatedAt ?? null);
      })
      .catch(() => {});
    getExamProgressForStaffAction(courseId, correctionTest)
      .then((r) => {
        if (alive && r.ok) setPresentMap(r.presentForTest);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [courseId, correctionTest]);

  const runCorrection = () => {
    if (!family || correcting) return;
    setCorrectionMsg(null);
    startCorrection(async () => {
      try {
        const res = await runCourseCorrectionAction(courseId, family, correctionTest);
        if (!res.ok) {
          setCorrectionMsg(res.error || "Correzione non riuscita.");
          return;
        }
        const run = res.run;
        setCorrectionMsg(
          `Corretti ${run?.graded ?? 0}/${run?.total ?? 0} — bozze pronte` +
            (run?.failures?.length ? ` · ${run.failures.length} con errori` : "") +
            ".",
        );
        const fresh = await getCourseCorrectionAction(courseId, correctionTest).catch(() => null);
        if (fresh?.drafts) setDrafts(fresh.drafts as Record<number, CorrectionDraft>);
      } catch {
        setCorrectionMsg("Correzione non riuscita, riprova.");
      }
    });
  };

  // LIVE monitor: re-fetch real submissions every 25s while enabled. Disabled
  // when embedded in a tab (a full router.refresh there would refetch the whole
  // course page without updating this client-loaded data).
  useEffect(() => {
    if (!live || embedded) return;
    const id = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, 25000);
    return () => clearInterval(id);
  }, [live, embedded, router]);

  const confirmedCount = confirmed.length;

  return (
    <div className={embedded ? "" : "page"}>
      {!embedded && (
        <Link className="btn btn-sm btn-ghost" href={`/esami/${courseId}`} style={{ marginBottom: 14 }}>
          <Icon name="arrow-l" size={12} />
          Torna all&apos;esame
        </Link>
      )}
      <PageHeader
        eyebrow="Esiti & correzione"
        title={`Risultati esame${courseTitle ? ` — ${courseTitle}` : ""}`}
        sub="Consegne reali degli studenti, corrette in automatico sulle domande oggettive. L'esito (Promosso/Recupero/Bocciato) è la certificazione dell'esame finale: si conferma sulla riga «final» e vale per lo studente; i mini-test giornalieri sono solo di verifica."
        actions={
          hasExam ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
              {family && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={runCorrection}
                  disabled={correcting}
                  title="Corregge tutte le consegne del test attivo: domande oggettive in automatico, domande aperte con AI (voto 1-5) basata sulla knowledge base SSA. Genera una bozza per studente — l'esito ufficiale lo confermi tu."
                >
                  <Icon name="check" size={12} />
                  {correcting ? "Correggo…" : activeTab === "final" ? "Correggi" : `Correggi ${activeTab.replace("day", "giorno ")}`}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
      {correctionMsg && (
        <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "10px 0 0" }} role="status">
          {correctionMsg}
        </p>
      )}

      {!hasExam ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="text-3">Questo corso non prevede un esame.</p>
        </div>
      ) : results.length === 0 && !feedback ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <p className="text-3">
            Nessuna consegna ancora. I risultati appaiono qui quando gli studenti completano l&apos;esame dal link.
          </p>
        </div>
      ) : (
        <>
          {/* One tab per test type — no more final + day-tests mixed in one list. */}
          <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 16, borderBottom: "1px solid var(--border)" }}>
            {tabKeys.map((k) => {
              const count = k === "feedback" ? undefined : (byTest.get(k)?.length ?? 0);
              const active = k === activeTab;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active}
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setTab(k); setExpanded(null); }}
                  style={{
                    borderRadius: 0,
                    borderBottom: active ? "2px solid var(--indigo)" : "2px solid transparent",
                    color: active ? "var(--indigo-600)" : "var(--text-2)",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {testLabel(k)}
                  {count != null && (
                    <span className="text-3" style={{ marginLeft: 6, fontSize: 11, fontWeight: 400 }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === "feedback" ? (
            feedback ? (
              <FeedbackSummary data={feedback} />
            ) : (
              <div className="card card-pad" style={{ marginTop: 16 }}>
                <p className="text-3">Nessun feedback raccolto.</p>
              </div>
            )
          ) : tabRows.length === 0 ? (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <p className="text-3">Nessuna consegna per {testLabel(activeTab)}.</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Studente</th>
                    <th>Consegna</th>
                    <th style={{ textAlign: "right" }}>Auto %</th>
                    {showOutcome && <th>Esito attuale</th>}
                    {showOutcome && <th>Conferma esito</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tabRows.map((r) => (
                    <ResultRow
                      key={r.id}
                      r={r}
                      courseId={courseId}
                      draft={drafts[r.id]}
                      templateUpdatedAt={templateUpdatedAt}
                      absent={
                        presentMap
                          ? presentMap[
                              r.corsistaId != null ? `c${r.corsistaId}` : `p${r.partecipanteId}`
                            ] !== true && (r.corsistaId != null || r.partecipanteId != null)
                          : false
                      }
                      showOutcome={showOutcome}
                      expanded={expanded === r.id}
                      onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                      onChanged={onChanged}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {hasExam && (
        <SendResultsSection courseId={courseId} results={confirmed} adminEmail={adminEmail} emailsLive={emailsLive} />
      )}
    </div>
  );
}

// AI-grade an open answer, GROUNDED in the SSA knowledge base (advisory — the
// educator confirms). Surfaces score, whether it was grounded, and feedback.
// kbSection (the question's category) scopes retrieval to that KB chapter.
function AiGradeButton({
  prompt,
  answer,
  kbSection,
  label = "Valuta con AI",
}: {
  prompt: string;
  answer: string;
  kbSection?: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<GradeOpenResult | null>(null);
  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setRes(await gradeOpenAnswerAction({ prompt, studentAnswer: answer, maxPoints: 5, kbSection }));
            })
          }
        >
          <Icon name="sparkle" size={11} />
          {pending ? "Valuto…" : label}
        </button>
        {res && !res.ok && <span style={{ fontSize: 11.5, color: "var(--danger-fg)" }}>{res.error}</span>}
      </div>
      {res?.ok && (
        <div
          style={{
            marginTop: 5,
            padding: "8px 10px",
            background: "var(--indigo-50)",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.55,
            maxWidth: 720,
          }}
        >
          <strong>
            {res.vote != null ? `Voto AI: ${res.vote}/5 · ` : ""}
            {res.score}/5 punti
          </strong>{" "}
          · {res.grounded ? "✓ basato su KB" : "⚠ nessuna fonte KB"}
          {res.feedback && <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{res.feedback}</div>}
        </div>
      )}
    </div>
  );
}

// The batch draft's evaluation for one open answer — the SAME data the PDF
// shows, finally visible where the operator actually corrects. Full rationale,
// never truncated.
function DraftGradeBlock({ g }: { g: OpenGrade }) {
  return (
    <div
      style={{
        marginTop: 5,
        padding: "8px 10px",
        background: g.failed ? "var(--warning-bg)" : "var(--indigo-50)",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.55,
        maxWidth: 720,
      }}
    >
      {g.failed ? (
        <strong>⚠ Non valutata dall&apos;AI</strong>
      ) : (
        <>
          <strong>
            {g.vote != null ? `Voto AI: ${g.vote}/5 · ` : "AI: "}
            {g.points}/{g.maxPoints} punti
          </strong>{" "}
          · conf. {Math.round(g.confidence * 100)}% · {g.grounded ? "✓ basata su KB" : "⚠ nessuna fonte KB"}
        </>
      )}
      {g.rationale && <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{g.rationale}</div>}
      {g.citedTitles.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-4)" }}>Fonti: {g.citedTitles.join(" · ")}</div>
      )}
    </div>
  );
}

function ResultRow({
  r,
  courseId,
  draft,
  templateUpdatedAt,
  absent,
  showOutcome,
  expanded,
  onToggle,
  onChanged,
}: {
  r: GradedSubmission;
  courseId: string;
  /** The "Correggi" run's draft for this submission, when one exists. */
  draft?: CorrectionDraft;
  /** Latest template edit — a draft older than this is stale. */
  templateUpdatedAt?: string | null;
  /** The subject is NOT present at this test's roll call (owner's rule) —
   *  a submission from an absent student is an anomaly worth flagging. */
  absent?: boolean;
  /** Show the outcome + confirm columns. Only the "Esame" (final) tab does:
   *  the certification outcome is decided on the final exam and stored ONCE per
   *  student, so mini-test tabs never carry the confirm controls. */
  showOutcome: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // A row is confirmable when it belongs to an enrolled corsista OR a "doppio"
  // companion (each persists its outcome on its own table).
  const canGrade = r.enrollmentId != null || r.partecipanteId != null;

  // Template edited after the run → the draft graded different questions.
  const draftStale = Boolean(
    draft && templateUpdatedAt && Date.parse(templateUpdatedAt) > Date.parse(draft.at),
  );
  const draftGrade = (qid: string): OpenGrade | undefined =>
    draft?.openGrades?.find((g) => g.qid === qid);

  // Answers grouped by category (Storia / Produzione / …) for the detail view,
  // preserving the exam's question order (first appearance wins).
  const answerGroups: { label: string; items: typeof r.answers }[] = [];
  const groupIndex = new Map<string, number>();
  for (const a of r.answers) {
    const label = catLabel(a.cat);
    let idx = groupIndex.get(label);
    if (idx == null) {
      idx = answerGroups.length;
      groupIndex.set(label, idx);
      answerGroups.push({ label, items: [] });
    }
    answerGroups[idx].items.push(a);
  }
  const colSpan = showOutcome ? 6 : 4;

  const grade = (outcome: ExamOutcome) => {
    if (!canGrade) {
      setErr("Studente non trovato tra gli iscritti — impossibile registrare l'esito.");
      return;
    }
    setErr(null);
    start(async () => {
      // Persist the objective % only when it's meaningful AND matches the chosen
      // outcome — otherwise the result certifies the outcome alone (no "0%" for an
      // all-manual exam, no contradictory "Bocciato 85%" on an override).
      const score = certifiedScore(r.gradable, r.autoScore, outcome);
      const res =
        r.enrollmentId != null
          ? await gradeEnrollmentAction(r.enrollmentId, outcome, score, courseId)
          : await gradePartecipanteAction(r.partecipanteId!, outcome, score, courseId);
      if (res.ok) {
        // Embedded in a tab, the client-loaded data needs an explicit re-fetch;
        // on the standalone page, router.refresh() re-runs the server load.
        if (onChanged) onChanged();
        else router.refresh();
      } else setErr(res.error || "Errore");
    });
  };

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>
          {r.studentName}
          {r.partecipanteId != null && (
            <span className="text-3" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 400, fontStyle: "italic" }}>
              (ospite)
            </span>
          )}
          {absent && (
            <span
              style={{ marginLeft: 6, display: "inline-block" }}
              title="Consegna presente ma lo studente risulta assente all'appello di questo test — verifica l'appello."
            >
              <Badge tone="warning">Assente all&apos;appello</Badge>
            </span>
          )}
          <div className="text-3" style={{ fontSize: 11, fontWeight: 400 }}>{r.studentEmail || "—"}</div>
        </td>
        <td className="text-3" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
          {new Date(r.submittedAt).toLocaleDateString("it-IT")}
        </td>
        <td style={{ textAlign: "right", fontWeight: 700, color: r.gradable > 0 ? scoreColor(r.autoScore) : "var(--text-3)" }}>
          {r.gradable > 0 ? `${r.autoScore}%` : "—"}
          {r.manualCount > 0 && (
            <div className="text-3" style={{ fontSize: 10, fontWeight: 400 }}>+{r.manualCount} aperte</div>
          )}
        </td>
        {showOutcome && (
          <td>
            {r.currentResult ? (
              <Badge tone={OUTCOME_TONE[r.currentResult] ?? "neutral"} dot>
                {OUTCOME_LABEL[r.currentResult] ?? r.currentResult}
                {r.currentScore != null ? ` ${r.currentScore}%` : ""}
              </Badge>
            ) : (
              <span className="text-3" style={{ fontStyle: "italic", fontSize: 12 }}>da confermare</span>
            )}
            {draft && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Badge tone={OUTCOME_TONE[draft.verdict] ?? "neutral"}>
                  Bozza: {OUTCOME_LABEL[draft.verdict] ?? draft.verdict} {draft.combinedPct}%
                  {draft.totals.openFailed > 0 ? ` · parziale (${draft.totals.openFailed} da rivedere)` : ""}
                </Badge>
                <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                  {new Date(draft.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                {draftStale && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--warning-fg)" }} title="Il template è stato modificato dopo questa bozza: riesegui Correggi.">
                    obsoleta — riesegui Correggi
                  </span>
                )}
                <a
                  href={`/api/esami/${courseId}/bozza?sub=${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11.5, fontWeight: 600, color: "var(--indigo-600)" }}
                >
                  Bozza PDF ↗
                </a>
              </div>
            )}
          </td>
        )}
        {showOutcome && (
          <td>
              <div style={{ display: "inline-flex", gap: 4 }}>
                {(["passed", "retrial", "failed"] as ExamOutcome[]).map((o) => {
                  const stem = OUTCOME_STEM[o];
                  const confirmed = r.currentResult === o;
                  const suggested = r.gradable > 0 && r.suggested === o;
                  return (
                    <button
                      key={o}
                      className="btn btn-xs"
                      disabled={pending || !canGrade}
                      onClick={() => grade(o)}
                      title={
                        !canGrade
                          ? "Studente non iscritto"
                          : confirmed
                            ? `Esito confermato: ${OUTCOME_LABEL[o]}`
                            : r.gradable === 0
                              ? "Valutazione manuale — nessuna domanda a correzione automatica"
                              : `Suggerito: ${OUTCOME_LABEL[r.suggested]}`
                      }
                      style={{
                        // Confirmed = filled (the saved outcome); suggested = outline hint.
                        background: confirmed ? `var(--${stem}-bg)` : undefined,
                        borderColor: confirmed || suggested ? `var(--${stem}-fg)` : undefined,
                        color: confirmed ? `var(--${stem}-fg)` : undefined,
                        fontWeight: confirmed || suggested ? 700 : 400,
                      }}
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  );
                })}
              </div>
              {err && <div style={{ color: "var(--danger-fg)", fontSize: 11, marginTop: 4 }}>{err}</div>}
          </td>
        )}
        <td>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onToggle} title="Vedi risposte">
            <Icon name={expanded ? "chevron-d" : "chevron"} size={13} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={colSpan} style={{ background: "var(--surface-2)", padding: 0 }}>
            <div style={{ padding: "12px 18px", display: "grid", gap: 14 }}>
              {answerGroups.map((group) => (
                <div key={group.label} style={{ display: "grid", gap: 6 }}>
                  {/* Category header — Storia / Produzione / Degustazione / … */}
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 3,
                    }}
                  >
                    {group.label}
                    <span style={{ marginLeft: 6, fontWeight: 400 }}>{group.items.length}</span>
                  </div>
                  {group.items.map((a, i) => (
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
                          {a.ok === null && !draftGrade(a.qid) && <> · <em>valutazione manuale</em></>}
                        </div>
                        {a.ok === null && draftGrade(a.qid) && <DraftGradeBlock g={draftGrade(a.qid)!} />}
                        {a.ok === null &&
                          (a.type === "open" || a.type === "fill") &&
                          a.given &&
                          a.given !== "—" && (
                            <AiGradeButton
                              prompt={a.text}
                              answer={a.given}
                              kbSection={a.cat}
                              label={draftGrade(a.qid) ? "Rivaluta" : "Valuta con AI"}
                            />
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
