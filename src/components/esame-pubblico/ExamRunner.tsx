"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitExam, getLinkStateAction } from "@/lib/exam-links/actions";
import { gradeAnswers } from "@/lib/exam-links/grading";
import { CHROME, EMAIL_RE, LANGS, type Lang } from "./exam-chrome";
import { EsitoCard } from "./EsitoCard";
import type { DayEsito } from "@/lib/exam-links/esito";
import { QuestionInput, RegInput } from "./exam-inputs";

export interface RunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Stored EN/JA translations (one-time, via Claude). */
  i18n?: Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
  /** Correct answers — option INDICES for choice questions, accepted STRINGS for
   *  "fill". Present only in validate mode. */
  correct?: Array<number | string>;
  /** Image URL for "image" (identify) questions. */
  image?: string;
}

/** Render a question in the chosen language, falling back to the original (IT). */
function localizeQ(q: RunnerQuestion, lang: "it" | "en" | "ja"): RunnerQuestion {
  if (lang === "it") return q;
  const tr = q.i18n?.[lang];
  if (!tr) return q;
  return { ...q, text: tr.text || q.text, options: tr.options?.length ? tr.options : q.options };
}
export interface RunnerHeader {
  courseName: string;
  testLabel: string;
  place: string;
  date: string;
  educator: string;
}

const LANG_LABEL: Record<Lang, string> = { it: "Italiano", en: "English", ja: "日本語" };

// Block copy/cut/right-click/drag on exam CONTENT (anti-cheat deterrent for
// question text, also active in previews). NOTE: paste/drop are NOT handled
// here — they're blocked shell-wide by the exam-mode `lockdown` spread below,
// which also covers inputs outside these containers (e.g. the notes pad).
const noCopy = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => {
    // Ordering answers ARE drag&drop — their rows (data-order-idx) must be
    // allowed to drag; everything else stays blocked.
    if ((e.target as HTMLElement).closest?.("[data-order-idx]")) return;
    e.preventDefault();
  },
};

export type RegField =
  | "name"
  | "gender"
  | "nationality"
  | "email"
  | "phone"
  | "address"
  | "dob"
  | "occupation"
  | "residency";
const REG_ORDER: RegField[] = ["name", "gender", "nationality", "email", "phone", "address"];

type Step =
  | { kind: "reg"; field: RegField }
  | { kind: "q"; q: RunnerQuestion };

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Real exams are TIMED — the limit comes from the page by test type (owner
 *  batch 9: day tests 10', final/feedback 60') with a "time left" notice near
 *  the end (10' before on long tests, 2' on short ones). `elapsed` is
 *  persisted, so the limit survives a disconnect/resume — reloading buys no
 *  extra time. At the limit the test HANDS ITSELF IN with whatever is
 *  answered. Only the real "exam" mode is timed (not test/validate). */
const DEFAULT_LIMIT_S = 60 * 60;

export interface ResumeState {
  answers: Record<string, string[] | string>;
  currentIdx: number;
  lang?: string;
  elapsed: number;
}
export interface PersistState {
  answers: Record<string, string[] | string>;
  currentIdx: number;
  lang: string;
  elapsed: number;
  /** Set once the submission succeeded — a resumed state with this flag must
   *  NEVER re-enter the runner (the gate shows "Esame già consegnato"). */
  submitted?: boolean;
}

