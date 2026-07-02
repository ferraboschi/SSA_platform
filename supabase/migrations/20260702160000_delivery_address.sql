-- Delivery address confirmed on /conferma (Stage 3 of the attendee flow).
--
-- PER-ENROLLMENT snapshot, like enrolled_email (20260702140000): the exam-time
-- address lives only inside exam_submissions.registration jsonb (never
-- materialized), and corsisti.residency is a roster-import residence line —
-- semantically different, deliberately not reused. This column becomes the
-- single authoritative delivery field going forward (materials/certificate
-- shipping). Companions get their own (same column name on both tables).
--
-- Additive + IF NOT EXISTS: degrades gracefully. Until applied, the confirm
-- action retries WITHOUT the column so the email confirmation still succeeds
-- (the address is simply not persisted). No index (never filtered on).

alter table public.corsi_iscrizioni
  add column if not exists delivery_address text;

alter table public.corsi_partecipanti
  add column if not exists delivery_address text;
