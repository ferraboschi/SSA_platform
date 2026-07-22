// Canonical exam ACCESS primitives — the one place the "who is this token, and
// how do we key their sitting?" logic lives. Historically the same `/^\d+$/`
// subject parse + `c<id>`/`p<id>` key + corsista/partecipante column were
// re-implemented inline at every entry point (page render, submit, heartbeat,
// day-esito, close-finalize), each a slightly different copy — exactly where
// subtle bugs crept in. This module is PURE (no server/client deps) so the
// decision logic is unit-testable without a DB; the per-moment orchestrators
// that fetch + decide are layered on top as the migration proceeds.
//
// A personal exam link carries the course `c` plus EXACTLY ONE subject: `s`
// (corsista) XOR `p` (companion). Everything here is corsista-first, which is
// identical to partecipante-first while only one is ever set.

/** Course + subject ids parsed from a verified exam-token payload. `null` = the
 *  field was absent or not a positive integer (a tampered/shared token). */
export interface SubjectIds {
  corsoId: number | null;
  corsistaId: number | null;
  partecipanteId: number | null;
}

/** A bare positive-integer string → number, else null (the historical
 *  `s && /^\d+$/.test(s) ? Number(s) : null` guard, in one place). */
export function asPositiveIntId(v: string | null | undefined): number | null {
  return v != null && /^\d+$/.test(v) ? Number(v) : null;
}

/** Parse the course + subject ids from a token payload's `c`/`s`/`p` fields. */
export function resolveSubjectIds(payload: {
  c: string;
  s?: string;
  p?: string;
}): SubjectIds {
  return {
    corsoId: asPositiveIntId(payload.c),
    corsistaId: asPositiveIntId(payload.s),
    partecipanteId: asPositiveIntId(payload.p),
  };
}

type SubjectRef = Pick<SubjectIds, "corsistaId" | "partecipanteId">;

/** True once at least one subject id resolved (a real personal link). */
export function hasSubject(ids: SubjectRef): boolean {
  return ids.corsistaId != null || ids.partecipanteId != null;
}

/** Presence/progress key: corsista → `c<id>`, companion → `p<id>`, else null.
 *  This is the key passed to isBlockedByAbsence + used to scope progress rows. */
export function subjectKeyOf(ids: SubjectRef): string | null {
  if (ids.corsistaId != null) return `c${ids.corsistaId}`;
  if (ids.partecipanteId != null) return `p${ids.partecipanteId}`;
  return null;
}

/** The exam_progress / exam_submissions subject column + id (corsista-first),
 *  or null when neither id is set. */
export function subjectColId(
  ids: SubjectRef,
): { col: "corsista_id" | "partecipante_id"; id: number } | null {
  if (ids.corsistaId != null) return { col: "corsista_id", id: ids.corsistaId };
  if (ids.partecipanteId != null) return { col: "partecipante_id", id: ids.partecipanteId };
  return null;
}
