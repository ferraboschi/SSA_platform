"use client";

// The educator share page — 3 tabs, mobile-first, styled STRICTLY on the
// platform design system (tokens.css + the shared .badge/.btn language):
//   1. Appello   — attendance by day MERGED with email verification. Tap who's
//                  present; every row always shows its verification state
//                  (chip with server timestamp) and exactly the actions that
//                  state allows. Green = confirmed, and nothing else.
//   2. Programma — sake programme by day, photos + inline details.
//   3. Esami     — ExamSendPanel (fixed sub-tabs, live progress bars).
//
// The verification flow is AIRTIGHT (see lib/share-links/verification-state):
// free edits only before the first send; while a link is out, corrections
// happen exclusively via the atomic correct-and-resend; a confirmed student
// re-opens only through "Richiedi nuova conferma". The same rules are
// enforced server-side in attendance-actions.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAttendanceAction,
  setAttendanceAction,
  addPartecipanteFromLinkAction,
  setAttendeeEmailAction,
  setAttendeePhoneAction,
  sendAttendeeConfirmLinkAction,
  correctAndResendAction,
  getVerificationStatesAction,
  type AttendanceMap,
  type AttendanceSubject,
} from "@/lib/share-links/attendance-actions";
import {
  deriveVerificationState,
  chipLabel,
  newerIso,
  type VerificationStateId,
} from "@/lib/share-links/verification-state";
import ExamSendPanel from "./ExamSendPanel";

// Local prop shapes (structurally match the loader types) so this client
// component never imports the server-only loader module.
export interface Student {
  id: number;
  kind: "corsista" | "partecipante";
  name: string;
  email: string;
  emailConfirmed: boolean;
  confirmSent: boolean;
  confirmSentAt: string | null;
  emailConfirmedAt: string | null;
  phone: string;
  iscrizioneId?: number;
  tickets?: number;
  companionsUsed?: number;
  guestOf?: string;
}
export interface SakeRow {
  code: string;
  name: string;
  type: string;
  sakagura: string;
  size: number;
  cost: number;
  qty: number;
  image: string | null;
  url: string | null;
}
export interface DayRow {
  day: number;
  name: string;
  sakes: SakeRow[];
}
export interface TestRow {
  key: string;
  label: string;
  isFinal: boolean;
  configured: boolean;
  url: string;
  closedAt: string | null;
}

type TabId = "appello" | "programma" | "esami";

const subjKey = (s: Pick<Student, "kind" | "id">) => `${s.kind === "corsista" ? "c" : "p"}${s.id}`;

const CHIP_CLASS: Record<VerificationStateId, string> = {
  assente: "badge badge-neutral",
  verificare: "badge badge-indigo",
  attesa: "badge badge-warning",
  confermato: "badge badge-success",
};

