"use client";

// Staff notes on a student ("ripete", "deve fare l'esame"…): list + add +
// soft delete. Used under each row of the course roster (compact) and on the
// corsista profile. Visible to staff (and, on the share page, the educator).
import { useState } from "react";
import { Badge } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { CorsistaNote } from "@/lib/domain";
import { addCorsistaNoteAction, deleteCorsistaNoteAction } from "@/lib/corsisti/note-actions";

export function fmtNoteDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function CorsistaNotes({
  corsistaId,
  corsoId,
  notes: initial,
  compact,
}: {
  corsistaId: number;
  /** The course the note is written from (roster) — null on the profile. */
  corsoId: number | null;
  notes: CorsistaNote[];
  /** Roster mode: smaller type, course chip hidden (it's this course). */
  compact?: boolean;
}) {
  const t = useT().corsisti.notes;
  const [notes, setNotes] = useState<CorsistaNote[]>(initial);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addCorsistaNoteAction({ corsistaId, corsoId, text }).catch(
      () => ({ ok: false, error: t.saveError }) as Awaited<ReturnType<typeof addCorsistaNoteAction>>,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error || t.saveError);
      return;
    }
    setNotes((prev) => [...prev, res.note]);
    setText("");
    setOpen(false);
  };

  const remove = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteCorsistaNoteAction(id).catch(() => ({ ok: false, error: t.saveError }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error || t.saveError);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const fs = compact ? 11.5 : 13;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: compact ? 4 : 0 }}>
      {notes.length === 0 && !compact && <div style={{ fontSize: fs, color: "var(--text-4)" }}>{t.empty}</div>}
      {notes.map((n) => (
        <div
          key={n.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: fs,
            lineHeight: 1.4,
            color: "var(--text-2)",
            padding: compact ? "3px 8px" : "8px 12px",
            background: "var(--warning-bg)",
            border: "1px solid var(--warning)",
            borderRadius: 8,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span style={{ color: "var(--text-4)", fontSize: fs - 1 }}>
              {fmtNoteDate(n.createdAt)} · {n.author}
              {!compact && n.courseTitle ? ` · ${n.courseTitle}` : ""}
              {n.authorRole === "educator" && (
                <>
                  {" "}
                  <Badge tone="neutral">{t.byEducator}</Badge>
                </>
              )}
            </span>
            <br />
            {n.text}
          </span>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            style={{ width: 22, height: 22, flexShrink: 0, fontSize: 12 }}
            title={t.delete}
            aria-label={t.delete}
            disabled={busy}
            onClick={() => remove(n.id)}
          >
            ×
          </button>
        </div>
      ))}
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          <textarea
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.placeholder}
            maxLength={1000}
            rows={compact ? 2 : 3}
            style={{ width: "100%", fontSize: fs + 0.5, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy || !text.trim()}>
              {busy ? "…" : t.save}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setText(""); setError(null); }} disabled={busy}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="link" style={{ fontSize: fs, padding: 0 }} onClick={() => { setOpen(true); setError(null); }}>
            {t.add}
          </button>
        </div>
      )}
      {error && (
        <div role="alert" style={{ fontSize: 11.5, color: "var(--danger-fg)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