export function ExamRunner({
  mode,
  forcedLang,
  collectRegistration,
  registrationFields,
  reveal,
  header,
  questions,
  token,
  resumeState,
  onPersist,
  onSubmitSession,
  showResult,
  isFinal,
  limitS,
}: {
  mode: "exam" | "test" | "validate";
  forcedLang?: string;
  collectRegistration?: boolean;
  /** Explicit registration fields to collect (overrides collectRegistration).
   *  Used by the FINAL exam to gather the SSA-London anagraphics (gender,
   *  nationality, DOB, occupation, residency) from bound students. */
  registrationFields?: RegField[];
  reveal?: boolean;
  /** True only for the FINAL exam — day tests end with a plain "Grazie". */
  isFinal?: boolean;
  header: RunnerHeader;
  questions: RunnerQuestion[];
  /** Signed exam token — required to persist a real ("exam") submission. */
  token?: string;
  /** Restore in-progress state on resume (proctored session). */
  resumeState?: ResumeState;
  /** Called (debounced + periodic) to persist progress server-side. */
  onPersist?: (s: PersistState) => void;
  /** Submit override (resumable session). When set, replaces the legacy submit. */
  onSubmitSession?: (final: PersistState) => Promise<{ ok: boolean; error?: string }>;
  /** Preview: at the end, compute + show the outcome instead of a thank-you. */
  showResult?: boolean;
  /** Time limit in seconds for the timed ("exam") mode. Day tests get 10'. */
  limitS?: number;
}) {
  // Only offer a non-Italian language when EVERY question is fully translated into
  // it (text + all options). Otherwise the student would silently receive Italian
  // questions — and their answers couldn't be graded. Italian is always available.
  const fullyTranslated = (l: "en" | "ja"): boolean =>
    questions.length > 0 &&
    questions.every((q) => {
      const tr = q.i18n?.[l];
      return !!tr?.text && (q.options.length === 0 || (tr.options?.length ?? 0) >= q.options.length);
    });
  const availableLangs: Lang[] = LANGS.filter((l) => l === "it" || fullyTranslated(l as "en" | "ja"));
  const canUse = (l: string | null | undefined): boolean => !!l && availableLangs.includes(l as Lang);

  // Language is the FIRST step (a gate), unless forced by the link or resumed — but
  // never force/resume into a language the exam isn't actually translated into.
  const forced = canUse(forcedLang) ? (forcedLang as Lang) : null;
  const resumedLang = canUse(resumeState?.lang) ? (resumeState?.lang as Lang) : null;
  const [lang, setLang] = useState<Lang>(resumedLang ?? forced ?? "it");
  const [langPicked, setLangPicked] = useState<boolean>(Boolean(forced) || Boolean(resumedLang));
  const [idx, setIdx] = useState(resumeState?.currentIdx ?? 0);
  const [answers, setAnswers] = useState<Record<string, string[] | string>>(
    resumeState?.answers ?? {},
  );
  const [done, setDone] = useState(false);
  // Formative day-test result returned by submitExam (owner, batch 7).
  const [esito, setEsito] = useState<DayEsito | null>(null);
  // Live "the educator closed this test" push (owner batch 8): polled while
  // the exam is open so an already-open page reacts within seconds.
  const [closedLive, setClosedLive] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string[] | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  // Personal scratchpad — constant across questions, never submitted/saved.
  const [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(resumeState?.elapsed ?? 0);
  // Timed exam (real "exam" mode only). Init "already warned" when resuming past 50'
  // so the "10 minutes left" pop-up doesn't fire late on a reconnect.
  const timed = mode === "exam" && !showResult;
  // Long tests warn 10' before the end, short (day) tests 2' before.
  const limit = limitS ?? DEFAULT_LIMIT_S;
  const warnAt = limit - (limit > 30 * 60 ? 10 * 60 : 2 * 60);
  const warnMin = Math.round((limit - warnAt) / 60);
  const resumedPastWarn = (resumeState?.elapsed ?? 0) >= warnAt;
  const [warned, setWarned] = useState(resumedPastWarn);
  const [warnAck, setWarnAck] = useState(resumedPastWarn);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Server said "duplicate": the exam was ALREADY submitted earlier and the
  // re-sent answers were discarded → show "già consegnato", not a thank-you.
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const t = CHROME[lang];

  // ── Exam-mode clipboard lockdown (anti-cheat) ──────────────────────────────
  // Capture-phase so it covers EVERY input inside the shell — including the
  // notes pad, which lives outside the noCopy-protected question containers.
  // Paste/drop would let a student bring prepared text in; copy/cut would let
  // question text out via the notes. Previews (test/validate) keep normal
  // clipboard behavior; the email gate lives outside the runner entirely.
  const lockdown =
    mode === "exam"
      ? {
          onPasteCapture: (e: React.ClipboardEvent) => e.preventDefault(),
          onDropCapture: (e: React.DragEvent) => {
            // Dropping onto an ordering row is answering, not pasting — but
            // only for the INTERNAL row drag. An external link/file drop must
            // stay cancelled even there: its browser default NAVIGATES away
            // from the exam.
            const types = Array.from(e.dataTransfer?.types ?? []);
            const external = types.includes("text/uri-list") || types.includes("Files");
            if (!external && (e.target as HTMLElement).closest?.("[data-order-idx]")) return;
            e.preventDefault();
          },
          onCopyCapture: (e: React.ClipboardEvent) => e.preventDefault(),
          onCutCapture: (e: React.ClipboardEvent) => e.preventDefault(),
          onContextMenuCapture: (e: React.MouseEvent) => e.preventDefault(),
        }
      : {};

  // Keep the latest state in a ref for the periodic persist (avoids stale closure).
  const stateRef = useRef<PersistState>({ answers, currentIdx: idx, lang, elapsed });
  stateRef.current = { answers, currentIdx: idx, lang, elapsed };
  // Hold onPersist in a ref so the save effects DON'T depend on its identity —
  // otherwise a parent re-render giving a new callback would restart the 15s
  // interval from zero every time and could silently stop periodic saving.
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  // Set synchronously the moment a submit starts, so no stray persist fires
  // around submission (the server also guards, but this stops the spam entirely).
  const finishingRef = useRef(false);
  const flush = useCallback(() => {
    if (!onPersistRef.current || !langPicked || done || finishingRef.current) return;
    onPersistRef.current(stateRef.current);
  }, [langPicked, done]);

  // Persist on content change (debounced) + periodically (captures the clock).
  useEffect(() => {
    if (!langPicked || done || finishingRef.current) return;
    const id = setTimeout(() => onPersistRef.current?.(stateRef.current), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, idx, lang, langPicked, done]);
  useEffect(() => {
    if (!langPicked || done) return;
    const id = setInterval(() => {
      if (!finishingRef.current) onPersistRef.current?.(stateRef.current);
    }, 15000);
    return () => clearInterval(id);
  }, [langPicked, done]);

  // Last-chance flush: the 1s debounce can strand the most recent answer when the
  // tab is hidden/closed or the network drops. Saving on visibilitychange (fires
  // BEFORE the tab is frozen on mobile) and on pagehide shrinks that loss window
  // so a reconnect resumes from the very last edit, not up to a second earlier.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  // Persist the instant the language is locked in (not on the 1s debounce), so a
  // reconnect in that first second resumes the chosen language + running clock
  // instead of dropping the student back to the language picker.
  useEffect(() => {
    if (langPicked) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langPicked]);

  // Finish: resumable session → onSubmitSession; preview → just show the result
  // screen; legacy real exam → submitExam; test/validate without result → done.
  const finish = async () => {
    if (onSubmitSession) {
      finishingRef.current = true; // stop autosave before the submit round-trip
      setSubmitting(true);
      setSubmitError(false);
      try {
        // Pass the LATEST client state (not the ≤1s-debounced server copy) so the
        // student's final answer/change is always part of the graded submission.
        const r = await onSubmitSession(stateRef.current);
        if (r.ok) setDone(true);
        else {
          setSubmitError(true);
          finishingRef.current = false; // allow autosave to resume if they retry
        }
      } catch {
        setSubmitError(true);
        finishingRef.current = false;
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (showResult || mode !== "exam" || !token) {
      setDone(true);
      return;
    }
    finishingRef.current = true; // stop autosave before the submit round-trip
    setSubmitting(true);
    setSubmitError(false);
    try {
      const r = await submitExam(token, { answers, lang, elapsed });
      if (r.ok) {
        // Mark the persisted resume state as SUBMITTED (bypassing the flush
        // guard) so a refresh lands on "Esame già consegnato" instead of back
        // inside the questions. The server page-load gate is the authority;
        // this is the instant same-device layer.
        onPersistRef.current?.({ ...stateRef.current, submitted: true });
        if (r.alreadySubmitted) setAlreadySubmitted(true);
        if (r.esito) setEsito(r.esito);
        setDone(true);
      } else {
        setSubmitError(true);
        finishingRef.current = false; // allow autosave to resume for a retry
      }
    } catch {
      setSubmitError(true);
      finishingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (mode !== "exam" || done || !token) return;
    const id = setInterval(() => {
      getLinkStateAction(token)
        .then((r) => {
          if (r.ok && r.closed) setClosedLive(true);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [mode, done, token]);

  // Clock — ticks once the language is chosen. Pauses on the submit-error screen
  // so a stuck "Riprova" state doesn't keep inflating the elapsed time.
  // Anchored to the WALL CLOCK, not to interval counts: a background tab or a
  // locked phone throttles timers, and a drifting count would grant extra time
  // past the hard limit. Each (re)activation re-anchors at the current elapsed.
  useEffect(() => {
    if (!langPicked || done || submitError) return;
    const t0 = Date.now();
    const base = stateRef.current.elapsed;
    const sync = () => setElapsed(base + Math.floor((Date.now() - t0) / 1000));
    const id = setInterval(sync, 1000);
    // Throttled background timers can delay the catch-up tick — coming back
    // to the tab must settle the clock (and a due hard stop) immediately.
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langPicked, done, submitError]);

  // Timed exam: "time left" notice near the end, HARD STOP at the limit — the
  // test hands itself in with whatever has been answered (owner batch 9).
  useEffect(() => {
    if (!timed || !langPicked || done || submitError) return;
    if (elapsed >= warnAt && elapsed < limit && !warned) setWarned(true);
    if (elapsed >= limit && !finishingRef.current) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, timed, langPicked, done, submitError, warned]);

  // Flatten the flow: registration fields (final exam only) + graded questions.
  const steps = useMemo<Step[]>(() => {
    // Explicit field list (e.g. the final exam's SSA-London anagraphics for
    // bound students) wins; otherwise the legacy full set when enabled.
    const fields = registrationFields ?? (collectRegistration ? REG_ORDER : []);
    const reg: Step[] = fields.map((field) => ({ kind: "reg", field }) as Step);
    return [...reg, ...questions.map((q) => ({ kind: "q", q }) as Step)];
  }, [collectRegistration, registrationFields, questions]);

  const total = steps.length;
  // Clamp a resumed/stale idx into range (defensive: the question set could have
  // shrunk between sessions). `step` falls back so the render never reads undefined.
  const safeIdx = total > 0 ? Math.min(Math.max(0, idx), total - 1) : 0;
  const step = steps[safeIdx];
  useEffect(() => {
    if (total > 0 && idx > total - 1) setIdx(total - 1);
  }, [total, idx]);

  const setAnswer = (key: string, val: string[] | string) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  // ── Header (course + timer) ──────────────────────────────────────────────
  const headerBar = (
    <header className="exam-public-head" {...noCopy}>
      <div className="exam-public-head-top">
        <span className="exam-public-brand">SSA</span>
        {mode === "test" && <span className="exam-public-testbadge">{t.test}</span>}
        {mode === "validate" && (
          <span className="exam-public-testbadge" style={{ background: "#e8f6ee", color: "#1a7f43" }}>
            VALIDAZIONE
          </span>
        )}
        {langPicked && (
          <span
            className="exam-public-clock"
            aria-label="timer"
            style={timed && elapsed >= warnAt ? { color: "#b42318", fontWeight: 700 } : undefined}
          >
            ⏱ {timed ? fmtClock(Math.max(0, limit - elapsed)) : fmtClock(elapsed)}
          </span>
        )}
      </div>
      <h1 className="exam-public-course">{header.courseName}</h1>
      <div className="exam-public-meta">
        <span>{header.testLabel}</span>
        <span aria-hidden>·</span>
        <span>{header.place}</span>
        <span aria-hidden>·</span>
        <span>{header.date}</span>
        {header.educator && (
          <>
            <span aria-hidden>·</span>
            <span>
              {t.educator}: {header.educator}
            </span>
          </>
        )}
      </div>
    </header>
  );

  // ── Step 0: language gate ────────────────────────────────────────────────
  if (!langPicked) {
    return (
      <div className="exam-public-shell" {...lockdown}>
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-q" {...noCopy}>
            <p className="exam-public-q-text">{CHROME[lang].chooseLang}</p>
            {/* The choice is FINAL (owner batch 9): it follows the student
                across devices and there is no way back — say so up front.
                The warning follows the currently highlighted language. */}
            <p
              style={{
                fontSize: 12.5,
                color: "#92400e",
                background: "#fef3c7",
                borderRadius: 10,
                padding: "8px 12px",
                margin: "0 0 12px",
                lineHeight: 1.5,
              }}
            >
              ⚠️ {CHROME[lang].langWarn}
            </p>
            <div className="exam-public-options">
              {availableLangs.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`exam-public-opt ${l === lang ? "selected" : ""}`}
                  onClick={() => setLang(l)}
                >
                  <span className="exam-public-opt-mark" aria-hidden>
                    {l === lang ? "●" : "○"}
                  </span>
                  <span>{LANG_LABEL[l]}</span>
                </button>
              ))}
            </div>
            {/* Staff previews only: say WHY a language is missing instead of
                hiding it silently (the picker itself never lies to students). */}
            {mode !== "exam" && availableLangs.length < LANGS.length && (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 10 }}>
                {LANGS.filter((l) => l !== "it" && !availableLangs.includes(l))
                  .map((l) => {
                    const n = questions.filter((q) => {
                      const tr = q.i18n?.[l as "en" | "ja"];
                      return !(tr?.text && (q.options.length === 0 || (tr.options?.length ?? 0) >= q.options.length));
                    }).length;
                    return `${l.toUpperCase()} non offerta: ${n} ${n === 1 ? "domanda" : "domande"} senza traduzione completa`;
                  })
                  .join(" · ")}{" "}
                — usa “Traduci (AI)” nella Libreria esami.
              </p>
            )}
          </div>
          <div className="exam-public-nav">
            <span />
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() => setLangPicked(true)}
            >
              {CHROME[lang].start}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Save failed — answers NOT persisted; let the student retry ───────────
  if (submitError) {
    return (
      <div className="exam-public-shell" {...lockdown}>
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-thanks">
            <div className="exam-public-thanks-check" style={{ background: "#fde8e6", color: "#b42318" }}>!</div>
            <h2>{t.saveErrTitle}</h2>
            <p>{t.saveErrBody}</p>
            <button
              type="button"
              className="exam-public-btn primary"
              style={{ marginTop: 16 }}
              onClick={() => void finish()}
              disabled={submitting}
            >
              {submitting ? "…" : t.retry}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Closed by the educator while the page was open → replace the exam with an
  // honest screen (answers stay in localStorage/server if they re-open later).
  if (closedLive && !done) {
    return (
      <div className="exam-public-shell" {...lockdown}>
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-thanks">
            <div className="exam-public-thanks-check">✕</div>
            <h2>{t.closedTitle}</h2>
            <p>{t.closedBody}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Done / empty ─────────────────────────────────────────────────────────
  if (done || total === 0) {
    // Complete preview → show the computed outcome using the SAME pure grader as
    // the real correction (exam-links/grading), so the preview can never disagree
    // with what the operator will see in the Esiti tab.
    if (showResult && total > 0) {
      const { gradable, correct, manual } = gradeAnswers(questions, answers, lang);
      // No auto-gradable questions → don't fake a 0% "failed"; show a neutral note.
      if (gradable === 0) {
        return (
          <div className="exam-public-shell">
            <div className="exam-public-card">
              {headerBar}
              <div className="exam-public-thanks" {...noCopy}>
                <h2 style={{ marginBottom: 14 }}>{t.previewTitle}</h2>
                <p style={{ fontSize: 14, color: "var(--text-2, #374151)" }}>{t.previewNotGradable}</p>
                {manual > 0 && (
                  <p style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", marginTop: 6 }}>
                    {manual} {t.previewManual}
                  </p>
                )}
                <p style={{ fontSize: 12.5, color: "var(--text-4, #9ca3af)", marginTop: 10 }}>{t.previewNote}</p>
              </div>
            </div>
          </div>
        );
      }
      const pct = Math.round((correct / gradable) * 100);
      // Mirror the real three-tier outcome: pass ≥80, retrial ≥70, else fail.
      const outcome = pct >= 80 ? "passed" : pct >= 70 ? "retrial" : "failed";
      const accent = outcome === "passed" ? "#15803d" : outcome === "retrial" ? "#b45309" : "#b42318";
      const outcomeLabel = outcome === "passed" ? t.previewPassed : outcome === "retrial" ? t.previewRetrial : t.previewFailed;
      return (
        <div className="exam-public-shell">
          <div className="exam-public-card">
            {headerBar}
            <div className="exam-public-thanks" {...noCopy}>
              <h2 style={{ marginBottom: 14 }}>{t.previewTitle}</h2>
              <div
                style={{
                  border: `2px solid ${accent}`,
                  borderRadius: 12,
                  padding: "18px 22px",
                  margin: "0 auto 14px",
                  maxWidth: 320,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: accent }}>
                  {t.previewScore}
                </div>
                <div style={{ fontSize: 46, fontWeight: 800, color: accent, lineHeight: 1.05, margin: "4px 0" }}>{pct}%</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{outcomeLabel}</div>
                <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)", marginTop: 8 }}>
                  {correct}/{gradable}
                  {manual > 0 ? ` · ${manual} ${t.previewManual}` : ""}
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-4, #9ca3af)" }}>{t.previewNote}</p>
            </div>
          </div>
        </div>
      );
    }
    // The server discarded this hand-in as a DUPLICATE (already submitted
    // earlier): say so honestly — the edited answers were NOT recorded.
    if (alreadySubmitted) {
      return (
        <div className="exam-public-shell" {...lockdown}>
          <div className="exam-public-card">
            {headerBar}
            <div className="exam-public-thanks">
              <div className="exam-public-thanks-check">✓</div>
              <h2>{t.submittedTitle}</h2>
              <p>{t.submittedBody}</p>
            </div>
          </div>
        </div>
      );
    }
    // Day test handed in → formative result card (score + per-answer review +
    // KB deep-dives). The FINAL exam never shows its outcome here.
    if (esito && !isFinal) {
      return (
        <div className="exam-public-shell" {...lockdown}>
          <div className="exam-public-card">
            {headerBar}
            <EsitoCard esito={esito} lang={lang} token={token} returnNote />
          </div>
        </div>
      );
    }
    return (
      <div className="exam-public-shell" {...lockdown}>
        <div className="exam-public-card">
          {headerBar}
          <div className="exam-public-thanks">
            <div className="exam-public-thanks-check">✓</div>
            {/* Only the FINAL exam is "certified". A day test (timed but not
                final) ends with a plain "Grazie" and no certified/result line. */}
            <h2>{timed ? (isFinal ? t.certDoneTitle : t.dayDoneTitle) : t.thanksTitle}</h2>
            {(() => {
              const body =
                total === 0 ? t.empty : timed ? (isFinal ? t.certDoneBody : "") : t.thanksBody;
              return body ? <p>{body}</p> : null;
            })()}
          </div>
        </div>
      </div>
    );
  }

  const pct = Math.round(((idx + 1) / total) * 100);

  // All unanswered GRADED questions (registration is optional, never "skipped").
  // Drives the pre-finish warning and the review-mode navigation.
  const unansweredNums = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === "q")
    .filter(({ s }) => {
      const q = (s as { q: RunnerQuestion }).q;
      const a = answers[q.id];
      return a === undefined || (Array.isArray(a) ? a.length === 0 : a === "");
    })
    .map(({ i }) => i);

  // The chip navigator shows only questions you've actually SKIPPED — moved PAST
  // without answering. A question ahead of you that you simply haven't reached
  // yet is NOT skipped, so this stays empty until you skip one (instead of
  // dumping every remaining question on screen). In review mode it lists every
  // still-unanswered question so you can jump straight to any of them.
  const skippedChips = (reviewMode ? unansweredNums : unansweredNums.filter((i) => i < idx)).map(
    String,
  );

  // Review-mode navigation cycles through ALL remaining unanswered questions.
  const nextSkipped = unansweredNums.find((n) => n > idx);
  const prevSkipped = [...unansweredNums].reverse().find((n) => n < idx);

  const goFinish = () => {
    if (unansweredNums.length > 0) setPendingPrompt(unansweredNums.map(String));
    else void finish();
  };

  const enterReview = (target?: number) => {
    setReviewMode(true);
    setPendingPrompt(null);
    if (target != null) setIdx(target);
  };

  // Block "Avanti" while sitting on the email step with an invalid address.
  const curEmail =
    step.kind === "reg" && step.field === "email"
      ? (answers["reg:email"] as string | undefined)
      : undefined;
  const emailInvalid =
    typeof curEmail === "string" && curEmail.trim() !== "" && !EMAIL_RE.test(curEmail.trim());
  const atLast = idx === total - 1;

  return (
    <div className="exam-public-shell" {...lockdown}>
      {timed && warned && !warnAck && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 300,
            padding: 20,
          }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", maxWidth: 360, textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 34, marginBottom: 6 }} aria-hidden>⏳</div>
            <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>{t.timeWarnTitle.replace("{m}", String(warnMin))}</h2>
            <p style={{ fontSize: 14, color: "var(--text-3, #555)", margin: "0 0 18px" }}>{t.timeWarnBody.replace("{m}", String(warnMin))}</p>
            <button type="button" className="exam-public-btn primary" onClick={() => setWarnAck(true)}>
              OK
            </button>
          </div>
        </div>
      )}
      <div className="exam-public-card">
        {headerBar}

        <div className="exam-public-progress" aria-hidden>
          <div className="exam-public-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="exam-public-counter">
          {t.question} {idx + 1} {t.of} {total} · {idx + 1}/{total}
        </div>

        {/* Skipped-question tags — jump straight to a question you moved past. */}
        {skippedChips.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              padding: "8px 0 2px",
              position: "sticky",
              top: 0,
              zIndex: 2,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>
              {t.skipped} ({skippedChips.length}):
            </span>
            {skippedChips.map((si) => {
              const n = Number(si);
              const cur = n === idx;
              return (
                <button
                  key={si}
                  type="button"
                  onClick={() => enterReview(n)}
                  style={{
                    minWidth: 30,
                    padding: "3px 9px",
                    borderRadius: 999,
                    border: "1px solid #f59e0b",
                    background: cur ? "#f59e0b" : "#fff7ed",
                    color: cur ? "#fff" : "#b45309",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {n + 1}
                </button>
              );
            })}
          </div>
        )}
        {reviewMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: unansweredNums.length === 0 ? "#1a7f43" : "#b45309",
              margin: "4px 0",
            }}
          >
            <span>
              {unansweredNums.length === 0 ? t.allReviewed : `${t.reviewing} · ${unansweredNums.length}`}
            </span>
            <button
              type="button"
              onClick={() => setReviewMode(false)}
              style={{ fontSize: 12, color: "var(--text-3, #6b7280)", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
            >
              {t.exitReview}
            </button>
          </div>
        )}

        <div className="exam-public-q" {...noCopy}>
          {step.kind === "reg" ? (
            <RegInput
              field={step.field}
              t={t}
              value={answers["reg:" + step.field]}
              onChange={(v) => setAnswer("reg:" + step.field, v)}
            />
          ) : (
            (() => {
              const lq = localizeQ(step.q, lang);
              return (
                <>
                  <p className="exam-public-q-text">{lq.text}</p>
                  {lq.type === "image" && lq.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lq.image}
                      alt=""
                      style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, margin: "8px 0 14px", objectFit: "contain" }}
                    />
                  )}
                  <QuestionInput
                    q={lq}
                    value={answers[step.q.id]}
                    onChange={(v) => setAnswer(step.q.id, v)}
                    answerLabel={t.yourAnswer}
                    dragHint={t.dragHint}
                    reveal={reveal}
                  />
                </>
              );
            })()
          )}
        </div>

        <div className="exam-public-nav">
          <button
            type="button"
            className="exam-public-btn ghost"
            onClick={() =>
              reviewMode && prevSkipped != null
                ? setIdx(prevSkipped)
                : setIdx((i) => Math.max(0, i - 1))
            }
            disabled={reviewMode ? prevSkipped == null : idx === 0}
          >
            {t.back}
          </button>
          {(reviewMode ? nextSkipped != null : !atLast) && (
            <button
              type="button"
              className="exam-public-btn primary"
              onClick={() =>
                reviewMode && nextSkipped != null
                  ? setIdx(nextSkipped)
                  : setIdx((i) => Math.min(total - 1, i + 1))
              }
              disabled={emailInvalid}
            >
              {t.next}
            </button>
          )}
          {/* "Ho finito": active on the last step (normal) or once no skipped
              question remains (review mode). */}
          <button
            type="button"
            className="exam-public-btn"
            onClick={goFinish}
            disabled={
              (reviewMode ? unansweredNums.filter((n) => n !== idx).length > 0 : !atLast) || submitting
            }
            style={
              (reviewMode ? unansweredNums.filter((n) => n !== idx).length === 0 : atLast)
                ? { background: "#f59e0b", borderColor: "#f59e0b", color: "#fff" }
                : { opacity: 0.45 }
            }
          >
            {submitting ? "…" : t.iDone}
          </button>
        </div>

        {/* Personal notes — constant across questions, never saved/submitted.
            Always open: it's there the instant you want to jot something down. */}
        <div style={{ borderTop: "1px solid var(--border, #ececf1)", marginTop: 10, paddingTop: 8 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-2, #374151)",
            }}
          >
            📝 {t.notesTitle}
          </div>
          <div style={{ marginTop: 8 }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={t.notesTitle}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: 8,
                border: "1px solid var(--border, #d4d4d8)",
                padding: "8px 10px",
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-4, #9ca3af)", marginTop: 4 }}>
              {t.notesHint}
            </div>
          </div>
        </div>
      </div>

      {/* Skipped-question review prompt */}
      {pendingPrompt && (
        <div className="exam-public-modal-backdrop">
          <div className="exam-public-modal">
            <h3>{t.pendingTitle}</h3>
            <p>{t.pendingBody.replace("{n}", String(pendingPrompt.length))}</p>
            <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)", margin: "2px 0 6px" }}>
              {t.emptyListTitle}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {pendingPrompt.map((si) => (
                <button
                  key={si}
                  type="button"
                  className="exam-public-btn ghost"
                  style={{ padding: "4px 11px", fontSize: 13, minWidth: 0 }}
                  onClick={() => enterReview(Number(si))}
                >
                  {t.question} {Number(si) + 1}
                </button>
              ))}
            </div>
            <div className="exam-public-modal-actions">
              <button
                className="exam-public-btn ghost"
                onClick={() => {
                  setPendingPrompt(null);
                  void finish();
                }}
              >
                {t.finishAnyway}
              </button>
              <button
                className="exam-public-btn primary"
                onClick={() => enterReview(Number(pendingPrompt[0]))}
              >
                {t.review}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
