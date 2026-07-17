"use client";

import { useEffect, useRef, useState } from "react";
import {
  sendPersonalExamLinkAction,
  getPersonalExamLinkAction,
  sendPersonalExamLinksToAllAction,
  closeExamLinksAction,
  reopenExamLinksAction,
  getExamProgressAction,
} from "@/lib/share-links/exam-send-actions";
// Type-only (erased at compile time), so importing from the server-only
// module is safe — and it must NOT be re-exported by the actions module
// above: a type in a "use server" export clause crashes its actions loader.
import type { SubjectProgress } from "@/lib/exam-links/live-progress";
import { newerIso } from "@/lib/share-links/verification-state";
import type { ExamSendStamp } from "@/lib/exam-links/send-log";

// Local prop shapes (structurally match the loader types) so this client
// component never imports the server-only loader module.
export interface ExamTest {
  key: string;
  label: string;
  isFinal: boolean;
  /** False = the template has no questions yet: structure shown, sending off. */
  configured: boolean;
  url: string;
  closedAt: string | null;
}
interface Person {
  id: number;
  name: string;
  email: string;
  emailConfirmed: boolean;
  kind: "corsista" | "partecipante";
}

/**
 * Educator "invia link" panel for ONE test, on the public share page. The
 * caller picks which test to show (the day tab is the only "selector" now —
 * Giorno 1/2/3 each show their own day test, Giorno 3 also shows Feedback,
 * Giorno esame shows the final exam). Per test: send each attendee (corsisti
 * AND "doppio" companions) their PERSONAL exam link by email, or copy it for
 * WhatsApp/SMS; plus the general class link (email-gated) for the group chat.
 */