export default function EducatorTabs({
  token,
  students: initialStudents,
  dayCount,
  days,
  tests,
}: {
  token: string;
  students: Student[];
  dayCount: number;
  days: DayRow[];
  tests: TestRow[] | null;
}) {
  const [tab, setTab] = useState<TabId>("appello");
  const [students, setStudents] = useState<Student[]>(initialStudents);

  // LIVE verification states: poll so the educator SEES the green flip the
  // moment a student completes the confirmation. Newer-wins merge — a poll
  // computed before a local send can never revert its timestamp.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      getVerificationStatesAction(token)
        .then((res) => {
          if (!alive || !res.ok || !res.states) return;
          const states = res.states;
          setStudents((prev) =>
            prev.map((s) => {
              const st = states[subjKey(s)];
              if (!st) return s;
              const sentAt = newerIso(s.confirmSentAt, st.sentAtIso);
              const confirmedAt = st.confirmedAtIso; // server truth (may clear via richiedi-nuova)
              return {
                ...s,
                email: st.email || s.email,
                phone: st.phone || s.phone,
                confirmSentAt: sentAt,
                confirmSent: Boolean(sentAt),
                emailConfirmedAt: confirmedAt,
                emailConfirmed: Boolean(confirmedAt),
              };
            }),
          );
        })
        .catch(() => {});
    };
    const id = setInterval(tick, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "appello", label: "Appello" },
    { id: "programma", label: "Programma" },
    ...(tests ? [{ id: "esami" as const, label: "Esami" }] : []),
  ];

  return (
    <div>
      <div className="edu-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            className={`edu-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "appello" && (
        <AppelloTab token={token} students={students} setStudents={setStudents} dayCount={dayCount} />
      )}
      {tab === "programma" && <ProgrammaTab days={days} />}
      {tab === "esami" && tests && <ExamSendPanel token={token} tests={tests} students={students} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · APPELLO — attendance + verification, every state always visible.
// ─────────────────────────────────────────────────────────────────────────────
function AppelloTab({
  token,
  students,
  setStudents,
  dayCount,
}: {
  token: string;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  dayCount: number;
}) {
  const [day, setDay] = useState(1);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const chains = useRef<Map<string, Promise<void>>>(new Map());

  const dayList = useMemo(() => Array.from({ length: Math.max(1, dayCount) }, (_, i) => i + 1), [dayCount]);

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

  const presentAny = (subj: string) => Object.values(attendance[subj] ?? {}).some(Boolean);
  const cellKey = (subj: string, d: number) => `${subj}:${d}`;

  function toggle(subject: AttendanceSubject, next: boolean) {
    if (readOnly) return;
    const subj = subjKey(subject);
    const key = cellKey(subj, day);
    const prev = !!attendance[subj]?.[day];
    setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: next } }));
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
      {dayCount > 1 && (
        <div className="edu-days" aria-label="Giornata">
          {dayList.map((d) => (
            <button
              key={d}
              aria-pressed={day === d}
              className={`edu-day ${day === d ? "active" : ""}`}
              onClick={() => setDay(d)}
            >
              Giorno {d}
            </button>
          ))}
        </div>
      )}
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 10px", lineHeight: 1.5 }}>
        {readOnly
          ? "Appello non ancora disponibile."
          : `Chiama l'appello e tocca chi è presente ${dayCount > 1 ? `(giorno ${day})` : ""} — si salva da solo. Presenti: ${presentCount}/${students.length}. Chi è presente può ricevere subito l'email di conferma dati. Verde = dati confermati.`}
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
          const canAdd =
            !readOnly && s.kind === "corsista" && tickets >= 2 && used < tickets - 1 && s.iscrizioneId != null;
          return (
            <div key={subj} className="edu-rowwrap" data-state={state}>
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
                    <span className="edu-row-name" style={state === "confermato" ? { color: "var(--success-fg)" } : undefined}>
                      {s.name || "—"}
                      {s.kind === "partecipante" && (
                        <span className="edu-guest"> (ospite{s.guestOf ? ` di ${s.guestOf}` : ""})</span>
                      )}
                    </span>
                    <span className="edu-row-sub">{checked ? "Presente" : "Assente"}</span>
                  </span>
                </button>
                <span className={CHIP_CLASS[state]} style={{ justifySelf: "start", whiteSpace: "nowrap" }}>
                  {chipLabel(state, s.confirmSentAt, s.emailConfirmedAt)}
                </span>
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
              </div>
              {canAdd && addOpen !== subj && (
                <button type="button" className="edu-addlink" onClick={() => setAddOpen(subj)}>
                  + Aggiungi partecipante (biglietto doppio)
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
                        email: "",
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
    </div>
  );
}

/** Contact line + the EXACT buttons the state allows (+ the edit form, which
 *  is the only thing that expands). */
function VerifyActions({
  token,
  student: s,
  state,
  onUpdated,
}: {
  token: string;
  student: Student;
  state: VerificationStateId;
  onUpdated: (patch: Partial<Student>) => void;
}) {
  const refId = s.kind === "corsista" ? s.iscrizioneId : s.id;
  const [editing, setEditing] = useState(false);
  const [draftEmail, setDraftEmail] = useState(s.email);
  const [draftPhone, setDraftPhone] = useState(s.phone);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  if (refId == null) return <span />;
  const ref = { kind: s.kind, id: refId };

  const applySendResult = (res: { sentTo?: string; sentAtIso?: string; url?: string; error?: string }, successNote: string) => {
    onUpdated({
      confirmSent: true,
      confirmSentAt: newerIso(s.confirmSentAt, res.sentAtIso ?? new Date().toISOString()),
    });
    if (res.sentTo) setNote(successNote);
    else {
      setNote(res.error ?? null);
      if (res.url) setLink(res.url);
    }
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, ref).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendAttendeeConfirmLinkAction>>,
    );
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito. Riprova tra un minuto.");
      return;
    }
    applySendResult(res, `Email inviata a ${res.sentTo} — in attesa di conferma.`);
  };

  // "Se non l'ha ricevuta": mint the link and copy it — the educator hands it
  // over via WhatsApp/SMS, outside the platform.
  const copyManualLink = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, ref, "link").catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendAttendeeConfirmLinkAction>>,
    );
    setBusy(false);
    if (!res.ok || !res.url) {
      setNote(res.error || "Generazione non riuscita. Riprova tra un minuto.");
      return;
    }
    onUpdated({
      confirmSent: true,
      confirmSentAt: newerIso(s.confirmSentAt, res.sentAtIso ?? new Date().toISOString()),
    });
    try {
      await navigator.clipboard.writeText(res.url);
      setNote("Link copiato — invialo via WhatsApp o SMS.");
    } catch {
      setLink(res.url);
      setNote("Link generato:");
    }
  };

  const saveFree = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const emailChanged = draftEmail.trim().toLowerCase() !== (s.email || "").trim().toLowerCase();
    const phoneChanged = draftPhone.trim() !== (s.phone || "").trim();
    let err: string | null = null;
    if (emailChanged) {
      const r = await setAttendeeEmailAction(token, ref, draftEmail.trim()).catch(
        () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
      );
      if (r.ok) onUpdated({ email: draftEmail.trim().toLowerCase() });
      else err = r.error || "Salvataggio non riuscito, riprova.";
    }
    if (!err && phoneChanged) {
      const r = await setAttendeePhoneAction(token, ref, draftPhone.trim()).catch(
        () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
      );
      if (r.ok) onUpdated({ phone: draftPhone.trim() });
      else err = r.error || "Salvataggio non riuscito, riprova.";
    }
    setBusy(false);
    if (err) setNote(err);
    else setEditing(false);
  };

  const saveAndResend = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await correctAndResendAction(token, ref, {
      email: draftEmail.trim(),
      phone: draftPhone.trim(),
    }).catch(() => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof correctAndResendAction>>);
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito. Riprova tra un minuto.");
      return;
    }
    setEditing(false);
    onUpdated({ email: draftEmail.trim().toLowerCase(), phone: draftPhone.trim() });
    applySendResult(res, `Email aggiornata a ${draftEmail.trim().toLowerCase()} · nuovo link inviato.`);
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copiato — invialo via WhatsApp o SMS.");
    } catch {
      window.prompt("Copia il link:", link);
    }
  };

  const openEdit = () => {
    setDraftEmail(s.email);
    setDraftPhone(s.phone);
    setEditing(true);
    setNote(null);
  };

  return (
    <div className="edu-actions">
      <div className="edu-contact">
        <span className="edu-contact-line">
          <span className="edu-contact-k">Email:</span> {s.email || <em>nessuna email</em>}
        </span>
        <span className="edu-contact-line">
          <span className="edu-contact-k">Tel:</span> {s.phone || <em>nessun numero</em>}
        </span>
      </div>

      {editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input
            type="email"
            inputMode="email"
            className="edu-input"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="email@esempio.it"
          />
          <input
            type="tel"
            inputMode="tel"
            className="edu-input"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            placeholder="Telefono"
            maxLength={40}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state === "attesa" ? (
              <button type="button" className="edu-btn primary" onClick={saveAndResend} disabled={busy || !draftEmail.trim()}>
                {busy ? "…" : "Salva e rinvia"}
              </button>
            ) : (
              <button type="button" className="edu-btn primary" onClick={saveFree} disabled={busy || !draftEmail.trim()}>
                {busy ? "…" : "Salva"}
              </button>
            )}
            <button type="button" className="edu-btn" onClick={() => setEditing(false)} disabled={busy}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <>
          {(state === "verificare" || state === "attesa") && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="edu-btn"
                onClick={openEdit}
                disabled={busy}
              >
                {state === "attesa" ? "Correggi e rinvia" : "Correggi"}
              </button>
              <button type="button" className="edu-btn" onClick={copyManualLink} disabled={busy}>
                {busy ? "…" : "Copia link"}
              </button>
              <button
                type="button"
                className="edu-btn primary"
                onClick={send}
                disabled={busy || !s.email}
                title={!s.email ? "Aggiungi un'email per inviare la conferma." : undefined}
              >
                {busy ? "…" : state === "attesa" ? "Reinvia email" : "Invia email"}
              </button>
            </div>
          )}
          {/* Confermato: the data is FINAL — read-only, no actions. */}
          {state === "verificare" && !s.email && (
            <p className="edu-hint">Aggiungi un&apos;email per inviare la conferma.</p>
          )}
          {state === "attesa" && (
            <p className="edu-hint edu-hint--lock">Email e telefono bloccati fino alla conferma dello studente.</p>
          )}
        </>
      )}

      {note && (
        <div role="status" style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>
          {note}
          {link && (
            <>
              {" "}
              <button type="button" className="edu-linkbtn" onClick={copyLink}>
                Copia link
              </button>
            </>
          )}
        </div>
      )}
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
  onAdded: (c: { id: number; full_name: string; phone: string }) => void;
  onCancel: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await addPartecipanteFromLinkAction(token, iscrizioneId, trimmed, phone.trim()).catch(
      () => ({ ok: false }) as { ok: boolean; error?: string; companion?: { id: number; full_name: string; phone: string } },
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

// ─────────────────────────────────────────────────────────────────────────────
// 2 · PROGRAMMA — sakes by day, photo + inline expandable details.
// ─────────────────────────────────────────────────────────────────────────────
function ProgrammaTab({ days }: { days: DayRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (days.length === 0) {
    return <div className="edu-empty">Il programma non è ancora stato pubblicato.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {days.map((d) => (
        <div key={d.day} className="edu-daycard">
          <div className="edu-daycard-head">
            <span className="edu-daybadge">G{d.day}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name || `Giorno ${d.day}`}</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-4)" }}>
              {d.sakes.length} sake
            </span>
          </div>
          {d.sakes.length === 0 ? (
            <div className="edu-empty" style={{ border: "none" }}>
              Nessun sake assegnato a questa giornata.
            </div>
          ) : (
            d.sakes.map((s, i) => {
              const id = `${d.day}-${s.code}-${i}`;
              const expanded = open === id;
              return (
                <div key={id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-2)" }}>
                  <button
                    type="button"
                    className="edu-row edu-row-tap"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : id)}
                  >
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image} alt="" className="edu-sake-thumb" />
                    ) : (
                      <span className="edu-sake-thumb edu-sake-thumb-empty">{s.code || "—"}</span>
                    )}
                    <span className="edu-row-main">
                      <span className="edu-row-name">{s.name}</span>
                      <span className="edu-row-sub">
                        {[s.type, s.size ? `${s.size}ml` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span aria-hidden style={{ color: "var(--text-4)", flexShrink: 0 }}>
                      {expanded ? "▴" : "▾"}
                    </span>
                  </button>
                  {expanded && (
                    <div className="edu-sake-detail">
                      {s.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image} alt={s.name} className="edu-sake-photo" />
                      )}
                      <dl className="edu-sake-facts">
                        {s.type && <Fact k="Tipo" v={s.type} />}
                        {s.sakagura && <Fact k="Sakagura" v={s.sakagura} />}
                        {s.size > 0 && <Fact k="Formato" v={`${s.size} ml`} />}
                        {s.qty > 0 && <Fact k="Bottiglie" v={String(s.qty)} />}
                        {s.code && <Fact k="Codice" v={s.code} />}
                      </dl>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="edu-linkbtn">
                          Scheda completa su Sake Company ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
      <dt style={{ color: "var(--text-4)", minWidth: 74 }}>{k}</dt>
      <dd style={{ margin: 0, color: "var(--text-2)", fontWeight: 500 }}>{v}</dd>
    </div>
  );
}
