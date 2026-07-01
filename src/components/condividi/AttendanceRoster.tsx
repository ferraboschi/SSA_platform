"use client";

// Roll-call ("appello") roster for the PUBLIC educator share link.
//
// Renders the enrolled roster with `dayCount` presence checkboxes per student
// (G1/G2/G3, or a single "Presente" for a 1-day course). State is hydrated on
// mount from getAttendanceAction(token) and each toggle does an optimistic
// update + setAttendanceAction(token, …), reverting on error. Per-cell writes
// are serialized so a fast double-toggle can't land out of order.
//
// SECURITY: the client only ever holds the SIGNED TOKEN — never a service
// client or a raw courseId. The server derives the course from the token and
// enforces enrollment + day bounds + rate limits (see attendance-actions.ts).

import { useEffect, useRef, useState } from "react";
import {
  getAttendanceAction,
  setAttendanceAction,
  type AttendanceMap,
} from "@/lib/share-links/attendance-actions";

interface Student {
  id: number;
  name: string;
  email: string;
  phone: string;
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
};

export default function AttendanceRoster({
  token,
  students,
  dayCount,
}: {
  token: string;
  students: Student[];
  dayCount: number;
}) {
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-cell write queue: serialize writes for a given (student, day) so a rapid
  // double-toggle can't race and land the wrong final value.
  const chains = useRef<Map<string, Promise<void>>>(new Map());
  // Track cells with an in-flight write to disable them (avoid pile-ups).
  const [pending, setPending] = useState<Set<string>>(new Set());

  const days = Array.from({ length: Math.max(1, dayCount) }, (_, i) => i + 1);

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

  const cellKey = (studentId: number, day: number) => `${studentId}:${day}`;

  function toggle(studentId: number, day: number, next: boolean) {
    if (readOnly) return;
    const key = cellKey(studentId, day);
    const prev = !!attendance[studentId]?.[day];

    // Optimistic update.
    setAttendance((m) => ({ ...m, [studentId]: { ...(m[studentId] ?? {}), [day]: next } }));
    setPending((s) => new Set(s).add(key));
    setError(null);

    const run = async () => {
      const res = await setAttendanceAction(token, studentId, day, next).catch(
        () => ({ ok: false }) as { ok: boolean; schema?: boolean; error?: string },
      );
      if (!res.ok) {
        // Revert to the pre-toggle value and surface the error.
        setAttendance((m) => ({ ...m, [studentId]: { ...(m[studentId] ?? {}), [day]: prev } }));
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
        {students.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: i === students.length - 1 ? "none" : "1px solid var(--border-2, #f0f1f3)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "var(--surface-2, #f4f5f7)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-3, #6b7280)",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 140px", minWidth: 0 }}>
              {s.name || "—"}
            </span>
            {s.email && (
              <a
                href={`mailto:${s.email}`}
                style={{ fontSize: 12, color: "var(--indigo-600, #4f46e5)", textDecoration: "none", flex: "1 1 180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {s.email}
              </a>
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
                const key = cellKey(s.id, day);
                const checked = !!attendance[s.id]?.[day];
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
                      onChange={(e) => toggle(s.id, day, e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "var(--indigo-600, #4f46e5)", cursor: disabled ? "default" : "pointer" }}
                    />
                    {dayCount > 1 ? T.day(day) : T.present}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
