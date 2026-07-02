-- Transfer-credit redemption code.
--
-- When a course is cancelled, each orphaned paid seat becomes an "aperto" credit
-- (20260701200000). Staff need a way to CLOSE the exact credit when the person
-- re-enrols on Shopify — but there is no mathematical certainty about which
-- credit a payment corresponds to. So each credit carries a unique, one-time,
-- 10-char code: staff copy it to the person, the person enters it as the Shopify
-- discount code on the new purchase, and the sync auto-matches that discount_code
-- back to this credit (→ stato 'applicato', moved to "Utilizzati").
--
-- Idempotent. Partial-unique (many NULLs allowed for pre-existing / non-coded rows).

alter table public.corsi_crediti add column if not exists codice text;

create unique index if not exists corsi_crediti_codice_uk
  on public.corsi_crediti (codice)
  where codice is not null;
