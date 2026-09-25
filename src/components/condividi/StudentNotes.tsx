"use client";

// Notes under a student on the educator roll-call (share link): the educator
// reads what the organizers wrote and can add their own ("ripete", "deve fare
// l'esame"…). Visible only here and in the platform — never to students.
// Removal is a platform (staff) action.
import { useState } from "react";
import type { CorsistaNote } from "@/lib/domain";
import { addStudentNoteFromLinkAction } from "@/lib/share-links/note-actions";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function StudentNotes({
  token,
  corsistaId,
  notes,
  onAdded,
}: {
  token: string;
  corsistaId: number;
  notes: CorsistaNote[];
  onAdded: (note: CorsistaNote) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addStudentNoteFromLinkAction(token, corsistaId, text).catch(
      () => ({ ok: false, error: "Errore di rete." }) as Awaited<ReturnType<typeof addStudentNoteFromLinkAction>>,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Salvataggio non riuscito, riprova.");
      return;
    }
    onAdded(res.note);
    setText("");
    setOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px 8px 44px" }}>
      {notes.map((n) => (
        <div
          key={n.id}
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            color: "var(--text-2)",
            padding: "4px 8px",
            background: "var(--warning-bg)",
            border: "1px solid var(--warning)",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <span style={{ color: "var(--text-4)", fontSize: 11 }}>
            {fmtDate(n.createdAt)} · {n.author}
          </span>
          <br />
          {n.text}
        </div>
      ))}
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            className="edu-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Es. ripete il corso, deve ancora fare l'esame…"
            maxLength={1000}
            rows={2}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="edu-btn primary" onClick={save} disabled={busy || !text.trim()}>
              {busy ? "…" : "Salva nota"}
            </button>
            <button type="button" className="edu-btn" onClick={() => { setOpen(false); setText(""); setError(null); }} disabled={busy}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="edu-linkbtn" onClick={() => { setOpen(true); setError(null); }}>
            ＋ Nota {notes.length === 0 ? "(solo per staff ed educator)" : ""}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 12, color: "var(--danger-fg)", margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
