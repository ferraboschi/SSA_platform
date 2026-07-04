-- Optional delivery notes on /conferma (Stage 3 follow-up): citofono name if
-- different from the surname, other courier instructions (gate codes, floor,
-- landmarks). Alongside delivery_address (20260702160000) — same additive
-- pattern, same two tables, same pre-migration degrade in confirm-actions.ts.

alter table public.corsi_iscrizioni
  add column if not exists delivery_notes text;

alter table public.corsi_partecipanti
  add column if not exists delivery_notes text;
