"use client";

import { useEffect, useState } from "react";
import {
  sendPersonalExamLinkAction,
  sendPersonalExamLinksToAllAction,
  closeExamLinksAction,
  reopenExamLinksAction,
  getExamProgressAction,
  type SubjectProgress,
} from "@/lib/share-links/exam-send-actions";
import { newerIso } from "@/lib/share-links/verification-state";

// Local prop shapes (structurally match the loader types) so this client
// component never imports the server-only loader module.
interface ExamTest {
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
 * Educator "Esami" panel on the public share page. FIXED sub-tab per test
 * (Giorno 1..N / Feedback / Esame finale — unconfigured ones shown muted, not
 * sendable). Per test: send each attendee (corsisti AND "doppio" companions)
 * their PERSONAL exam link by email, or copy it for WhatsApp/SMS; plus the
 * general class link (email-gated) for the group chat.
 */
export default function ExamSendPanel({
  token,
  tests,
  students,
}: {
  token: string;
  tests: ExamTest[];
  students: Person[];
}) {
  const [sel, setSel] = useState(tests[0]?.key ?? "");
  const test = tests.find((t) => t.key === sel) ?? tests[0];
  // Everyone gets a personal link: corsisti AND companions ("doppio"). A
  // companion without an email can't be emailed — their row shows a hint.
  const roster = students;
  const [copied, setCopied] = useState(false);
  const [allBusy, setAllBusy] = useState(false);
  const [allNote, setAllNote] = useState<string | null>(null);
  // Link duration for sends: default end-of-day; "7d" keeps it alive (feedback).
  const [ttl, setTtl] = useState<"eod" | "7d">("eod");
  // Closure state per test, seeded from the loader and updated optimistically.
  const [closed, setClosed] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(tests.map((t) => [t.key, t.closedAt])),
  );
  const [lifeBusy, setLifeBusy] = useState(false);
  // LIVE PROGRESS + persisted SEND STAMPS for the selected test, keyed by
  // subject (`c<id>` / `p<id>`). Polled every 10s while the tab is open — the
  // educator watches the bars move and the "Inviato" stamps survive reloads.
  // Stored WITH the test they belong to: rows read them only when the key
  // matches, so a sub-tab switch can never paint another test's data.
  const [live, setLive] = useState<{
    key: string;
    progress: Record<string, SubjectProgress>;
    sends: Record<string, string>;
  }>({ key: "", progress: {}, sends: {} });
  // Bumped after "Invia a tutti" so the fresh per-row stamps show at once.
  const [refresh, setRefresh] = useState(0);
  const selKey = test?.key ?? "";
  const selConfigured = Boolean(test?.configured);
  useEffect(() => {
    if (!selKey || !selConfigured) return;
    let alive = true;
    const tick = () => {
      getExamProgressAction(token, selKey)
        .then((r) => {
          if (!alive || !r.ok) return;
          if (!r.progress && !r.sends) return; // rate-limited tick — keep what we have
          setLive({ key: selKey, progress: r.progress ?? {}, sends: r.sends ?? {} });
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, selKey, selConfigured, refresh]);

  if (!test) return null;
  const isClosed = Boolean(closed[test.key]);

  const toggleClosure = async () => {
    if (lifeBusy) return;
    setLifeBusy(true);
    setAllNote(null);
    const action = isClosed ? reopenExamLinksAction : closeExamLinksAction;
    const res = await action(token, test.key).catch(
      () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
    );
    setLifeBusy(false);
    if (res.ok) {
      setClosed((m) => ({ ...m, [test.key]: isClosed ? null : new Date().toISOString() }));
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
    const res = await sendPersonalExamLinksToAllAction(token, test.key, ttl).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendPersonalExamLinksToAllAction>>,
    );
    setAllBusy(false);
    if (!res.ok) {
      setAllNote(res.error || "Invio non riuscito.");
      return;
    }
    setAllNote(
      `Inviate ${res.sent ?? 0}/${res.total ?? 0}${res.noEmail ? ` · ${res.noEmail} senza email` : ""}.`,
    );
    // Pull the just-persisted per-row stamps NOW, not at the next 10s tick —
    // the summary and the rows must never contradict each other.
    setRefresh((n) => n + 1);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Esami · link per gli studenti</h2>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Invia a ogni studente il suo link personale (all&apos;email confermata), oppure
        copia il link generale per la chat di classe.
      </p>

      {/* Test sub-tabs — the FIXED structure (Giorno 1..N, Feedback, Esame):
          unconfigured tests stay visible but muted. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {tests.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setSel(t.key);
              // A send summary belongs to the test it was sent for.
              setAllNote(null);
            }}
            aria-pressed={sel === t.key}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              minHeight: 40,
              padding: "8px 14px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${sel === t.key ? "var(--indigo-600)" : "var(--border)"}`,
              background: sel === t.key ? "var(--indigo-600)" : "transparent",
              color: sel === t.key ? "#fff" : t.configured ? "var(--text-2)" : "var(--text-4)",
            }}
          >
            {t.label}
            {!t.configured && (
              <span role="img" aria-label="non configurato"> ⚠︎</span>
            )}
          </button>
        ))}
      </div>

      {/* Unconfigured test: structure only, nothing sendable. */}
      {!test.configured && (
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

      {test.configured && (
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
            const forThisTest = live.key === test.key;
            return (
              <StudentSendRow
                // test.key in the key → per-test remount, so notes/links/stamps
                // from one test never linger on another.
                key={`${test.key}-${s.kind}-${s.id}`}
                token={token}
                testKey={test.key}
                ttl={ttl}
                person={s}
                progress={forThisTest ? live.progress[subjK] : undefined}
                sentAt={forThisTest ? live.sends[subjK] : undefined}
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

function miniBtn(primary: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 7,
    cursor: "pointer",
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--indigo-600)" : "transparent",
    color: primary ? "#fff" : "var(--text-2)",
  };
}

function StudentSendRow({
  token,
  testKey,
  ttl,
  person,
  progress,
  sentAt,
  last,
}: {
  token: string;
  testKey: string;
  ttl: "eod" | "7d";
  person: Person;
  progress: SubjectProgress | undefined;
  /** Persisted stamp of the last delivered email for THIS test (ISO). */
  sentAt: string | undefined;
  last: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Optimistic echo of a send done in THIS session, merged newer-wins with
  // the polled stamp (a later "Invia a tutti" must not be masked by it).
  const [justSentAt, setJustSentAt] = useState<string | null>(null);
  const sent = newerIso(justSentAt, sentAt ?? null);

  const send = async () => {
    if (busy) return;
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
      setJustSentAt(res.sentAt ?? new Date().toISOString());
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

  // Honest four-state label: nothing sent → "Non inviato"; email out but the
  // student hasn't opened it → the persistent "Inviato HH:MM" stamp; then the
  // live run states. Colors follow the platform semantics (warning = waiting).
  const stateLabel = progress?.submittedAt
    ? `Consegnato ${timeIt(progress.submittedAt)}`
    : progress
      ? `In corso · dom. ${progress.question}/${progress.total}`
      : sent
        ? `Inviato ${timeIt(sent)}`
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
        <button type="button" onClick={send} disabled={busy} style={miniBtn(true)}>
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