export default function ExamSendPanel({
  token,
  test,
  students,
}: {
  token: string;
  test: ExamTest;
  students: Person[];
}) {
  // Everyone gets a personal link: corsisti AND companions ("doppio"). A
  // companion without an email can't be emailed — their row shows a hint.
  const roster = students;
  const [copied, setCopied] = useState(false);
  const [allBusy, setAllBusy] = useState(false);
  const [allNote, setAllNote] = useState<string | null>(null);
  // Link duration for sends: default end-of-day; "7d" keeps it alive (feedback).
  const [ttl, setTtl] = useState<"eod" | "7d">("eod");
  // Closure state for this test, seeded from the loader and updated optimistically.
  const [closed, setClosed] = useState<string | null>(test.closedAt);
  const [lifeBusy, setLifeBusy] = useState(false);
  // LIVE PROGRESS + persisted SEND STAMPS for this test, keyed by subject
  // (`c<id>` / `p<id>`). Polled every 10s while the tab is open — the educator
  // watches the bars move and the "Inviato" stamps survive reloads.
  const [live, setLive] = useState<{
    progress: Record<string, SubjectProgress>;
    sends: Record<string, ExamSendStamp>;
    presentForTest: Record<string, boolean> | undefined;
    /** Client clock at the instant the snapshot REQUEST left — rows use it to
     *  retire their optimistic "Inviato" echo once an authoritative snapshot
     *  (fetched after the local send) comes back without a stamp. */
    fetchedAt?: number;
  }>({ progress: {}, sends: {}, presentForTest: undefined });
  // Bumped after "Invia a tutti" so the fresh per-row stamps show at once.
  const [refresh, setRefresh] = useState(0);
  const testKey = test.key;
  const configured = test.configured;

  // The caller keys this component by test.key (see EducatorTabs.tsx), so
  // switching to a different test (day tab) fully REMOUNTS it — every
  // useState above re-initializes from the fresh `test` prop, with no manual
  // reset needed.

  useEffect(() => {
    if (!testKey || !configured) return;
    let alive = true;
    const tick = () => {
      const startedAt = Date.now();
      getExamProgressAction(token, testKey)
        .then((r) => {
          if (!alive || !r.ok) return;
          if (!r.progress && !r.sends) return; // rate-limited tick — keep what we have
          setLive({
            progress: r.progress ?? {},
            sends: r.sends ?? {},
            presentForTest: r.presentForTest,
            fetchedAt: startedAt,
          });
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, testKey, configured, refresh]);

  const isClosed = Boolean(closed);

  const toggleClosure = async () => {
    if (lifeBusy) return;
    setLifeBusy(true);
    setAllNote(null);
    const action = isClosed ? reopenExamLinksAction : closeExamLinksAction;
    const res = await action(token, testKey).catch(
      () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
    );
    setLifeBusy(false);
    if (res.ok) {
      setClosed(isClosed ? null : new Date().toISOString());
    } else {
      setAllNote(res.error || "Operazione non riuscita.");
    }
  };

  const copyGeneral = async () => {
    try {
      await navigator.clipboard.writeText(test.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copia il link:", test.url);
    }
  };

  const sendAll = async () => {
    if (allBusy) return;
    setAllBusy(true);
    setAllNote(null);
    const res = await sendPersonalExamLinksToAllAction(token, testKey, ttl).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendPersonalExamLinksToAllAction>>,
    );
    setAllBusy(false);
    if (!res.ok) {
      setAllNote(res.error || "Invio non riuscito.");
      return;
    }
    setAllNote(
      `Inviate ${res.sent ?? 0}/${res.total ?? 0}` +
        `${res.noEmail ? ` · ${res.noEmail} senza email` : ""}` +
        `${res.absent ? ` · ${res.absent} assenti all'appello` : ""}.`,
    );
    // Pull the just-persisted per-row stamps NOW, not at the next 10s tick —
    // the summary and the rows must never contradict each other.
    setRefresh((n) => n + 1);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      {/* The intro NAMES the test: two stacked panels (day test + feedback)
          used to open with the same identical sentence and the educator sent
          feedback links believing they were the day test. */}
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        {testKey === "feedback" ? (
          <>
            Questo è il questionario <strong>Feedback</strong>{" "}
            (gradimento del corso), non un test con punteggio. Invia a ogni studente il suo link personale
            (all&apos;email confermata), oppure copia il link generale per la chat di classe.
          </>
        ) : (
          <>
            Invia a ogni studente il suo link personale per <strong>{test.label}</strong>{" "}
            (all&apos;email confermata), oppure copia il link generale per la chat di classe.
          </>
        )}
      </p>

      {/* Unconfigured test: structure only, nothing sendable. */}
      {!configured && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px dashed var(--border)",
            background: "var(--surface-2)",
            fontSize: 12.5,
            color: "var(--text-3)",
            lineHeight: 1.5,
            marginBottom: 8,
          }}
        >
          <strong>{test.label}</strong> non è ancora configurato: non ha domande.
          La segreteria lo prepara nella <em>Libreria esami &amp; test</em> della
          piattaforma — appena pronto, qui compariranno i pulsanti di invio.
        </div>
      )}

      {configured && (
      <>
      {/* Lifecycle: duration for new sends + close/reopen for everyone. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: isClosed ? "var(--danger-bg)" : "var(--surface-2)",
          border: `1px solid ${isClosed ? "var(--danger-bg)" : "var(--border)"}`,
        }}
      >
        {isClosed ? (
          <span style={{ fontSize: 12, color: "var(--danger-fg)", fontWeight: 600, flex: "1 1 auto" }}>
            Test chiuso — i link inviati non funzionano più. Un nuovo invio riapre l&apos;accesso.
          </span>
        ) : (
          <>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>
              Durata link
            </span>
            <select
              value={ttl}
              onChange={(e) => setTtl(e.target.value === "7d" ? "7d" : "eod")}
              style={{
                fontSize: 12,
                padding: "5px 8px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                flex: "0 1 auto",
              }}
            >
              <option value="eod">Fine giornata (oggi)</option>
              <option value="7d">7 giorni (es. feedback)</option>
            </select>
            <span style={{ flex: "1 1 auto" }} />
          </>
        )}
        <button type="button" onClick={toggleClosure} disabled={lifeBusy} style={miniBtn(false)}>
          {lifeBusy ? "…" : isClosed ? "Riapri" : "Chiudi per tutti"}
        </button>
      </div>

      {/* General class link (email-gated) + send-to-all */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>
          Link generale
        </span>
        <input
          readOnly
          value={test.url}
          onFocus={(e) => e.currentTarget.select()}
          className="mono"
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            fontSize: 11,
            padding: "6px 9px",
            borderRadius: 7,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        />
        <button
          type="button"
          onClick={copyGeneral}
          style={miniBtn(false)}
        >
          {copied ? "Copiato ✓" : "Copia"}
        </button>
        <button type="button" onClick={sendAll} disabled={allBusy} style={miniBtn(true)}>
          {allBusy ? "Invio…" : "Invia a tutti"}
        </button>
      </div>
      {allNote && (
        <p style={{ fontSize: 11.5, color: "var(--text-3)", margin: "0 0 12px" }}>{allNote}</p>
      )}

      {/* Per-student send */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {roster.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-4)" }}>
            Nessuno studente iscritto.
          </div>
        ) : (
          roster.map((s, i) => {
            const subjK = `${s.kind === "corsista" ? "c" : "p"}${s.id}`;
            // undefined = attendance unknown → never restrict; the map only
            // lists WHO IS present, so anyone else is absent-for-this-test.
            const presentMap = live.presentForTest;
            const absent = presentMap ? presentMap[subjK] !== true : false;
            return (
              <StudentSendRow
                // testKey in the key → per-test remount, so notes/links/stamps
                // from one test never linger on another.
                key={`${testKey}-${s.kind}-${s.id}`}
                token={token}
                testKey={testKey}
                ttl={ttl}
                person={s}
                progress={live.progress[subjK]}
                sentStamp={live.sends[subjK]}
                sendsFetchedAt={live.fetchedAt}
                absent={absent}
                last={i === roster.length - 1}
              />
            );
          })
        )}
      </div>
      </>
      )}
    </div>
  );
}

