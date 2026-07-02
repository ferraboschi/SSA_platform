"use client";

// Roll-call ("appello") roster for the PUBLIC educator share link.
//
// Renders the enrolled roster with `dayCount` presence checkboxes per SUBJECT.
// A subject is EITHER an enrolled corsista OR a "companion" (an extra attendee
// entered for a buyer who bought >=2 seats — a "doppio"). State is hydrated on
// mount from getAttendanceAction(token) (keyed by a subject string `c<id>` /
// `p<id>`) and each toggle does an optimistic update + setAttendanceAction(...),
// reverting on error. Per-cell writes are serialized so a fast double-toggle
// can't land out of order.
//
// For a corsista row that is a "doppio" with a free slot, an inline
// "Aggiungi partecipante" mini-form calls addPartecipanteFromLinkAction and
// optimistically adds the new companion row.
//
// SECURITY: the client only ever holds the SIGNED TOKEN — never a service
// client or a raw courseId. The server derives the course from the token and
// enforces enrollment/ownership + day bounds + rate limits + the doubles-only
// companion rule (see attendance-actions.ts). Every UI gate is re-checked
// server-side.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAttendanceAction,
  setAttendanceAction,
  addPartecipanteFromLinkAction,
  setAttendeeEmailAction,
  sendAttendeeConfirmLinkAction,
  type AttendanceMap,
  type AttendanceSubject,
} from "@/lib/share-links/attendance-actions";

interface Student {
  id: number;
  kind: "corsista" | "partecipante";
  name: string;
  email: string;
  emailConfirmed: boolean;
  phone: string;
  iscrizioneId?: number;
  tickets?: number;
  companionsUsed?: number;
  guestOf?: string;
}

// Public share page renders in hardcoded Italian (no i18n hook in this route);
// the shared keys live in dictionaries under `condividi.appello`.
const T = {
  title: "Appello",
  hint: "Segna le presenze per ogni giornata. Le modifiche si salvano da sole.",
  present: "Presente",
  day: (n: number) => `G${n}`,
  empty: "Nessun iscritto al momento.",
  readonly: "Appello non ancora disponibile.",
  saveError: "Salvataggio non riuscito, riprova.",
  guestOf: (name: string) => (name ? `ospite di ${name}` : "ospite"),
  addParticipant: "Aggiungi partecipante",
  name: "Nome",
  phone: "Telefono",
  add: "Aggiungi",
  cancel: "Annulla",
  addError: "Aggiunta non riuscita, riprova.",
  emailConfirmed: "Email confermata",
  emailPending: "In attesa di conferma",
  correct: "Correggi",
  send: "Invia conferma",
  save: "Salva",
  noEmail: "nessuna email",
  emailPlaceholder: "email@esempio.it",
  sentTo: (e: string) => `Inviata a ${e}`,
  copyLink: "Copia link",
  linkCopied: "Link copiato ✓",
  emailError: "Operazione non riuscita, riprova.",
};

// A subject's stable UI key: `c<corsistaId>` or `p<partecipanteId>`. Matches the
// attendance map keys produced server-side.
const subjKey = (s: Pick<Student, "kind" | "id">) => `${s.kind === "corsista" ? "c" : "p"}${s.id}`;

