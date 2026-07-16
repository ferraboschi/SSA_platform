"use client";

// Entry for the public exam link.
//  • Preview (test/validate) → straight to the runner (page sets reveal/showResult).
//  • Real exam, PERSONAL link (token carries the bound corsista `s`) → straight to
//    the runner; identity is written server-side from `s` at submit. Progress is
//    resumed from this browser (localStorage) so a refresh/disconnect never loses
//    answers.
//  • Real exam, SHARED class link (no `s`) → EMAIL GATE: the student enters the
//    email they confirmed at course start; on a match the server mints a PERSONAL
//    link and we redirect to it. No roster is ever exposed and there is no
//    name-pick (both were impersonation / PII-leak surfaces).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExamRunner,
  type RunnerQuestion,
  type RunnerHeader,
  type PersistState,
} from "./ExamRunner";
import {
  resolveExamAccessByEmailAction,
  type ResolveExamAccessResult,
} from "@/lib/exam-links/access-actions";
import { reportExamProgressAction } from "@/lib/exam-links/progress-actions";
import { CHROME, LANGS, type Lang } from "./exam-chrome";

// The link's forced language drives the pre-exam screens (the student hasn't
// picked a language yet at this stage). Fall back to Italian.
function resolveGateLang(forcedLang?: string): Lang {
  return LANGS.includes(forcedLang as Lang) ? (forcedLang as Lang) : "it";
}

export interface ExamGateProps {
  token: string;
  mode: "exam" | "test" | "validate";
  /** True when the token is a PERSONAL link (bound corsista `s` present). */
  personal?: boolean;
  forcedLang?: string;
  collectRegistration?: boolean;
  registrationFields?: import("./ExamRunner").RegField[];
  /** Time limit (seconds) forwarded to the runner — day tests get 10 minutes. */
  limitS?: number;
  /** Server-side progress snapshot (cross-device resume): used when this
   *  browser has no richer local state for the same link. */
  serverResume?: Omit<PersistState, "submitted">;
  reveal?: boolean;
  showResult?: boolean;
  /** True only for the FINAL exam — drives the certified thank-you screen (day
   *  tests end with a plain "Grazie"). */
  isFinal?: boolean;
  /** Student identity stamped as a faint diagonal watermark over the questions
   *  (screenshot deterrence — an OS screenshot can't be blocked on the web, but
   *  a leaked capture carries WHOSE exam it was). Personal exam links only. */
  watermark?: string;
  header: RunnerHeader;
  questions: RunnerQuestion[];
}

export function ExamGate(props: ExamGateProps) {
  // Previews go straight to the runner.
  if (props.mode !== "exam") return <ExamRunner {...props} />;
  // Real exam: a personal link runs directly; a shared link must pass the email
  // gate first (which resolves → mints a personal link → redirects here).
  if (props.personal) return <DirectExam {...props} />;
  return <EmailGate {...props} />;
}

/**
 * Personal-link exam: run directly, resuming answers from this browser so a
 * refresh/disconnect mid-exam doesn't lose progress. Submission is bound to the
 * corsista by the token's `s` (server-side in submitExam) — the runner needs no
 * session machinery.
 */