// Compact live-progress bar — platform tokens: indigo while running, green
// (success) ONLY when submitted.
function ProgressBar({ p }: { p: SubjectProgress | undefined }) {
  const pct = p ? p.pct : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`edu-progress${p?.submittedAt ? " submitted" : ""}`}
    >
      <div className="edu-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const timeIt = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function miniBtn(primary: boolean, disabled = false): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 7,
    // Disabled reads as grey (not the active indigo) so it's clear the action
    // isn't available — e.g. an absent student can't be sent the test.
    cursor: disabled ? "not-allowed" : "pointer",
    border: primary ? "none" : "1px solid var(--border)",
    background: disabled ? "var(--border-2)" : primary ? "var(--indigo-600)" : "transparent",
    color: disabled ? "var(--text-4)" : primary ? "#fff" : "var(--text-2)",
  };
}

// Compact square secondary button — same height as miniBtn, icon-only.
function miniIconBtn(disabled = false): React.CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    minHeight: 30,
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid var(--border)",
    background: disabled ? "var(--border-2)" : "transparent",
    color: disabled ? "var(--text-4)" : "var(--text-2)",
  };
}

// Shown when the educator tries to send/copy a test link for an absent student —
// the owner's rule: only a present student can sit the exam.
const ABSENT_WARNING =
  "Persona o studente non presente. Lo studente deve essere presente per sostenere l'esame.";