export default function AttendanceRoster({
  token,
  students: initialStudents,
  dayCount,
}: {
  token: string;
  students: Student[];
  dayCount: number;
}) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-cell write queue: serialize writes for a given (subject, day) so a rapid
  // double-toggle can't race and land the wrong final value.
  const chains = useRef<Map<string, Promise<void>>>(new Map());
  // Track cells with an in-flight write to disable them (avoid pile-ups).
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Which corsista row currently has its "add participant" form open.
  const [addOpen, setAddOpen] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: Math.max(1, dayCount) }, (_, i) => i + 1),
    [dayCount],
  );

  useEffect(() => {
    let alive = true;
    getAttendanceAction(token)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setAttendance(res.attendance ?? {});
          if (res.schema) setReadOnly(true); // table missing → read-only roster
        }
      })
      .catch(() => {
        /* leave empty; toggling will surface any real error */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const cellKey = (subj: string, day: number) => `${subj}:${day}`;

  function toggle(subject: AttendanceSubject, day: number, next: boolean) {
    if (readOnly) return;
    const subj = subjKey(subject);
    const key = cellKey(subj, day);
    const prev = !!attendance[subj]?.[day];

    // Optimistic update.
    setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: next } }));
    setPending((s) => new Set(s).add(key));
    setError(null);

    const run = async () => {
      const res = await setAttendanceAction(token, subject, day, next).catch(
        () => ({ ok: false }) as { ok: boolean; schema?: boolean; error?: string },
      );
      if (!res.ok) {
        // Revert to the pre-toggle value and surface the error.
        setAttendance((m) => ({ ...m, [subj]: { ...(m[subj] ?? {}), [day]: prev } }));
        if (res.schema) setReadOnly(true);
        else setError(res.error || T.saveError);
      }
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    };

    // Chain onto any in-flight write for this same cell so writes serialize.
    const tail = (chains.current.get(key) ?? Promise.resolve()).then(run, run);
    chains.current.set(key, tail);
  }

  if (students.length === 0) {
    return (
      <>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>{T.title}</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, fontStyle: "italic", marginBottom: 20 }}>
          {T.empty}
        </p>
      </>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>{T.title}</h2>
      <p style={{ color: "var(--text-3, #6b7280)", fontSize: 12, margin: "0 0 12px" }}>
        {readOnly ? T.readonly : T.hint}
      </p>
      {error && (
        <p style={{ color: "var(--red-600, #dc2626)", fontSize: 12, margin: "0 0 10px" }} role="alert">
          {error}
        </p>
      )}
      <div
        style={{
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        {students.map((s, i) => {
          const subj = subjKey(s);
          const isCompanion = s.kind === "partecipante";
          const tickets = s.tickets ?? 1;
          const used = s.companionsUsed ?? 0;
          // A corsista with unfilled companion slots can add a participant.
          const canAdd =
            !readOnly && !isCompanion && tickets >= 2 && used < tickets - 1 && s.iscrizioneId != null;
          const formOpen = canAdd && addOpen === subj;
          return (
            <div key={`${subj}-${i}`} style={{ borderBottom: i === students.length - 1 ? "none" : "1px solid var(--border-2, #f0f1f3)" }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: isCompanion ? "var(--surface-2, #f9fafb)" : undefined,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: isCompanion ? "var(--indigo-50, #eef2ff)" : "var(--surface-2, #f4f5f7)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: isCompanion ? "var(--indigo-600, #4f46e5)" : "var(--text-3, #6b7280)",
                    flexShrink: 0,
                  }}
                >
                  {isCompanion ? "+" : i + 1}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 140px", minWidth: 0 }}>
                  {s.name || "—"}
                  {isCompanion && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: "var(--text-3, #6b7280)", fontStyle: "italic" }}>
                      ({T.guestOf(s.guestOf ?? "")})
                    </span>
                  )}
                </span>
                {s.kind === "partecipante" || s.iscrizioneId != null ? (
                  <AttendeeEmail
                    token={token}
                    kind={s.kind}
                    refId={s.kind === "corsista" ? s.iscrizioneId! : s.id}
                    email={s.email}
                    confirmed={s.emailConfirmed}
                    readOnly={readOnly}
                  />
                ) : (
                  s.email && (
                    <span style={{ fontSize: 12, color: "var(--text-3, #6b7280)", flex: "1 1 180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.email}
                    </span>
                  )
                )}
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    style={{ fontSize: 12, color: "var(--text-2, #374151)", textDecoration: "none", flexShrink: 0 }}
                  >
                    {s.phone}
                  </a>
                )}
                <div style={{ display: "flex", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
                  {days.map((day) => {
                    const key = cellKey(subj, day);
                    const checked = !!attendance[subj]?.[day];
                    const disabled = readOnly || pending.has(key);
                    return (
                      <label
                        key={day}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          color: "var(--text-2, #374151)",
                          cursor: disabled ? "default" : "pointer",
                          opacity: disabled && !readOnly ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => toggle({ kind: s.kind, id: s.id }, day, e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: "var(--indigo-600, #4f46e5)", cursor: disabled ? "default" : "pointer" }}
                        />
                        {dayCount > 1 ? T.day(day) : T.present}
                      </label>
                    );
                  })}
                </div>
                {canAdd && !formOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setAddOpen(subj);
                    }}
                    style={{
                      flexShrink: 0,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "var(--indigo-600, #4f46e5)",
                      background: "transparent",
                      border: "1px dashed var(--indigo-200, #c7d2fe)",
                      borderRadius: 8,
                      padding: "4px 9px",
                      cursor: "pointer",
                    }}
                  >
                    + {T.addParticipant}
                  </button>
                )}
              </div>
              {formOpen && s.iscrizioneId != null && (
                <AddParticipantForm
                  token={token}
                  iscrizioneId={s.iscrizioneId}
                  onCancel={() => setAddOpen(null)}
                  onSchema={() => {
                    setReadOnly(true);
                    setAddOpen(null);
                  }}
                  onError={(m) => setError(m)}
                  onAdded={(companion) => {
                    // Optimistically add the new companion row directly after the
                    // corsista, and bump its used-slot count.
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
    </>
  );
}

function AddParticipantForm({
  token,
  iscrizioneId,
  onAdded,
  onCancel,
  onSchema,
  onError,
}: {
  token: string;
  iscrizioneId: number;
  onAdded: (companion: { id: number; full_name: string; phone: string }) => void;
  onCancel: () => void;
  onSchema: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await addPartecipanteFromLinkAction(token, iscrizioneId, trimmed, phone.trim()).catch(
      () => ({ ok: false }) as { ok: boolean; schema?: boolean; error?: string; companion?: { id: number; full_name: string; phone: string } },
    );
    setBusy(false);
    if (res.ok && res.companion) {
      onAdded(res.companion);
    } else if (res.schema) {
      onSchema();
    } else {
      onError(res.error || T.addError);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "8px 14px 12px 46px",
        background: "var(--surface-2, #f9fafb)",
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={T.name}
        maxLength={120}
        disabled={busy}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        style={{
          flex: "1 1 150px",
          minWidth: 0,
          fontSize: 12.5,
          padding: "6px 9px",
          borderRadius: 8,
          border: "1px solid var(--border, #e5e7eb)",
        }}
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={T.phone}
        maxLength={40}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        style={{
          flex: "1 1 120px",
          minWidth: 0,
          fontSize: 12.5,
          padding: "6px 9px",
          borderRadius: 8,
          border: "1px solid var(--border, #e5e7eb)",
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !name.trim()}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#fff",
          background: "var(--indigo-600, #4f46e5)",
          border: "none",
          borderRadius: 8,
          padding: "6px 12px",
          cursor: busy || !name.trim() ? "default" : "pointer",
          opacity: busy || !name.trim() ? 0.6 : 1,
        }}
      >
        {T.add}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-2, #374151)",
          background: "transparent",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 8,
          padding: "6px 12px",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {T.cancel}
      </button>
    </div>
  );
}

function MiniBtn({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 8px",
        borderRadius: 7,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        border: primary ? "none" : "1px solid var(--border, #e5e7eb)",
        background: primary ? "var(--indigo-600, #4f46e5)" : "transparent",
        color: primary ? "#fff" : "var(--text-2, #374151)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Per-attendee email confirmation control on the appello. Shows a status dot
 * (green = confirmed by the student, amber = pending), the current target email,
 * and lets the educator correct it (setAttendeeEmailAction) or send the
 * confirmation magic-link (sendAttendeeConfirmLinkAction). In test mode the link
 * isn't emailed — it's returned here to copy for WhatsApp/SMS.
 */
function AttendeeEmail({
  token,
  kind,
  refId,
  email: initialEmail,
  confirmed: initialConfirmed,
  readOnly,
}: {
  token: string;
  kind: "corsista" | "partecipante";
  refId: number;
  email: string;
  confirmed: boolean;
  readOnly?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const save = async () => {
    const clean = draft.trim();
    if (!clean || busy) return;
    setBusy(true);
    setNote(null);
    const res = await setAttendeeEmailAction(token, { kind, id: refId }, clean).catch(
      () => ({ ok: false }) as { ok: boolean; error?: string },
    );
    setBusy(false);
    if (res.ok) {
      setEmail(clean);
      setConfirmed(false);
      setEditing(false);
    } else {
      setNote(res.error || T.emailError);
    }
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setLink(null);
    const res = await sendAttendeeConfirmLinkAction(token, { kind, id: refId }).catch(
      () => ({ ok: false }) as { ok: boolean; sentTo?: string; url?: string; error?: string },
    );
    setBusy(false);
    if (!res.ok) {
      setNote(res.error || T.emailError);
      return;
    }
    if (res.sentTo) {
      setNote(T.sentTo(res.sentTo));
    } else {
      setNote(res.error ?? null);
      if (res.url) setLink(res.url);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote(T.linkCopied);
    } catch {
      window.prompt(T.copyLink, link);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 230px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span
          title={confirmed ? T.emailConfirmed : T.emailPending}
          aria-label={confirmed ? T.emailConfirmed : T.emailPending}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            background: confirmed ? "var(--green-500, #22c55e)" : "var(--amber-400, #f59e0b)",
          }}
        />
        {editing ? (
          <input
            type="email"
            inputMode="email"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={T.emailPlaceholder}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              padding: "5px 8px",
              borderRadius: 7,
              border: "1px solid var(--border, #e5e7eb)",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 12,
              color: email ? "var(--text-2, #374151)" : "var(--text-4, #9ca3af)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {email || T.noEmail}
          </span>
        )}
        {!readOnly &&
          (editing ? (
            <>
              <MiniBtn onClick={save} disabled={busy || !draft.trim()} primary>
                {T.save}
              </MiniBtn>
              <MiniBtn
                onClick={() => {
                  setEditing(false);
                  setDraft(email);
                }}
                disabled={busy}
              >
                {T.cancel}
              </MiniBtn>
            </>
          ) : (
            <>
              <MiniBtn
                onClick={() => {
                  setDraft(email);
                  setEditing(true);
                  setNote(null);
                }}
                disabled={busy}
              >
                {T.correct}
              </MiniBtn>
              <MiniBtn onClick={send} disabled={busy} primary>
                {busy ? "…" : T.send}
              </MiniBtn>
            </>
          ))}
      </div>
      {note && (
        <div style={{ fontSize: 11, color: "var(--text-3, #6b7280)" }}>
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
                {T.copyLink}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
