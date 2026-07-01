"use server";

// INTERNAL (authenticated) companion-participant management.
//
// A course enrollment (corsi_iscrizioni) is UNIQUE per (corso_id, corsista_id):
// a buyer of >=2 seats is a single roster line. These actions let staff add the
// extra attendee(s) so the appello (corsi_presenze) gets a separate roll-call
// line for each — stored in corsi_partecipanti (20260701190000).
//
// Unlike the public share-link path (attendance-actions.ts), this path is
// role-guarded (admin/manager, mirroring saveCourseProgramAction) and may add a
// companion for ANY enrollment on the course — not only doubles. courseId /
// enrollment ownership is never trusted from the client blindly; the corso_id
// is derived from the loaded enrollment and both must be consistent. Degrades
// gracefully (schema flag) until the migration is applied.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";

const PART_TABLE = "corsi_partecipanti";

export interface PartecipanteActionResult {
  ok: boolean;
  companion?: { id: number; full_name: string; phone: string };
  error?: string;
  schema?: boolean;
}

function isMissingTable(err: { message?: string } | null | undefined): boolean {
  return (
    !!err &&
    /corsi_partecipanti|does not exist|schema cache|find the table|column/i.test(err.message || "")
  );
}

/** Staff adds a companion attendee for an enrollment on a course. */
export async function addPartecipanteAction(
  corsoId: number,
  iscrizioneId: number,
  fullName: string,
  phone: string,
): Promise<PartecipanteActionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const corso = Number(corsoId);
  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(corso) || corso <= 0) return { ok: false, error: "Corso non valido." };
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };

  const name = String(fullName ?? "").trim();
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (name.length > 120) return { ok: false, error: "Nome troppo lungo." };
  const tel = String(phone ?? "").trim();
  if (tel.length > 40) return { ok: false, error: "Telefono troppo lungo." };

  try {
    const svc = getSupabaseServiceClient();

    // The enrollment must exist and belong to the given course (don't trust the
    // client id pairing blindly, even for staff).
    const { data: enr, error: enrErr } = await svc
      .from("corsi_iscrizioni")
      .select("id, corso_id")
      .eq("id", iscrId)
      .maybeSingle();
    if (enrErr) return { ok: false, error: enrErr.message };
    if (!enr || Number(enr.corso_id) !== corso) {
      return { ok: false, error: "Iscrizione non valida per questo corso." };
    }

    const { data: inserted, error: insErr } = await svc
      .from(PART_TABLE)
      .insert({ corso_id: corso, iscrizione_id: iscrId, full_name: name, phone: tel || null })
      .select("id, full_name, phone")
      .maybeSingle();
    if (insErr) {
      if (isMissingTable(insErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: insErr.message };
    }
    if (!inserted) return { ok: false, error: "Inserimento non riuscito." };

    revalidatePath(`/corsi/${corso}`);
    return {
      ok: true,
      companion: { id: Number(inserted.id), full_name: inserted.full_name as string, phone: (inserted.phone as string) ?? "" },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}

/** Staff removes a companion attendee (cascades its appello rows). */
export async function removePartecipanteAction(
  partecipanteId: number,
): Promise<PartecipanteActionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const id = Number(partecipanteId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Partecipante non valido." };

  try {
    const svc = getSupabaseServiceClient();
    // Read the course first so we can revalidate the right page after delete.
    const { data: part, error: readErr } = await svc
      .from(PART_TABLE)
      .select("id, corso_id")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      if (isMissingTable(readErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: readErr.message };
    }
    if (!part) return { ok: true }; // already gone — idempotent

    const { error: delErr } = await svc.from(PART_TABLE).delete().eq("id", id);
    if (delErr) return { ok: false, error: delErr.message };

    revalidatePath(`/corsi/${Number(part.corso_id)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Eliminazione non riuscita." };
  }
}
