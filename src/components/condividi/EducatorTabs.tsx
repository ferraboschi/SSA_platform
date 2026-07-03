"use client";

// The educator share page, organized in 4 TABS (mobile-first — the educator
// runs the whole course from their phone):
//   1. Appello        — attendance BY DAY (pick the day, tap the people present).
//   2. Verifica email — the sanitization flow: per attendee, confirm/correct
//                       email + phone and send the confirmation magic link.
//   3. Programma      — the sake programme by day, with photos and inline
//                       details (no page navigation).
//   4. Esami          — the ExamSendPanel (fixed sub-tabs per test).
//
// SECURITY: this client only ever holds the SIGNED TOKEN — every write goes
// through token-verified server actions that re-derive the course and enforce
// ownership (see attendance-actions.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAttendanceAction,
  setAttendanceAction,
  addPartecipanteFromLinkAction,
  setAttendeeEmailAction,
  setAttendeePhoneAction,
  sendAttendeeConfirmLinkAction,
  sendConfirmLinksToAllAction,
  type AttendanceMap,
  type AttendanceSubject,
} from "@/lib/share-links/attendance-actions";
import ExamSendPanel from "./ExamSendPanel";

// Local prop shapes (structurally match the loader types) so this client
// component never imports the server-only loader module.
export interface Student {
  id: number;
  kind: "corsista" | "partecipante";
  name: string;
  email: string;
  emailConfirmed: boolean;
  /** A confirmation link was already sent → "mail non ancora confermata". */
  confirmSent: boolean;
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

type TabId = "appello" | "email" | "programma" | "esami";

const subjKey = (s: Pick<Student, "kind" | "id">) => `${s.kind === "corsista" ? "c" : "p"}${s.id}`;

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
  // Students are shared across tabs (a companion added in Appello shows up in
  // Verifica email too), so the list lives here.
  const [students, setStudents] = useState<Student[]>(initialStudents);
  // ATTENDANCE lives here too: the Verifica email tab is GATED by presence —
  // a student becomes verifiable only once marked present at the appello.
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [attendanceReadOnly, setAttendanceReadOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    getAttendanceAction(token)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setAttendance(res.attendance ?? {});
          if (res.schema) setAttendanceReadOnly(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  // Present on ANY day → verifiable in the email tab.
  const presentKeys = new Set(
    Object.entries(attendance)
      .filter(([, days]) => Object.values(days).some(Boolean))
      .map(([k]) => k),
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: "appello", label: "Appello" },
    { id: "email", label: "Verifica email" },
    { id: "programma", label: "Programma" },
    ...(tests ? [{ id: "esami" as const, label: "Esami" }] : []),
  ];

  return (
    <div>
      {/* Plain toggle buttons (aria-pressed), NOT an ARIA tablist: native
          button semantics match the actual behavior (no arrow-key roving). */}
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
        <AppelloTab
          token={token}
          students={students}
          setStudents={setStudents}
          dayCount={dayCount}
          attendance={attendance}
          setAttendance={setAttendance}
          readOnly={attendanceReadOnly}
          setReadOnly={setAttendanceReadOnly}
        />
      )}
      {tab === "email" && (
        <EmailTab token={token} students={students} setStudents={setStudents} presentKeys={presentKeys} />
      )}
      {tab === "programma" && <ProgrammaTab days={days} />}
      {tab === "esami" && tests && (
        <ExamSendPanel token={token} tests={tests} students={students} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · APPELLO — attendance by day. Pick the day, tap who's present. The email
// link has nothing to do with presence: this is the educator's roll-call.
// ─────────────────────────────────────────────────────────────────────────────
function AppelloTab({
  token,
  students,
  setStudents,
  dayCount,
  attendance,
  setAttendance,
  readOnly,
  setReadOnly,
}: {
  token: string;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  dayCount: number;
  attendance: AttendanceMap;
  setAttendance: React.Dispatch<React.SetStateAction<AttendanceMap>>;
  readOnly: boolean;
  setReadOnly: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [day, setDay] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const chains = useRef<Map<string, Promise<void>>>(new Map());

  const dayList = useMemo(() => Array.from({ length: Math.max(1, dayCount) }, (_, i) => i + 1), [dayCount]);

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
      <p style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", margin: "0 0 10px" }}>
        {readOnly
          ? "Appello non ancora disponibile."
          : `Tocca chi è presente ${dayCount > 1 ? `al giorno ${day}` : "oggi"} — si salva da solo. Presenti: ${presentCount}/${students.length}.`}
      </p>
      {error && (
        <p style={{ color: "var(--red-600, #dc2626)", fontSize: 12, margin: "0 0 10px" }} role="alert">
          {error}
        </p>
      )}

      <div className="edu-list">
        {students.length === 0 && (
          <div className="edu-empty">Nessun iscritto al momento.</div>
        )}
        {students.map((s) => {
          const subj = subjKey(s);
          const key = cellKey(subj, day);
          const checked = !!attendance[subj]?.[day];
          const disabled = readOnly || pending.has(key);
          const tickets = s.tickets ?? 1;
          const used = s.companionsUsed ?? 0;
          const canAdd =
            !readOnly && s.kind === "corsista" && tickets >= 2 && used < tickets - 1 && s.iscrizioneId != null;
          return (
            <div key={subj}>
              <button
                type="button"
                className={`edu-row edu-row-tap ${checked ? "present" : ""}`}
                disabled={disabled}
                aria-pressed={checked}
                onClick={() => toggle({ kind: s.kind, id: s.id }, !checked)}
              >
                <span className={`edu-check ${checked ? "on" : ""}`} aria-hidden>
                  {checked ? "✓" : ""}
                </span>
                <span className="edu-row-main">
                  <span className="edu-row-name">
                    {s.name || "—"}
                    {s.kind === "partecipante" && (
                      <span className="edu-guest"> (ospite{s.guestOf ? ` di ${s.guestOf}` : ""})</span>
                    )}
                  </span>
                  <span className="edu-row-sub">{checked ? "Presente" : "Assente"}</span>
                </span>
              </button>
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
// 2 · VERIFICA EMAIL — the sanitization flow, one card per attendee: status,
// email + phone (both correctable), send-confirmation with copy fallback.
// ─────────────────────────────────────────────────────────────────────────────
function EmailTab({
  token,
  students,
  setStudents,
  presentKeys,
}: {
  token: string;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  presentKeys: Set<string>;
}) {
  const [allBusy, setAllBusy] = useState(false);
  const [allNote, setAllNote] = useState<string | null>(null);
  const pendingCount = students.filter((s) => presentKeys.has(subjKey(s)) && !s.emailConfirmed).length;

  const sendAll = async () => {
    if (allBusy) return;
    setAllBusy(true);
    setAllNote(null);
    const res = await sendConfirmLinksToAllAction(token).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof sendConfirmLinksToAllAction>>,
    );
    setAllBusy(false);
    if (!res.ok) {
      setAllNote(res.error || "Invio non riuscito.");
      return;
    }
    setStudents((prev) => prev.map((x) => (x.email ? { ...x, confirmSent: true } : x)));
    setAllNote(
      `Inviate ${res.sent ?? 0}/${res.total ?? 0}${res.noEmail ? ` · ${res.noEmail} senza email (usa il link singolo)` : ""}.`,
    );
  };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-3, #6b7280)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Prima segna le <strong>presenze all&apos;appello</strong>: chi è presente diventa
        verificabile qui. Correggi email o telefono sbagliati e invia il link di conferma —
        lo studente riceve l&apos;email, apre il link e conferma i suoi dati.
      </p>
      <button
        type="button"
        className="edu-btn primary"
        onClick={sendAll}
        disabled={allBusy}
        style={{ width: "100%", marginBottom: 8 }}
      >
        {allBusy ? "Invio…" : `Invia conferma a tutti${pendingCount ? ` (${pendingCount} da confermare)` : ""}`}
      </button>
      {allNote && (
        <p role="status" style={{ fontSize: 12, color: "var(--text-3, #6b7280)", margin: "0 0 10px" }}>
          {allNote}
        </p>
      )}
      <div className="edu-list">
        {students.map((s) => (
          <AttendeeCard
            key={subjKey(s)}
            token={token}
            student={s}
            present={presentKeys.has(subjKey(s))}
            onUpdated={(patch) =>
              setStudents((prev) =>
                prev.map((x) => (x.kind === s.kind && x.id === s.id ? { ...x, ...patch } : x)),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

// The three verification states (after the presence gate):
//   ⚪ absent            → "Assente — segna la presenza all'appello" (locked)
//   🟡 present, nothing sent → "Mail non confermata"        [Invia conferma]
//   🟠 sent, not confirmed   → "Mail non ancora confermata" [Reinvia]
//   🟢 confirmed             → "Mail confermata"
function cardState(s: Student, present: boolean) {
  if (s.emailConfirmed)
    return { dot: "var(--green-500, #22c55e)", label: "Mail confermata", color: "var(--green-600, #059669)" };
  if (!present)
    return { dot: "var(--border-strong, #d1d5db)", label: "Assente", color: "var(--text-4, #9ca3af)" };
  if (s.confirmSent)
    return { dot: "var(--amber-400, #f59e0b)", label: "Mail non ancora confermata", color: "var(--amber-500, #d97706)" };
  return { dot: "var(--amber-400, #f59e0b)", label: "Mail non confermata", color: "var(--amber-500, #d97706)" };
}

function AttendeeCard({
  token,
  student: s,
  present,
  onUpdated,
}: {
  token: string;
  student: Student;
  present: boolean;
  onUpdated: (patch: Partial<Student>) => void;
}) {
  const refId = s.kind === "corsista" ? s.iscrizioneId : s.id;
  const [editing, setEditing] = useState(false);
  const [draftEmail, setDraftEmail] = useState(s.email);
  const [draftPhone, setDraftPhone] = useState(s.phone);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  if (refId == null) return null;
  const ref = { kind: s.kind, id: refId };
  const st = cardState(s, present);

  const save = async () => {
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
      if (r.ok) onUpdated({ email: draftEmail.trim().toLowerCase(), emailConfirmed: false });
      else err = r.error || "Salvataggio email non riuscito.";
    }
    if (!err && phoneChanged) {
      const r = await setAttendeePhoneAction(token, ref, draftPhone.trim()).catch(
        () => ({ ok: false, error: "Errore di rete." }) as { ok: boolean; error?: string },
      );
      if (r.ok) onUpdated({ phone: draftPhone.trim() });
      else err = r.error || "Salvataggio telefono non riuscito.";
    }
    setBusy(false);
    if (err) setNote(err);
    else {
      setEditing(false);
      if (emailChanged) setNote(`D'ora in poi invierò a: ${draftEmail.trim().toLowerCase()}`);
    }
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, ref).catch(
      () => ({ ok: false, error: "Errore di rete." }) as {
        ok: boolean; url?: string; sentTo?: string; error?: string;
      },
    );
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || "Invio non riuscito.");
      return;
    }
    onUpdated({ confirmSent: true });
    if (res.sentTo) setNote(`Email inviata a ${res.sentTo} ✓ — in attesa di conferma.`);
    else {
      setNote(res.error ?? null);
      if (res.url) setLink(res.url);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copiato ✓ — invialo via WhatsApp o SMS.");
    } catch {
      window.prompt("Copia il link:", link);
    }
  };

  return (
    <div className="edu-card" style={present || s.emailConfirmed ? undefined : { opacity: 0.55 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className="edu-dot"
          role="img"
          aria-label={st.label}
          title={st.label}
          style={{ background: st.dot }}
        />
        <span className="edu-row-name" style={{ flex: 1, minWidth: 0 }}>
          {s.name || "—"}
          {s.kind === "partecipante" && (
            <span className="edu-guest"> (ospite{s.guestOf ? ` di ${s.guestOf}` : ""})</span>
          )}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, flexShrink: 0 }}>
          {st.label}
        </span>
      </div>

      {editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
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
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="edu-btn primary" onClick={save} disabled={busy || !draftEmail.trim()}>
              {busy ? "…" : "Salva"}
            </button>
            <button
              type="button"
              className="edu-btn"
              onClick={() => {
                setEditing(false);
                setDraftEmail(s.email);
                setDraftPhone(s.phone);
              }}
              disabled={busy}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="edu-contact">
            <span className="edu-contact-line">✉️ {s.email || <em>nessuna email</em>}</span>
            <span className="edu-contact-line">📞 {s.phone || <em>nessun numero</em>}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="edu-btn"
              onClick={() => {
                setDraftEmail(s.email);
                setDraftPhone(s.phone);
                setEditing(true);
                setNote(null);
              }}
              disabled={busy || !present}
            >
              Correggi
            </button>
            <button type="button" className="edu-btn primary" onClick={send} disabled={busy || !present}>
              {busy ? "…" : s.confirmSent && !s.emailConfirmed ? "Reinvia" : "Invia conferma"}
            </button>
          </div>
          {!present && !s.emailConfirmed && (
            <p style={{ fontSize: 11.5, color: "var(--text-4, #9ca3af)", margin: "8px 0 0" }}>
              Segna la presenza all&apos;appello per abilitare la verifica.
            </p>
          )}
        </>
      )}

      {note && (
        <div role="status" style={{ fontSize: 12, color: "var(--text-3, #6b7280)", marginTop: 8 }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// 3 · PROGRAMMA — sakes by day, photo + INLINE expandable details (info from
// the Sake Company Shopify catalog; no page navigation).
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
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-4, #9ca3af)" }}>
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
                <div key={id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-2, #f0f1f3)" }}>
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
                    <span aria-hidden style={{ color: "var(--text-4, #9ca3af)", flexShrink: 0 }}>
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
      <dt style={{ color: "var(--text-4, #9ca3af)", minWidth: 74 }}>{k}</dt>
      <dd style={{ margin: 0, color: "var(--text-2, #374151)", fontWeight: 500 }}>{v}</dd>
    </div>
  );
}
