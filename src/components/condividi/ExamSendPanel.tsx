"use client";

import { useState } from "react";
import {
  sendPersonalExamLinkAction,
  sendPersonalExamLinksToAllAction,
  closeExamLinksAction,
  reopenExamLinksAction,
} from "@/lib/share-links/exam-send-actions";

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
    if (!res.live) {
      setAllNote(`Modalità test: nessun invio (${res.total ?? 0} studenti). Usa "Invia" per copiare i singoli link.`);
    } else {
      setAllNote(
        `Inviate ${res.sent ?? 0}/${res.total ?? 0}${res.noEmail ? ` · ${res.noEmail} senza email` : ""}.`,
      );
    }
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Esami · link per gli studenti</h2>
      <p style={{ fontSize: 12, color: "var(--text-3, #6b7280)", margin: "0 0 12px", lineHeight: 1.5 }}>
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
            onClick={() => setSel(t.key)}
            aria-pressed={sel === t.key}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              minHeight: 40,
              padding: "8px 14px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${sel === t.key ? "var(--indigo-600, #4f46e5)" : "var(--border, #e5e7eb)"}`,
              background: sel === t.key ? "var(--indigo-600, #4f46e5)" : "transparent",
              color: sel === t.key ? "#fff" : t.configured ? "var(--text-2, #374151)" : "var(--text-4, #9ca3af)",
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
            border: "1px dashed var(--border, #e5e7eb)",
            background: "var(--surface-2, #f9fafb)",
            fontSize: 12.5,
            color: "var(--text-3, #6b7280)",
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
          background: isClosed ? "var(--red-50, #fef2f2)" : "var(--surface-2, #f9fafb)",
          border: `1px solid ${isClosed ? "var(--red-200, #fecaca)" : "var(--border, #e5e7eb)"}`,
        }}
      >
        {isClosed ? (
          <span style={{ fontSize: 12, color: "var(--red-600, #dc2626)", fontWeight: 600, flex: "1 1 auto" }}>
            Test chiuso — i link inviati non funzionano più. Un nuovo invio riapre l&apos;accesso.
          </span>
        ) : (
          <>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3, #6b7280)", flexShrink: 0 }}>
              Durata link
            </span>
            <select
              value={ttl}
              onChange={(e) => setTtl(e.target.value === "7d" ? "7d" : "eod")}
              style={{
                fontSize: 12,
                padding: "5px 8px",
                borderRadius: 7,
                border: "1px solid var(--border, #e5e7eb)",
                background: "var(--surface, #fff)",
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
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3, #6b7280)", flexShrink: 0 }}>
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
            border: "1px solid var(--border, #e5e7eb)",
            background: "var(--surface-2, #f4f5f7)",
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
        <p style={{ fontSize: 11.5, color: "var(--text-3, #6b7280)", margin: "0 0 12px" }}>{allNote}</p>
      )}

      {/* Per-student send */}
      <div
        style={{
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {roster.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-4, #9ca3af)" }}>
            Nessuno studente iscritto.
          </div>
        ) : (
          roster.map((s, i) => (
            <StudentSendRow
              key={`${s.kind}-${s.id}`}
              token={token}
              testKey={test.key}
              ttl={ttl}
              person={s}
              last={i === roster.length - 1}
            />
          ))
        )}
      </div>
      </>
      )}
    </div>
  );
}

function miniBtn(primary: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 7,
    cursor: "pointer",
    border: primary ? "none" : "1px solid var(--border, #e5e7eb)",
    background: primary ? "var(--indigo-600, #4f46e5)" : "transparent",
    color: primary ? "#fff" : "var(--text-2, #374151)",
  };
}

function StudentSendRow({
  token,
  testKey,
  ttl,
  person,
  last,
}: {
  token: string;
  testKey: string;
  ttl: "eod" | "7d";
  person: Person;
  last: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

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
    if (res.sentTo) setNote(`Inviata a ${res.sentTo}`);
    else {
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

  return (
    <div
      style={{
        padding: "9px 12px",
        borderBottom: last ? "none" : "1px solid var(--border-2, #f0f1f3)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          role="img"
          aria-label={person.emailConfirmed ? "Email confermata" : "Email non ancora confermata"}
          title={person.emailConfirmed ? "Email confermata" : "Email non ancora confermata"}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: person.emailConfirmed ? "var(--green-500, #22c55e)" : "var(--amber-400, #f59e0b)",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 120px", minWidth: 0 }}>
          {person.name || "—"}
          {person.kind === "partecipante" && (
            <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 500, color: "var(--text-4, #9ca3af)", fontStyle: "italic" }}>
              (ospite)
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: person.email ? "var(--text-3, #6b7280)" : "var(--text-4, #9ca3af)",
            flex: "1 1 150px",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {person.email || "nessuna email"}
        </span>
        <button type="button" onClick={send} disabled={busy} style={miniBtn(true)}>
          {busy ? "…" : "Invia"}
        </button>
      </div>
      {note && (
        <div style={{ fontSize: 11, color: "var(--text-3, #6b7280)", paddingLeft: 15 }}>
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
                  color: "var(--indigo-600, #4f46e5)",
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