// Chain/link glyph (inline SVG — the public page is self-contained, no icon lib).
function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function StudentSendRow({
  token,
  testKey,
  ttl,
  person,
  progress,
  sentStamp,
  sendsFetchedAt,
  absent,
  last,
}: {
  token: string;
  testKey: string;
  ttl: "eod" | "7d";
  person: Person;
  progress: SubjectProgress | undefined;
  /** Persisted stamp of the last delivery for THIS test (email or copy). */
  sentStamp: ExamSendStamp | undefined;
  /** Client clock when the current sends snapshot was requested. */
  sendsFetchedAt: number | undefined;
  /** Absent at the appello (this test's day, or every day for feedback/final)
   *  — the owner's rule: never invite an absent student. Mirrors the
   *  server-side gate so the button is never a dead, confusing tap. */
  absent: boolean;
  last: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Optimistic echo of a send/copy done in THIS session, merged newer-wins
  // with the polled stamp (a later "Invia a tutti" must not be masked by it).
  const [justSent, setJustSent] = useState<ExamSendStamp | null>(null);
  // Client clock of the local send — compared against the snapshot's request
  // time, never against server ISO (no clock-skew games).
  const justSentLocalAtRef = useRef(0);
  // AUTHORITATIVE retirement of the echo: a snapshot REQUESTED after the local
  // send that carries NO stamp for this subject means the stamp was cleared
  // server-side ("Azzera appello e verifiche") — newer-wins alone can never
  // express a deletion, and this tab would show "Inviato HH:MM" forever.
  useEffect(() => {
    if (!justSent || sentStamp || !sendsFetchedAt) return;
    if (sendsFetchedAt > justSentLocalAtRef.current) setJustSent(null);
  }, [sendsFetchedAt, sentStamp, justSent]);
  const sent = newerIso(justSent?.at ?? null, sentStamp?.at ?? null);
  const sentMethod: "email" | "copy" =
    sent && sent === justSent?.at ? justSent.method : (sentStamp?.method ?? "email");

  const send = async () => {
    if (busy) return;
    // An absent student can't sit the exam — warn instead of sending (the button
    // is greyed but stays clickable so this message can surface). Mirrors the
    // server-side gate.
    if (absent) {
      setLink(null);
      setNote(ABSENT_WARNING);
      return;
    }
    setBusy(true);
    setNote(null);
    setLink(null);
    // Kind is passed EXPLICITLY — corsista and partecipante ids are separate
    // sequences, a bare number must never be assumed to be a corsista.
    const res = await sendPersonalExamLinkAction(token, testKey, person.id, ttl, person.kind).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendPersonalExamLinkAction>>,
    );
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito.");
      return;
    }
    if (res.sentTo) {
      setNote(`Inviata a ${res.sentTo}`);
      justSentLocalAtRef.current = Date.now();
      setJustSent({ at: res.sentAt ?? new Date().toISOString(), method: "email" });
    } else {
      setNote(res.error ?? null);
      if (res.url) setLink(res.url);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copiato ✓");
    } catch {
      window.prompt("Copia il link:", link);
    }
  };

  // Copy the student's PERSONAL exam link WITHOUT emailing it — for someone
  // with no email/WhatsApp, so the educator hands it over another way (SMS,
  // dictate). Same guards as "Invia"; marks the row "Copiato HH:MM".
  const copyPersonalLink = async () => {
    if (busy) return;
    if (absent) {
      setLink(null);
      setNote(ABSENT_WARNING);
      return;
    }
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await getPersonalExamLinkAction(token, testKey, person.id, ttl, person.kind).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof getPersonalExamLinkAction>>,
    );
    setBusy(false);
    if (!res.ok || !res.url) {
      setNote(res.error || "Generazione del link non riuscita.");
      return;
    }
    justSentLocalAtRef.current = Date.now();
    setJustSent({ at: res.sentAt ?? new Date().toISOString(), method: "copy" });
    try {
      await navigator.clipboard.writeText(res.url);
      setNote("Link personale copiato ✓ — invialo via SMS o a voce.");
    } catch {
      setLink(res.url);
      setNote("Link personale generato:");
    }
  };

  // Honest state label: nothing sent → "Non inviato" (or "Assente all'appello"
  // when that's WHY nothing can be sent yet); email out but the student
  // hasn't opened it → the persistent "Inviato HH:MM" stamp; then the live run
  // states. A send already delivered stays visible even if presence later
  // flips absent — the history doesn't un-happen.
  const stateLabel = progress?.submittedAt
    ? `Consegnato ${timeIt(progress.submittedAt)}`
    : progress
      ? `In corso · dom. ${progress.question}/${progress.total}`
      : sent
        ? `${sentMethod === "copy" ? "Copiato" : "Inviato"} ${timeIt(sent)}`
        : absent
          ? "Assente all'appello"
          : "Non inviato";

  return (
    <div
      style={{
        padding: "9px 12px",
        borderBottom: last ? "none" : "1px solid var(--border-2)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {/* Collapsed row: name → LIVE progress bar → state → Invia. Tapping the
          name/bar area expands the run details. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 200px",
            minWidth: 0,
            background: "transparent",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <span
            role="img"
            aria-label={person.emailConfirmed ? "Email confermata" : "Email non ancora confermata"}
            title={person.emailConfirmed ? "Email confermata" : "Email non ancora confermata"}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background: person.emailConfirmed ? "var(--success)" : "var(--warning)",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {person.name || "—"}
            {person.kind === "partecipante" && (
              <span style={{ marginLeft: 4, fontSize: 10.5, fontWeight: 500, color: "var(--text-4)", fontStyle: "italic" }}>
                (ospite)
              </span>
            )}
          </span>
          {/* The bar appears ONLY once the student has started the test. */}
          {progress ? <ProgressBar p={progress} /> : <span style={{ flex: "1 1 60px" }} />}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              flexShrink: 0,
              color: progress?.submittedAt
                ? "var(--success-fg)"
                : progress
                  ? "var(--indigo-600)"
                  : sent
                    ? "var(--warning-fg)"
                    : "var(--text-4)",
            }}
          >
            {stateLabel}
          </span>
        </button>
        <button
          type="button"
          onClick={copyPersonalLink}
          disabled={busy}
          title={
            absent
              ? ABSENT_WARNING
              : "Copia il link personale (per SMS o consegna a voce, se non ha email/WhatsApp)"
          }
          aria-label="Copia il link personale"
          style={miniIconBtn(busy || absent)}
        >
          <LinkIcon />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          title={absent ? ABSENT_WARNING : undefined}
          style={miniBtn(true, busy || absent)}
        >
          {busy ? "…" : "Invia"}
        </button>
      </div>
      {expanded && (
        <div
          style={{
            display: "grid",
            gap: 3,
            padding: "8px 10px",
            margin: "4px 0 2px 15px",
            borderRadius: 8,
            background: "var(--surface-2)",
            fontSize: 11.5,
            color: "var(--text-2)",
          }}
        >
          {progress ? (
            <>
              <span>
                Avanzamento: <strong>{progress.pct}%</strong> · domanda {progress.question} di {progress.total}
              </span>
              {progress.correct != null && (
                <span>
                  Risposte: <strong style={{ color: "var(--success-fg)" }}>{progress.correct} corrette</strong>
                  {" · "}
                  <strong style={{ color: "var(--danger-fg)" }}>{progress.wrong} sbagliate</strong>
                  {" "}(correzione automatica in tempo reale)
                </span>
              )}
              <span>Inizio: {timeIt(progress.startedAt)}</span>
              <span>
                {progress.submittedAt
                  ? `Consegnato: ${timeIt(progress.submittedAt)}`
                  : `Ultimo aggiornamento: ${timeIt(progress.updatedAt)}`}
              </span>
              <span>
                Stato: {progress.submittedAt ? "Consegnato — in valutazione negli Esiti" : "In corso"}
              </span>
            </>
          ) : sent ? (
            <span>Link inviato alle {timeIt(sent)} — non ha ancora aperto il test.</span>
          ) : (
            <span>Link non ancora inviato: usa &quot;Invia&quot;.</span>
          )}
          {!person.emailConfirmed && (
            <span style={{ color: "var(--warning-fg)" }}>
              Dati non confermati — completa la verifica nell&apos;Appello.
            </span>
          )}
          {absent && (
            <span style={{ color: "var(--warning-fg)" }}>
              Assente all&apos;appello: segna la presenza per poter inviare questo test.
            </span>
          )}
        </div>
      )}
      {note && (
        <div style={{ fontSize: 11, color: "var(--text-3)", paddingLeft: 15 }}>
          {note}
          {link && (
            <>
              {" · "}
              <button
                type="button"
                onClick={copyLink}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--indigo-600)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Copia link
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
