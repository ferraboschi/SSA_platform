-- Companions ("doppio" attendees, corsi_partecipanti) can take exams.
--
-- A personal exam link can now be bound to a COMPANION instead of a corsista
-- (token payload `p` vs `s`). The graded submission must therefore be able to
-- reference a corsi_partecipanti row, and the confirmed outcome must persist on
-- the companion itself — corsi_iscrizioni belongs to the main corsista and must
-- never be overwritten by a companion's result.
--
-- Additive + IF NOT EXISTS: degrades gracefully (code retries without the new
-- column pre-migration, exactly like the corsista_id rollout). Idempotent.

alter table public.exam_submissions
  add column if not exists partecipante_id bigint references public.corsi_partecipanti(id) on delete set null;

create index if not exists exam_submissions_partecipante_idx
  on public.exam_submissions (partecipante_id)
  where partecipante_id is not null;

-- Double-submit backstop for companion proctored rows — the twin of
-- exam_submissions_proctored_uniq (which covers corsista rows).
create unique index if not exists exam_submissions_proctored_partecipante_uniq
  on public.exam_submissions (corso_id, partecipante_id, test_key)
  where mode = 'exam' and partecipante_id is not null;

-- A submission belongs to EITHER a corsista OR a companion, never both.
-- Legacy rows (partecipante_id NULL) all satisfy this.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exam_submissions_subject_xor') then
    alter table public.exam_submissions
      add constraint exam_submissions_subject_xor
      check (not (corsista_id is not null and partecipante_id is not null));
  end if;
end $$;

-- Confirmed outcome on the companion — mirrors corsi_iscrizioni.exam_result /
-- exam_score_pct 1:1 (same names, same value domain) so the results loader
-- derives currentResult symmetrically for both kinds.
alter table public.corsi_partecipanti
  add column if not exists exam_result text,
  add column if not exists exam_score_pct integer;

-- Same value domain as corsi_iscrizioni.exam_result (init.sql:254).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'corsi_partecipanti_exam_result_check') then
    alter table public.corsi_partecipanti
      add constraint corsi_partecipanti_exam_result_check
      check (exam_result in ('passed','retrial','failed'));
  end if;
end $$;

-- The shared-link email gate now also matches companion confirmed emails.
create index if not exists corsi_partecipanti_email_idx
  on public.corsi_partecipanti (corso_id, email)
  where email is not null;
