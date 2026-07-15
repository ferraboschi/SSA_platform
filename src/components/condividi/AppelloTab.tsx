"use client";

// The verification flow is AIRTIGHT (see lib/share-links/verification-state):
// free edits only before the first send; while a link is out, corrections
// happen exclusively via the atomic correct-and-resend; a confirmed student's
// data is locked forever, and the confirmation also counts as presence (their
// last marked day can't be unchecked). The same rules are enforced
// server-side in attendance-actions.ts (which also bounds the exam-day
// attendance to dayCount + 1 when the course has an exam).

import { useEffect, useRef, useState } from "react";
import {
  getAttendanceAction,
  setAttendanceAction,
  addPartecipanteFromLinkAction,
  completeSeatFromLinkAction,
  type AttendanceMap,
  type AttendanceSubject,
} from "@/lib/share-links/attendance-actions";
import { resetAppelloAction } from "@/lib/share-links/verification-actions";
import { deriveVerificationState, chipLabel } from "@/lib/share-links/verification-state";
import VerifyActions from "./VerifyActions";
import { CHIP_CLASS, subjKey, type Student } from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// 1 · APPELLO — attendance + verification, every state always visible.
// ─────────────────────────────────────────────────────────────────────────────
export default function AppelloTab({
  token,
  students,
  setStudents,
  day,
  isExamDay,
}: {
  token: string;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  /** Which roll-call day this instance shows — chosen by the top-level day
   *  tab, not by an internal selector (day_no in corsi_presenze; program
   *  days are 1..dayCount, the exam day is dayCount + 1). */
  day: number;
  /** Exam-day copy ("Giorno esame") instead of "giorno N". */
  isExamDay?: boolean;
}) {
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [seatOpen, setSeatOpen] = useState<string | null>(null);
  const chains = useRef<Map<string, Promise<void>>>(new Map());
  // Mirror of `pending` readable from the poll interval (state would be stale
  // inside the closure): while any write is in flight, polls must not merge.
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getAttendanceAction(token)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setAttendance(res.attendance ?? {});
          if (res.schema) setReadOnly(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  // LIVE APPELLO: re-poll attendance every 12s so two devices sharing the
  // link see each other's taps (and the guard below judges fresh state).
  // Skipped while any local write is in flight — a poll snapshot must never
  // clobber an optimistic toggle.
  useEffect(() => {
    let alive = true;
    const id = setInterval(() => {
      if (pendingRef.current.size > 0) return;
      getAttendanceAction(token)
        .then((res) => {
          if (!alive || !res.ok || !res.attendance) return;
          if (pendingRef.current.size > 0) return;
          setAttendance(res.attendance);
        })
        .catch(() => {});
    }, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  const presentAny = (subj: string) => Object.values(attendance[subj] ?? {}).some(Boolean);
  const cellKey = (subj: string, d: number) => `${subj}:${d}`;

  function toggle(subject: AttendanceSubject, next: boolean) {
    if (readOnly) return;
    const subj = subjKey(subject);
    const key = cellKey(subj, day);
    // VERIFICA ⇒ PRESENZA: the confirm email leaves from the appello, so once
    // a link is OUT (or confirmed) that student's LAST marked presence can't
    // be removed — it would contradict the persistent "Inviata/Confermato"
    // fact. Other days stay freely correctable. Mirrors the server guard —
    // refused with an explanation, never a dead tap.
    if (!next) {
      const stu = students.find((x) => subjKey(x) === subj);
      const confirmed = Boolean(stu && (stu.emailConfirmedAt || stu.emailConfirmed));
      const sent = Boolean(stu && (stu.confirmSentAt || stu.confirmSent));
      if (stu && (confirmed || sent)) {
        const days = attendance[subj] ?? {};
        const hasOther = Object.entries(days).some(([d, v]) => v && Number(d) !== day);
        if (!hasOther) {
          setError(
            confirmed
              ? `${stu.name || "Studente"} ha confermato i dati: la conferma vale come presenza, quindi almeno una giornata resta "Presente".`
              : `L'email di conferma per ${stu.name || "questa persona"} è partita da questo appello: finché la verifica è in corso, l'ultima presenza resta segnata.`,
          );
          return;
        }
      }
    }
    const prev = !!attendance[subj]?.[day];
    setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: next } }));
    pendingRef.current.add(key);
    setPending((s) => new Set(s).add(key));
    setError(null);
    const run = async () => {
      const res = await setAttendanceAction(token, subject, day, next).catch(
        () => ({ ok: false }) as { ok: boolean; schema?: boolean; error?: string },
      );
      if (!res.ok) {
        setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: prev } }));
        if (res.schema) setReadOnly(true);
        else setError(res.error || "Salvataggio non riuscito, riprova.");
      }
      pendingRef.current.delete(key);
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    };
    const tail = (chains.current.get(key) ?? Promise.resolve()).then(run, run);
    chains.current.set(key, tail);
  }

  const presentCount = students.filter((s) => !!attendance[subjKey(s)]?.[day]).length;

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 10px", lineHeight: 1.5 }}>
        {readOnly
          ? "Appello non ancora disponibile."
          : `Chiama l'appello${isExamDay ? " del giorno esame" : ""} e tocca chi è presente — si salva da solo. Presenti: ${presentCount}/${students.length}. Chi è presente può ricevere subito l'email di conferma dati. Verde = dati confermati.`}
      </p>
      {error && (
        <p style={{ color: "var(--danger-fg)", fontSize: 12.5, margin: "0 0 10px" }} role="alert">
          {error}
        </p>
      )}

      <div className="edu-list">
        {students.length === 0 && <div className="edu-empty">Nessun iscritto al momento.</div>}
        {students.map((s) => {
          const subj = subjKey(s);
          const key = cellKey(subj, day);
          const checked = !!attendance[subj]?.[day];
          const disabled = readOnly || pending.has(key);
          const present = presentAny(subj);
          const state = deriveVerificationState(present, s.confirmSentAt, s.emailConfirmedAt);
          const tickets = s.tickets ?? 1;
          const used = s.companionsUsed ?? 0;
          // Unfilled companion seats (buyer occupies seat 1): one "da compilare"
          // slot each, filled at check-in.
          const emptySlots = Math.max(0, tickets - 1 - used);
          const canAdd =
            !readOnly && s.kind === "corsista" && emptySlots > 0 && s.iscrizioneId != null;
          return (
            <div key={subj} className="edu-rowwrap" data-state={state} data-present={checked}>
              <div className="edu-rowgrid">
                {/* Presence zone — the tap target for the roll-call. */}
                <button
                  type="button"
                  className="edu-presence"
                  disabled={disabled}
                  aria-pressed={checked}
                  onClick={() => toggle({ kind: s.kind, id: s.id }, !checked)}
                >
                  <span className={`edu-check ${checked ? "on" : ""}`} aria-hidden>
                    {checked ? "✓" : ""}
                  </span>
                  <span className="edu-row-main">
                    <span
                      className="edu-row-name"
                      style={
                        s.placeholder
                          ? { color: "var(--text-3)" }
                          : state === "confermato"
                            ? { color: "var(--success-fg)" }
                            : undefined
                      }
                    >
                      {s.placeholder ? (
                        <>
                          Posto da completare
                          {s.guestOf && (
                            <span className="edu-guest"> (2° biglietto di {s.guestOf})</span>
                          )}
                        </>
                      ) : (
                        <>
                          {s.name || "—"}
                          {s.kind === "partecipante" && (
                            <span className="edu-guest"> (ospite{s.guestOf ? ` di ${s.guestOf}` : ""})</span>
                          )}
                        </>
                      )}
                    </span>
                    <span className="edu-row-sub">
                      {checked ? "Presente" : "Assente"}
                      {s.kind === "corsista" && (s.amount != null || (s.ticketsBought ?? 1) > 1) && (
                        <span style={{ color: "var(--text-3)" }}>
                          {" · "}
                          {s.amount != null
                            ? s.amount === 0
                              ? "Gratis"
                              : `€ ${s.amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : null}
                          {(s.ticketsBought ?? 1) > 1
                            ? `${s.amount != null ? " · " : ""}${s.ticketsBought} biglietti`
                            : ""}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {s.placeholder ? (
                  <span className="badge badge-warning" style={{ justifySelf: "start", whiteSpace: "nowrap" }}>
                    Da completare
                  </span>
                ) : (
                  <span className={CHIP_CLASS[state]} style={{ justifySelf: "start", whiteSpace: "nowrap" }}>
                    {chipLabel(state, s.confirmSentAt, s.emailConfirmedAt)}
                  </span>
                )}
                {s.placeholder ? (
                  <SeatFillIn
                    open={seatOpen === subj}
                    onOpen={() => { setError(null); setSeatOpen(subj); }}
                    onCancel={() => setSeatOpen(null)}
                    token={token}
                    iscrizioneId={s.iscrizioneId ?? 0}
                    onError={(m) => setError(m)}
                    onCompleted={(person) => {
                      setStudents((prev) =>
                        prev.map((x) =>
                          x.kind === "corsista" && x.id === s.id
                            ? { ...x, name: person.name, email: person.email, placeholder: false }
                            : x,
                        ),
                      );
                      setSeatOpen(null);
                    }}
                  />
                ) : (
                  <VerifyActions
                    token={token}
                    student={s}
                    state={state}
                    onUpdated={(patch) =>
                      setStudents((prev) =>
                        prev.map((x) => (x.kind === s.kind && x.id === s.id ? { ...x, ...patch } : x)),
                      )
                    }
                  />
                )}
              </div>
              {canAdd && addOpen !== subj && (
                <button type="button" className="edu-addlink" onClick={() => setAddOpen(subj)}>
                  ✎ {emptySlots === 1
                    ? "1 ospite da compilare — inserisci il nome"
                    : `${emptySlots} ospiti da compilare — inserisci i nomi`}
                </button>
              )}
              {canAdd && addOpen === subj && s.iscrizioneId != null && (
                <AddParticipantForm
                  token={token}
                  iscrizioneId={s.iscrizioneId}
                  onCancel={() => setAddOpen(null)}
                  onError={(m) => setError(m)}
                  onAdded={(companion) => {
                    setStudents((prev) => {
                      const next = [...prev];
                      const idx = next.findIndex((x) => x.kind === "corsista" && x.id === s.id);
                      const anchor = idx >= 0 ? idx : next.length - 1;
                      next[anchor] = { ...next[anchor], companionsUsed: (next[anchor].companionsUsed ?? 0) + 1 };
                      next.splice(anchor + 1, 0, {
                        id: companion.id,
                        kind: "partecipante",
                        name: companion.full_name,
                        email: companion.email,
                        emailConfirmed: false,
                        confirmSent: false,
                        confirmSentAt: null,
                        emailConfirmedAt: null,
                        phone: companion.phone,
                        guestOf: s.name,
                      });
                      return next;
                    });
                    setAddOpen(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && <ResetAppello token={token} />}
    </div>
  );
}

/** Double-confirmed course RESET: presence + email verifications back to zero
 *  (emails/phones/addresses are kept). For test runs and wrong setups — the
 *  destructive twin of the appello, so it lives at the very bottom, quiet. */
// Fill-in for a multi-ticket EXTRA SEAT (F4 placeholder) directly on the
// roll-call: the educator enters the real attendee at check-in. Once saved, the
// seat becomes a normal corsista on every day (no re-entry). Name required,
// email optional (needed later to send the confirmation).
function SeatFillIn({
  open,
  onOpen,
  onCancel,
  token,
  iscrizioneId,
  onError,
  onCompleted,
}: {
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  token: string;
  iscrizioneId: number;
  onError: (m: string) => void;
  onCompleted: (person: { id: number; name: string; email: string }) => void;
}) {
  // SEPARATE first/last name fields (owner batch 8): a one-word entry used to
  // be rejected and a two-word FIRST name ("Gian Paolo") was mistaken for
  // name+surname. Storage stays the composed full name.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const missing: string[] = [];
  if (!firstName.trim()) missing.push("nome");
  if (!lastName.trim()) missing.push("cognome");
  if (!emailValid) missing.push("email");
  if (!phone.trim()) missing.push("telefono");
  const ready = missing.length === 0;

  async function submit() {
    if (!ready || busy || !iscrizioneId) return;
    setBusy(true);
    const res = await completeSeatFromLinkAction(
      token,
      iscrizioneId,
      `${firstName.trim().replace(/\s+/g, " ")} ${lastName.trim().replace(/\s+/g, " ")}`,
      email.trim(),
      phone.trim(),
    ).catch(() => ({ ok: false }) as Awaited<ReturnType<typeof completeSeatFromLinkAction>>);
    setBusy(false);
    if (res.ok && res.person) onCompleted(res.person);
    else onError(res.error || "Salvataggio non riuscito, riprova.");
  }

  if (!open) {
    return (
      <button type="button" className="edu-addlink" style={{ justifySelf: "start" }} onClick={onOpen}>
        ✎ Inserisci nominativo
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          className="edu-input"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Nome"
          maxLength={60}
          autoFocus
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          type="text"
          className="edu-input"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Cognome"
          maxLength={60}
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      <input
        type="email"
        inputMode="email"
        className="edu-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        maxLength={200}
        disabled={busy}
      />
      <input
        type="tel"
        inputMode="numeric"
        className="edu-input"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefono"
        maxLength={40}
        disabled={busy}
      />
      {!ready && (firstName || lastName || email || phone) && (
        <div style={{ fontSize: 11.5, color: "#b45309" }}>
          Manca: {missing.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="edu-btn primary"
          onClick={submit}
          disabled={busy || !ready}
          title={!ready ? `Compila: ${missing.join(", ")}` : undefined}
        >
          Salva
        </button>
        <button type="button" className="edu-btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
    </div>
  );
}

function ResetAppello({ token }: { token: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const doReset = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res = await resetAppelloAction(token).catch(
      () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
    );
    if (!res.ok) {
      setBusy(false);
      setNote(res.error || "Azzeramento non riuscito, riprova.");
      return;
    }
    // Clean slate everywhere (attendance, chips, polls): full reload.
    window.location.reload();
  };

  if (!armed) {
    return (
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <button
          type="button"
          className="edu-btn"
          style={{ color: "var(--danger-fg)", borderColor: "var(--border)" }}
          onClick={() => {
            setNote(null);
            setArmed(true);
          }}
        >
          Azzera appello e verifiche…
        </button>
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 18,
        padding: "12px 14px",
        borderRadius: "var(--r-3)",
        border: "1px solid var(--danger-fg)",
        background: "var(--danger-bg)",
      }}
    >
      <p style={{ fontSize: 12.5, color: "var(--danger-fg)", margin: "0 0 10px", lineHeight: 1.5 }}>
        Cancella <strong>tutte le presenze</strong> e <strong>tutte le conferme email</strong>{" "}
        di questo corso: l&apos;appello riparte da zero e gli studenti dovranno ri-confermare i
        dati. Email, telefoni e indirizzi restano salvati. Non si può annullare.
      </p>
      {note && (
        <p style={{ fontSize: 12, color: "var(--danger-fg)", margin: "0 0 8px" }} role="alert">
          {note}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="edu-btn" onClick={() => setArmed(false)} disabled={busy}>
          Annulla
        </button>
        <button
          type="button"
          className="edu-btn"
          style={{ background: "var(--danger-fg)", borderColor: "var(--danger-fg)", color: "var(--text-on-dark)" }}
          onClick={doReset}
          disabled={busy}
        >
          {busy ? "Azzeramento…" : "Sì, azzera tutto"}
        </button>
      </div>
    </div>
  );
}

function AddParticipantForm({
  token,
  iscrizioneId,
  onAdded,
  onCancel,
  onError,
}: {
  token: string;
  iscrizioneId: number;
  onAdded: (c: { id: number; full_name: string; phone: string; email: string }) => void;
  onCancel: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Optional here: the educator may add the person before knowing their
  // email. Giving it now means "Invia email" is ready the moment presence
  // is marked, with no detour through "Correggi".
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await addPartecipanteFromLinkAction(token, iscrizioneId, trimmed, phone.trim(), email.trim()).catch(
      () =>
        ({ ok: false }) as {
          ok: boolean;
          error?: string;
          companion?: { id: number; full_name: string; phone: string; email: string };
        },
    );
    setBusy(false);
    if (res.ok && res.companion) onAdded(res.companion);
    else onError(res.error || "Aggiunta non riuscita, riprova.");
  }

  return (
    <div className="edu-addform">
      <input
        type="text"
        className="edu-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome e cognome"
        maxLength={120}
        autoFocus
        disabled={busy}
      />
      <input
        type="tel"
        className="edu-input"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefono"
        maxLength={40}
        disabled={busy}
      />
      <input
        type="email"
        inputMode="email"
        className="edu-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (facoltativa ora, obbligatoria per la conferma)"
        disabled={busy}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="edu-btn primary" onClick={submit} disabled={busy || !name.trim()}>
          Aggiungi
        </button>
        <button type="button" className="edu-btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
    </div>
  );
}
