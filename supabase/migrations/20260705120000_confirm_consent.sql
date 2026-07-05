-- GDPR consent captured at the public "Conferma i tuoi dati" step (/conferma).
-- The attendee ticks the Privacy Policy + Terms & Conditions box before their
-- data (email/phone/delivery address) is saved. We record WHEN each consent was
-- given (timestamptz, NULL = not yet consented) — the same audit-friendly shape
-- as the existing email_confirmed_at. Two separate columns so each consent can be
-- audited / revoked independently, even though one checkbox sets both today.
--
-- Added to BOTH confirmation targets: corsi_iscrizioni (enrolled corsista) and
-- corsi_partecipanti (companion), since either can go through the confirm form.
--
-- Idempotent: `add column if not exists`.

alter table public.corsi_iscrizioni
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists terms_accepted_at  timestamptz;

alter table public.corsi_partecipanti
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists terms_accepted_at  timestamptz;
