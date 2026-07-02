-- Course-start email SANITIZATION: a confirmed-during-course email per attendee.
--
-- Why a snapshot (not just corsisti.email): corsisti.email is the Shopify identity
-- key (UNIQUE, used by the anomalie dedup/merge). But the buyer's Shopify email is
-- often NOT the attendee's real email — someone buys for a friend, buys 2+ seats
-- for other people, registers with the wrong address, or gets a course as a gift.
-- At the appello the educator sends each student a confirmation ("magic") link;
-- the student confirms/corrects their own email. We materialize that CONFIRMED
-- email PER ENROLLMENT so a later Shopify re-sync of corsisti.email can't clobber
-- it, and so corsisti.email (global identity) stays untouched. This snapshot is
-- the ONLY list the exam email-gate matches against.
--
-- Companions ("doppio") have no email at all today (corsi_partecipanti has only
-- name + phone), so they get their own email column — required for a companion to
-- be email-verified for the exam.
--
-- `email_confirmed_at` doubles as the "checked" flag the educator sees as a green
-- tick: NULL = not yet confirmed (exam won't start for that person).
--
-- Additive + IF NOT EXISTS: degrades gracefully. Until applied, readers fall back
-- to corsisti.email and companions stay ungated — historic/live courses keep
-- working. Idempotent — safe to re-run.

alter table public.corsi_iscrizioni
  add column if not exists enrolled_email    text,
  add column if not exists email_confirmed_at timestamptz;

alter table public.corsi_partecipanti
  add column if not exists email              text,
  add column if not exists email_confirmed_at timestamptz;

-- Fast per-course lookup of the sanitized attendee-email list (the exam gate).
create index if not exists corsi_iscrizioni_enrolled_email_idx
  on public.corsi_iscrizioni (corso_id)
  where enrolled_email is not null;
