"use client";

// The verification flow is AIRTIGHT (see lib/share-links/verification-state):
// free edits only before the first send; while a link is out, corrections
// happen exclusively via the atomic correct-and-resend; a CONFIRMED student's
// data is locked forever, and the confirmation also counts as presence (their
// last marked day can't be unchecked). A merely-SENT link does NOT lock the
// presence — a day-1 mis-tap must stay correctable. The same rules are
// enforced server-side in attendance-actions.ts (which also bounds the
// exam-day attendance to dayCount + 1 when the course has an exam).

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
import { COUNTRY_CODES } from "@/lib/phone/dial-codes";
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
  maxDay,
  isExamDay,
}: {
  token: string;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  /** Which roll-call day this instance shows — chosen by the top-level day
   *  tab, not by an internal selector (day_no in corsi_presenze; program
   *  days are 1..dayCount, the exam day is dayCount + 1). */
  day: number;
  /** Highest valid roll-call day (dayCount, +1 when the course has an exam) —
   *  the client-side "other present day" check must judge the SAME universe
   *  as the server's bounded check, or the two disagree and a tap silently
   *  flips then reverts. */
  maxDay: number;
  /** Exam-day copy ("Giorno esame") instead of "giorno N". */
  isExamDay?: boolean;
}) {
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refusals belong AT the tapped row — the top-of-roster alert was invisible
  // on long lists and read as a dead tap (the re-reported "bug presenze").
  const [rowError, setRowError] = useState<{ subj: string; msg: string } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [seatOpen, setSeatOpen] = useState<string | null>(null);
  const chains = useRef<Map<string, Promise<void>>>(new Map());
  // Mirror of `pending` readable from the poll interval (state would be stale
  // inside the closure): while any write is in flight, polls must not merge.
  const pendingRef = useRef<Set<string>>(new Set());
  // A poll snapshot FETCHED before the last write completed must be discarded
  // even if it RESOLVES after (TOCTOU): it would visually re-check a just-saved
  // uncheck for up to one poll period.
  const lastWriteDoneRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    getAttendanceAction(token)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          // Same guards as the 12s poll: a tap during the in-flight mount
          // fetch must not be wiped by the pre-tap snapshot (flip-then-revert
          // on the first seconds after a tab switch).
          if (
            pendingRef.current.size === 0 &&
            startedAt >= lastWriteDoneRef.current
          ) {
            setAttendance(res.attendance ?? {});
          }
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
      const startedAt = Date.now();
      getAttendanceAction(token)
        .then((res) => {
          if (!alive || !res.ok || !res.attendance) return;
          if (pendingRef.current.size > 0) return;
          // Snapshot read before the last write finished → stale, discard.
          if (startedAt < lastWriteDoneRef.current) return;
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
    // VERIFICA ⇒ PRESENZA (softened): only a CONFIRMED student's last marked
    // presence is untouchable — the confirmation is a hard fact that counts
    // as presence. A merely-SENT link no longer locks (the email leaves
    // minutes after the day-1 tap, so a mis-tap was permanently stuck).
    // Mirrors the server guard; the refusal renders AT the row, never a dead
    // tap. The "other day" check is bounded to 1..maxDay like the server's.
    if (!next) {
      const stu = students.find((x) => subjKey(x) === subj);
      const confirmed = Boolean(stu && (stu.emailConfirmedAt || stu.emailConfirmed));
      if (stu && confirmed) {
        const days = attendance[subj] ?? {};
        const hasOther = Object.entries(days).some(
          ([d, v]) => v && Number(d) !== day && Number(d) >= 1 && Number(d) <= maxDay,
        );
        if (!hasOther) {
          setRowError({
            subj,
            msg: `${stu.name || "Studente"} ha confermato i dati: la conferma vale come presenza, quindi almeno una giornata resta "Presente".`,
          });
          return;
        }
      }
    }
    const prev = !!attendance[subj]?.[day];
    setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: next } }));
    pendingRef.current.add(key);
    setPending((s) => new Set(s).add(key));
    setError(null);
    setRowError(null);
    const run = async () => {
      const res = await setAttendanceAction(token, subject, day, next).catch(
        () => ({ ok: false }) as { ok: boolean; schema?: boolean; error?: string },
      );
      if (!res.ok) {
        setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: prev } }));
        if (res.schema) setReadOnly(true);
        // A refusal about THIS student renders at their row, where the tap
        // happened — the top-of-page alert was invisible on long rosters.
        else setRowError({ subj, msg: res.error || "Salvataggio non riuscito, riprova." });
      }
      lastWriteDoneRef.current = Date.now();
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
              {rowError?.subj === subj && (
                <p
                  role="alert"
                  style={{
                    color: "var(--danger-fg)",
                    fontSize: 12.5,
                    margin: "6px 14px 2px",
                    lineHeight: 1.45,
                  }}
                >
                  {rowError.msg}
                </p>
              )}
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
  const [dialCode, setDialCode] = useState("+39");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ corsistaId: number; name: string; phone: string } | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneValid = /^\d{6,}$/.test(`${dialCode} ${phone}`.replace(/[\s\-().+]/g, ""));
  const missing: string[] = [];
  if (!firstName.trim()) missing.push("nome");
  if (!lastName.trim()) missing.push("cognome");
  if (!emailValid) missing.push("email");
  if (!phone.trim()) missing.push("telefono");
  else if (!phoneValid) missing.push("telefono valido");
  const ready = missing.length === 0;

  async function submit(linkTo?: number) {
    if (!ready || busy || !iscrizioneId) return;
    setBusy(true);
    setConflict(null);
    const res = await completeSeatFromLinkAction(
      token,
      iscrizioneId,
      `${firstName.trim().replace(/\s+/g, " ")} ${lastName.trim().replace(/\s+/g, " ")}`,
      email.trim(),
      `${dialCode} ${phone.trim()}`.trim(),
      linkTo,
    ).catch(() => ({ ok: false }) as Awaited<ReturnType<typeof completeSeatFromLinkAction>>);
    setBusy(false);
    if (res.ok && res.person) onCompleted(res.person);
    else if (res.conflict) setConflict(res.conflict);
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
        onChange={(e) => {
          setEmail(e.target.value);
          setConflict(null);
        }}
        placeholder="Email"
        maxLength={200}
        disabled={busy}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select
          className="edu-input"
          aria-label="Prefisso internazionale"
          value={dialCode}
          onChange={(e) => setDialCode(e.target.value)}
          disabled={busy}
          style={{ flex: "0 0 auto", width: 190 }}
        >
          {COUNTRY_CODES.map((cc) => (
            <option key={cc.c} value={cc.c}>
              {cc.f} {cc.n} {cc.c}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          className="edu-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefono"
          maxLength={40}
          disabled={busy}
          style={{ flex: "1 1 120px", minWidth: 120 }}
        />
      </div>
      {!ready && (firstName || lastName || email || phone) && (
        <div style={{ fontSize: 11.5, color: "#b45309" }}>
          Manca: {missing.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          className="edu-btn primary"
          onClick={() => submit()}
          disabled={busy || !ready}
          title={!ready ? `Compila: ${missing.join(", ")}` : undefined}
        >
          Salva
        </button>
        <button type="button" className="edu-btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
      {conflict && (
        <div
          style={{
            padding: "8px 10px",
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            borderRadius: 8,
            fontSize: 12,
            color: "#92400e",
            display: "grid",
            gap: 6,
          }}
        >
          <div>
            ⚠️ Questa email è già di <strong>{conflict.name || "un altro nominativo"}</strong>
            {conflict.phone ? ` · 📞 ${conflict.phone}` : ""}.
          </div>
          <div style={{ fontWeight: 600 }}>È la stessa persona?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className="edu-btn primary"
              disabled={busy}
              onClick={() => submit(conflict.corsistaId)}
            >
              Sì → collega
            </button>
            <button
              type="button"
              className="edu-btn"
              disabled={busy}
              onClick={() => {
                setConflict(null);
                setEmail("");
              }}
            >
              No → correggi email
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#a16207" }}>
            Ogni persona ha un&apos;email unica: se è un&apos;altra persona, inserisci la sua corretta.
          </div>
        </div>
      )}
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
        Cancella <strong>tutte le presenze</strong>, <strong>tutte le conferme email</strong> e{" "}
        <strong>lo stato «inviato» dei test</strong> di questo corso: l&apos;appello riparte da
        zero e gli studenti dovranno ri-confermare i dati. Email, telefoni e indirizzi restano
        salvati. Le consegne già fatte non vengono toccate. Non si può annullare.
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
  // Separate nome/cognome like SeatFillIn — one "Nome e cognome" field made
  // single-word names ambiguous and gave no hint about what was missing.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  // Optional here: the educator may add the person before knowing their
  // email. Giving it now means "Invia email" is ready the moment presence
  // is marked, with no detour through "Correggi".
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const missing: string[] = [];
  if (!firstName.trim()) missing.push("nome");
  if (!lastName.trim()) missing.push("cognome");
  const touched = firstName.trim() !== "" || lastName.trim() !== "";
  const ready = missing.length === 0;

  async function submit() {
    if (!ready || busy) return;
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    setBusy(true);
    const res = await addPartecipanteFromLinkAction(token, iscrizioneId, fullName, phone.trim(), email.trim()).catch(
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
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          className="edu-input"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Nome"
          maxLength={60}
          autoFocus
          disabled={busy}
          style={{ flex: 1 }}
        />
        <input
          type="text"
          className="edu-input"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Cognome"
          maxLength={60}
          disabled={busy}
          style={{ flex: 1 }}
        />
      </div>
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
      {touched && !ready && (
        <p style={{ color: "var(--warning-fg)", fontSize: 12, margin: "2px 0 0" }}>
          Manca: {missing.join(", ")}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="edu-btn primary"
          onClick={submit}
          disabled={busy || !ready}
          title={ready ? undefined : `Compila: ${missing.join(", ")}`}
        >
          Aggiungi
        </button>
        <button type="button" className="edu-btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
    </div>
  );
}