function DirectExam(props: ExamGateProps) {
  const lang = resolveGateLang(props.forcedLang);
  const t = CHROME[lang];
  const storeKey = `ssa-exam-${props.token}`;
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState<PersistState | undefined>(undefined);
  const total = props.questions.length;
  // Throttle the LIVE-PROGRESS reports (educator's bar): send on question
  // change or at most every 10s. Fire-and-forget, never blocks the student.
  const reportRef = useRef<{ idx: number; at: number }>({ idx: -1, at: 0 });
  const report = useCallback(
    (idx: number, elapsed: number, answers?: Record<string, string[] | string>) => {
      const now = Date.now();
      if (idx === reportRef.current.idx && now - reportRef.current.at < 10_000) return;
      reportRef.current = { idx, at: now };
      void reportExamProgressAction(props.token, { currentIdx: idx, total, elapsed, answers }).catch(() => {});
    },
    [props.token, total],
  );

  // Read resume state client-side BEFORE mounting the runner (its state
  // initializes from resumeState once), never during SSR.
  useEffect(() => {
    let stored: PersistState | undefined;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) stored = JSON.parse(raw) as PersistState;
    } catch {
      /* private mode / bad JSON → start fresh */
    }
    // Cross-device resume (owner, batch 8): no local state — or the server
    // snapshot knows MORE answers (the student progressed on another device)
    // → resume from the server. A local submitted flag always wins.
    const server = props.serverResume;
    if (server && !stored?.submitted) {
      const answered = (a?: Record<string, unknown>) => Object.keys(a ?? {}).length;
      if (!stored || answered(server.answers) > answered(stored.answers)) {
        stored = { ...server, submitted: false };
      }
    }
    if (stored) setResume(stored);
    setReady(true);
    // Already submitted on this device → no heartbeat (the educator's bar must
    // not flip back to "in corso"); the render below shows the blocked screen.
    if (stored?.submitted) return;
    // First heartbeat: the educator sees "in corso" as soon as the test opens.
    // MUST carry __lang like every persist() does — this write replaces the
    // server's answers snapshot wholesale, and dropping the language here was
    // exactly what made a browser switch re-ask it (owner batch 9).
    report(
      stored?.currentIdx ?? 0,
      stored?.elapsed ?? 0,
      stored?.lang ? { ...stored.answers, __lang: stored.lang } : stored?.answers,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  const persist = useCallback(
    (s: PersistState) => {
      try {
        localStorage.setItem(storeKey, JSON.stringify(s));
      } catch {
        /* private mode — progress just won't survive a refresh */
      }
      // "__lang" rides along in the server snapshot so a cross-device resume
      // restores the SAME exam language (mixed-language answers would grade
      // against the wrong option texts). Stripped again on load.
      report(s.currentIdx, s.elapsed, s.lang ? { ...s.answers, __lang: s.lang } : s.answers);
    },
    [storeKey, report],
  );

  if (!ready) {
    return (
      <GateShell header={props.header}>
        <p style={{ textAlign: "center", color: "var(--text-3,#6b7280)" }}>{t.gateMoment}</p>
      </GateShell>
    );
  }
  // Submitted on this device → BLOCKING screen, never remount the runner (a
  // refresh must not reopen the questions). UX layer only: the server-side
  // page gate is the authority (cross-device / cleared storage).
  if (resume?.submitted) {
    return (
      <GateShell header={props.header}>
        <div className="exam-public-thanks">
          <div className="exam-public-thanks-check">✓</div>
          <h2>{t.submittedTitle}</h2>
          <p>{t.submittedBody}</p>
        </div>
      </GateShell>
    );
  }
  return <ExamRunner {...props} resumeState={resume} onPersist={persist} />;
}

// Email-gate copy (it/en; other forced langs fall back to Italian).
const GATE_TXT: Record<"it" | "en", { title: string; hint: string; ph: string; go: string; checking: string }> = {
  it: {
    title: "Accesso all'esame",
    hint: "Inserisci l'indirizzo email che hai confermato durante il corso.",
    ph: "nome@esempio.it",
    go: "Entra",
    checking: "Verifica…",
  },
  en: {
    title: "Exam access",
    hint: "Enter the email address you confirmed during the course.",
    ph: "name@example.com",
    go: "Enter",
    checking: "Checking…",
  },
};

/**
 * Shared-link email gate: verify the confirmed email against the sanitized list,
 * then redirect to the freshly-minted personal link. Never exposes the roster.
 */
function EmailGate(props: ExamGateProps) {
  const lang = resolveGateLang(props.forcedLang);
  const tx = GATE_TXT[lang === "en" ? "en" : "it"];
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    const res = await resolveExamAccessByEmailAction(props.token, email).catch(
      () => ({ ok: false, error: "Errore di rete, riprova." }) as ResolveExamAccessResult,
    );
    if (res.ok && res.url) {
      // Redirect to the personal link → the page reloads with a bound token.
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    setError(res.error || "Verifica non riuscita.");
  };

  return (
    <GateShell header={props.header}>
      <h2 style={{ fontSize: 18, textAlign: "center", marginBottom: 4 }}>{tx.title}</h2>
      <p style={{ fontSize: 13, color: "var(--text-3,#6b7280)", textAlign: "center", marginBottom: 14 }}>
        {tx.hint}
      </p>
      <input
        className="exam-public-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={tx.ph}
        value={email}
        disabled={busy}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        style={{ marginBottom: 10 }}
      />
      {error && (
        <p style={{ fontSize: 12.5, color: "var(--red-600,#dc2626)", marginBottom: 10 }} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="exam-public-opt"
        onClick={submit}
        disabled={busy || !email.trim()}
        style={{
          width: "100%",
          justifyContent: "center",
          fontWeight: 600,
          opacity: busy || !email.trim() ? 0.6 : 1,
        }}
      >
        {busy ? tx.checking : tx.go}
      </button>
    </GateShell>
  );
}

/** Minimal SSA-styled shell for the pre-exam screens (gate / loading). */
function GateShell({ header, children }: { header: RunnerHeader; children: React.ReactNode }) {
  return (
    <div className="exam-public-shell">
      <div className="exam-public-card">
        <header className="exam-public-head">
          <div className="exam-public-head-top">
            <span className="exam-public-brand">SSA</span>
          </div>
          <h1 className="exam-public-course">{header.courseName}</h1>
          <div className="exam-public-meta">
            <span>{header.testLabel}</span>
            <span aria-hidden>·</span>
            <span>{header.place}</span>
            <span aria-hidden>·</span>
            <span>{header.date}</span>
          </div>
        </header>
        <div className="exam-public-q">{children}</div>
      </div>
    </div>
  );
}
