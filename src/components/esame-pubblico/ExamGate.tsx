"use client";

// Entry for the public exam link.
//  • Preview (test/validate) → straight to the runner (page sets reveal/showResult).
//  • Real exam → ProctoredExam: pick your name → waiting room → educator admits →
//    runner with RESUMABLE state (logout/refresh/disconnect resumes exactly where
//    you were, until final submission).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExamRunner,
  type RunnerQuestion,
  type RunnerHeader,
} from "./ExamRunner";
import {
  getExamRosterAction,
  checkInExamSessionAction,
  getExamSessionAction,
  saveExamProgressAction,
  submitExamSessionAction,
  type ExamSessionState,
} from "@/lib/exam-links/sessions";

export interface ExamGateProps {
  token: string;
  mode: "exam" | "test" | "validate";
  forcedLang?: string;
  collectRegistration?: boolean;
  reveal?: boolean;
  showResult?: boolean;
  header: RunnerHeader;
  questions: RunnerQuestion[];
}

export function ExamGate(props: ExamGateProps) {
  if (props.mode !== "exam") {
    return <ExamRunner {...props} />;
  }
  return <ProctoredExam {...props} />;
}

type Phase = "loading" | "pick" | "checking" | "waiting" | "exam" | "submitted" | "error";
interface RosterStudent {
  id: number;
  name: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CheckInResult = Awaited<ReturnType<typeof checkInExamSessionAction>>;

// Resume must survive a flaky network. Retry transient check-in failures a few
// times (a dropped admitted student must NOT fall back to the picker), but bail
// immediately on hard errors (not enrolled, expired link, missing migration).
async function checkInWithRetry(
  token: string,
  id: number,
  name: string,
  tries = 3,
): Promise<CheckInResult> {
  let last = await checkInExamSessionAction(token, id, name);
  for (let i = 1; i < tries && !(last.ok && last.state); i++) {
    if (last.error && /non iscritt|non valid|scadut|migrazione|solo per/i.test(last.error)) break;
    await sleep(500 * i);
    last = await checkInExamSessionAction(token, id, name);
  }
  return last;
}

function ProctoredExam(props: ExamGateProps) {
  const { token } = props;
  const storeKey = `ssa-exam-${token}`;
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<RosterStudent | null>(null);
  const [sessionState, setSessionState] = useState<ExamSessionState | null>(null);
  const corsistaIdRef = useRef<number | null>(null);
  // Per-session bearer secret (from check-in). Held in memory only — re-fetched
  // via check-in on every reconnect, never persisted to disk.
  const secretRef = useRef<string | null>(null);

  const routeByStatus = (s: ExamSessionState) => {
    if (s.status === "submitted") setPhase("submitted");
    else if (s.status === "admitted") setPhase("exam");
    else setPhase("waiting");
  };

  // On mount: try to resume from this browser; otherwise load the roster.
  useEffect(() => {
    let stored: RosterStudent | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) stored = JSON.parse(raw) as RosterStudent;
    } catch {
      stored = null;
    }
    (async () => {
      if (stored?.id) {
        // Retry transient failures so a flaky reconnect doesn't bounce an
        // already-admitted student back to the name picker.
        const r = await checkInWithRetry(token, stored.id, stored.name);
        if (r.ok && r.state) {
          corsistaIdRef.current = stored.id;
          secretRef.current = r.secret ?? null;
          setPicked(stored);
          setSessionState(r.state);
          routeByStatus(r.state);
          return;
        }
      }
      const rr = await getExamRosterAction(token);
      if (!rr.ok) {
        setErrorMsg(rr.error || "Impossibile caricare l'elenco della classe.");
        setPhase("error");
        return;
      }
      setRoster(rr.students || []);
      setPhase("pick");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCheckIn = async (student: RosterStudent) => {
    setPhase("checking");
    const r = await checkInWithRetry(token, student.id, student.name);
    if (!r.ok || !r.state) {
      setErrorMsg(r.error || "Check-in non riuscito.");
      setPhase("error");
      return;
    }
    corsistaIdRef.current = student.id;
    secretRef.current = r.secret ?? null;
    setPicked(student);
    try {
      localStorage.setItem(storeKey, JSON.stringify(student));
    } catch {
      /* private mode — resume still works via name re-pick */
    }
    setSessionState(r.state);
    routeByStatus(r.state);
  };

  // Poll for admission while waiting.
  useEffect(() => {
    if (phase !== "waiting" || corsistaIdRef.current == null) return;
    const id = setInterval(async () => {
      const r = await getExamSessionAction(token, corsistaIdRef.current!, secretRef.current ?? undefined);
      if (r.ok && r.state) {
        setSessionState(r.state);
        if (r.state.status === "admitted") setPhase("exam");
        else if (r.state.status === "submitted") setPhase("submitted");
      }
    }, 3000);
    return () => clearInterval(id);
  }, [phase, token]);

  // Memoized so the runner's save effects don't see a new callback every render
  // (which would restart its periodic-save interval). Closes over refs only.
  const persist = useCallback(
    (s: { answers: Record<string, string[] | string>; currentIdx: number; lang: string; elapsed: number }) => {
      if (corsistaIdRef.current == null) return;
      const id = corsistaIdRef.current;
      const secret = secretRef.current ?? undefined;
      // Fire-and-forget, but retry ONCE on a transient failure so a single
      // dropped request doesn't silently lose the student's latest answers.
      // Swallow rejections (network drop) — the next debounced/15s save self-heals.
      void saveExamProgressAction(token, id, secret, s)
        .then((r) => {
          if (!r?.ok) return saveExamProgressAction(token, id, secret, s);
        })
        .catch(() => {});
    },
    [token],
  );
  const submit = useCallback(async () => {
    if (corsistaIdRef.current == null) return { ok: false, error: "Sessione non valida." };
    return submitExamSessionAction(token, corsistaIdRef.current, secretRef.current ?? undefined);
  }, [token]);

  // ── Render by phase ──────────────────────────────────────────────────────
  if (phase === "loading" || phase === "checking") {
    return (
      <GateShell header={props.header}>
        <p style={{ textAlign: "center", color: "var(--text-3,#6b7280)" }}>Un attimo…</p>
      </GateShell>
    );
  }
  if (phase === "error") {
    return (
      <GateShell header={props.header}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>⚠️</div>
          <p style={{ marginTop: 8 }}>{errorMsg}</p>
        </div>
      </GateShell>
    );
  }
  if (phase === "submitted") {
    return (
      <GateShell header={props.header}>
        <div style={{ textAlign: "center" }}>
          <div className="exam-public-thanks-check">✓</div>
          <h2 style={{ marginTop: 8 }}>Esame già consegnato</h2>
          <p style={{ color: "var(--text-3,#6b7280)" }}>Hai già completato e inviato questo esame.</p>
        </div>
      </GateShell>
    );
  }
  if (phase === "pick") {
    const filtered = filter.trim()
      ? roster.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()))
      : roster;
    return (
      <GateShell header={props.header}>
        <h2 style={{ fontSize: 18, textAlign: "center", marginBottom: 4 }}>Chi sei?</h2>
        <p style={{ fontSize: 13, color: "var(--text-3,#6b7280)", textAlign: "center", marginBottom: 14 }}>
          Seleziona il tuo nome. L&apos;educator ti ammetterà dopo averti riconosciuto su Zoom.
        </p>
        {roster.length > 8 && (
          <input
            className="exam-public-input"
            placeholder="Cerca il tuo nome…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: 10 }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3,#6b7280)" }}>Nessun nome trovato.</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="exam-public-opt"
                onClick={() => doCheckIn(s)}
                style={{ textAlign: "left" }}
              >
                <span>{s.name}</span>
              </button>
            ))
          )}
        </div>
      </GateShell>
    );
  }
  if (phase === "waiting") {
    return (
      <GateShell header={props.header}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>⏳</div>
          <h2 style={{ fontSize: 18, marginTop: 8 }}>Sei in sala d&apos;attesa</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-3,#6b7280)", lineHeight: 1.5, marginTop: 6 }}>
            {picked?.name ? <><strong>{picked.name}</strong> — </> : null}
            attendi che l&apos;educator ti ammetta all&apos;esame. Resta su questa pagina e con la
            videocamera accesa su Zoom.
          </p>
        </div>
      </GateShell>
    );
  }

  // phase === "exam"
  return (
    <ExamRunner
      {...props}
      resumeState={
        sessionState
          ? {
              answers: sessionState.answers,
              currentIdx: sessionState.currentIdx,
              lang: sessionState.lang ?? undefined,
              elapsed: sessionState.elapsed,
            }
          : undefined
      }
      onPersist={persist}
      onSubmitSession={submit}
    />
  );
}

/** Minimal SSA-styled shell for the pre-exam screens (pick / waiting / states). */
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
