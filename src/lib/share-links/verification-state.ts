// The attendee-verification STATE MACHINE — pure and unit-tested, shared by
// the educator UI (chips/buttons) and kept in sync with the server-side locks
// in attendance-actions.ts.
//
// States (owner-approved, airtight):
//   assente     → not present at the appello (and never confirmed): locked.
//   verificare  → present, nothing sent yet: email/phone freely editable,
//                 action "Invia conferma".
//   attesa      → a confirmation link is OUT: email/phone LOCKED; actions
//                 "Reinvia" or "Correggi e rinvia" (atomic update+send).
//   confermato  → the student completed the confirmation: everything locked;
//                 only "Richiedi nuova conferma" re-opens (back to attesa).
//
// INVARIANT: the stored email is always the address the LAST link was sent to
// — edits after a send only happen inside the atomic correct-and-resend.

export type VerificationStateId = "assente" | "verificare" | "attesa" | "confermato";

export function deriveVerificationState(
  present: boolean,
  sentAtIso: string | null,
  confirmedAtIso: string | null,
): VerificationStateId {
  if (confirmedAtIso) return "confermato";
  if (!present) return "assente";
  if (sentAtIso) return "attesa";
  return "verificare";
}

/** Whether a FREE edit (standalone save, no send) is allowed — mirrors the
 *  server-side guard: only before anything was sent and before confirmation. */
export function canFreeEdit(sentAtIso: string | null, confirmedAtIso: string | null): boolean {
  return !sentAtIso && !confirmedAtIso;
}

/** Short Italian timestamp: HH:MM if today, else dd/MM HH:MM. */
export function shortTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  const dm = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  return `${dm} ${hm}`;
}

/** Chip label per state, with the persistent server timestamp. */
export function chipLabel(
  state: VerificationStateId,
  sentAtIso: string | null,
  confirmedAtIso: string | null,
  now: Date = new Date(),
): string {
  switch (state) {
    case "assente":
      return "Assente";
    case "verificare":
      return "Da verificare";
    case "attesa": {
      const t = sentAtIso ? shortTime(sentAtIso, now) : "";
      return t ? `Inviata ${t} — in attesa` : "Inviata — in attesa";
    }
    case "confermato": {
      const t = confirmedAtIso ? shortTime(confirmedAtIso, now) : "";
      return t ? `Confermato ${t}` : "Confermato";
    }
  }
}

/** Newer-wins merge for polled timestamps: never let a poll computed BEFORE a
 *  local optimistic update revert it. */
export function newerIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
