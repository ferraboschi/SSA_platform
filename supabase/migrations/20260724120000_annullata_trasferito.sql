-- Third removal outcome: TRANSFER a student straight to another same-level course
-- (owner: "credito / trasferisci / rimborso"). Widens the annullata_tipo CHECK to
-- allow 'trasferito' alongside 'credito'/'rimborso'. Additive + idempotent.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'corsi_iscrizioni_annullata_tipo_chk'
  ) then
    alter table public.corsi_iscrizioni drop constraint corsi_iscrizioni_annullata_tipo_chk;
  end if;
  alter table public.corsi_iscrizioni
    add constraint corsi_iscrizioni_annullata_tipo_chk
    check (annullata_tipo is null or annullata_tipo in ('credito','rimborso','trasferito'));
end $$;
