-- ============================================================
-- SSA — Migrazioni da eseguire su Supabase (10 in ordine)
-- Generato 2026-07-03 per la verifica esami.
-- COME: Supabase → SQL Editor → New query → incolla TUTTO → Run.
-- Sicuro: tutti i comandi sono 'if not exists' → rieseguibili.
-- ============================================================


-- ─────────────────────────────────────────────────────────
-- 20260701160000_corsi_lifecycle_cancelled
-- ─────────────────────────────────────────────────────────
-- Course lifecycle is inherited from Shopify + the course date. The model gained a
-- "cancelled" value (a course annulled before its date — pulled from Shopify while
-- still upcoming). Allow it in the existing CHECK constraint.
--
-- Additive + idempotent (drop-if-exists / re-add) → safe to run before the code
-- deploy and re-runnable. No data is changed; existing rows keep their value.
-- ("archiviato" is kept in the allowed set for backward-compat with any legacy row;
--  the app no longer produces it — it's folded into passato/cancelled at read time.)

alter table public.corsi drop constraint if exists corsi_lifecycle_check;
alter table public.corsi add constraint corsi_lifecycle_check
  check (lifecycle in ('pubblicato', 'bozza', 'archiviato', 'passato', 'cancelled'));


-- ─────────────────────────────────────────────────────────
-- 20260701170000_corsi_presenze
-- ─────────────────────────────────────────────────────────
-- Roll-call attendance ("appello") for the educator SHARE LINK.
--
-- The read-only educator share link (/condividi/[token]) lets the educator take
-- attendance: one boolean per (course × enrolled student × course day). A
-- 3-day Certificato has day_no 1..3; a 1-day course has day_no 1. One row per
-- (corso_id, corsista_id, day_no) — the unique key drives the upsert.
--
-- Service-role only: RLS is enabled with NO public policy, identical to
-- exam_sessions (20260608120000). The public share route writes via the
-- service-role key (attendance-actions.ts), which re-verifies the signed token,
-- derives the course from it, enforces enrollment, bounds day_no, and
-- rate-limits by token before touching this table. anon/auth clients cannot see
-- or write it. Idempotent — safe to re-run.

create table if not exists public.corsi_presenze (
  id           bigint generated always as identity primary key,
  corso_id     bigint not null references public.corsi(id) on delete cascade,
  corsista_id  bigint not null references public.corsisti(id) on delete cascade,
  day_no       int not null,
  present      boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (corso_id, corsista_id, day_no)
);

create index if not exists corsi_presenze_corso_idx on public.corsi_presenze (corso_id);

alter table public.corsi_presenze enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the share-link
-- attendance actions go exclusively through the service-role key.


-- ─────────────────────────────────────────────────────────
-- 20260701180000_corsi_product_handle
-- ─────────────────────────────────────────────────────────
-- Store the REAL Shopify storefront product handle for each course ticket.
--
-- `corsi.handle` is a locally re-slugged title used for readable /corsi/<handle>
-- app URLs; it often differs from the real Shopify product handle, so building a
-- public /products/<handle> link from it 404s. This column holds the authoritative
-- handle fetched from the Shopify Admin API, so the enrolment (public signup) URL
-- can be built reliably. Refreshed on every sync. Idempotent.
alter table public.corsi add column if not exists product_handle text;


-- ─────────────────────────────────────────────────────────
-- 20260701190000_corsi_partecipanti
-- ─────────────────────────────────────────────────────────
-- Companion participants ("doppio") for a course enrollment.
--
-- corsi_iscrizioni has UNIQUE (corso_id, corsista_id): one enrollment per person
-- per course, regardless of how many seats they bought. A buyer of 2+ seats is a
-- single roster line, yet the extra attendee(s) need their OWN roll-call line.
-- This table stores those extra attendees (name + phone), tied to the buyer's
-- enrollment, so the appello (corsi_presenze) can reference EITHER a corsista OR
-- a companion.
--
-- Service-role only: RLS is enabled with NO public policy, identical to
-- corsi_presenze (20260701170000) and exam_sessions. Writes go exclusively
-- through the service-role key:
--   • The PUBLIC educator share link may only fill a KNOWN-EMPTY companion slot
--     on an enrollment already flagged as a "doppio" (seatsBought >= 2), and the
--     enrollment must belong to the token's course — it can never create
--     arbitrary people (attendance-actions.ts).
--   • The INTERNAL path is role-guarded (admin/manager) and may add companions
--     for any enrollment on the course (partecipanti-actions.ts).
-- Idempotent — safe to re-run.

create table if not exists public.corsi_partecipanti (
  id             bigint generated always as identity primary key,
  corso_id       bigint not null references public.corsi(id) on delete cascade,
  iscrizione_id  bigint references public.corsi_iscrizioni(id) on delete cascade,
  full_name      text not null,
  phone          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists corsi_partecipanti_corso_idx on public.corsi_partecipanti (corso_id);

alter table public.corsi_partecipanti enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the companion
-- actions go exclusively through the service-role key.

-- ── Extend corsi_presenze so a presence row references EITHER a corsista OR a
--    companion (exactly one of the two). ────────────────────────────────────
alter table public.corsi_presenze
  add column if not exists partecipante_id bigint
    references public.corsi_partecipanti(id) on delete cascade;

-- A companion presence row has no corsista_id, so the column can no longer be
-- NOT NULL. The XOR check below still guarantees exactly one subject is set.
alter table public.corsi_presenze alter column corsista_id drop not null;

-- One presence row per (course × companion × day). The existing
-- unique (corso_id, corsista_id, day_no) covers corsista rows; this partial
-- index covers companion rows (corsista_id is NULL there).
create unique index if not exists corsi_presenze_partecipante_uidx
  on public.corsi_presenze (corso_id, partecipante_id, day_no)
  where partecipante_id is not null;

-- EXACTLY ONE of corsista_id / partecipante_id must be set. Added NOT VALID so
-- the migration never fails on any pre-existing row; new/updated rows are
-- enforced immediately. Validate later once existing rows are known-clean:
--   alter table public.corsi_presenze validate constraint corsi_presenze_subject_xor;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'corsi_presenze_subject_xor'
  ) then
    alter table public.corsi_presenze
      add constraint corsi_presenze_subject_xor
      check ((corsista_id is not null) <> (partecipante_id is not null))
      not valid;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────
-- 20260701200000_corsi_crediti
-- ─────────────────────────────────────────────────────────
-- Registro crediti / trasferimenti — deferred-liability ledger.
--
-- When a course is CANCELLED, the money already collected on its paid seats is
-- NOT revenue: a seat is still owed (a deferred liability). When the person
-- re-enrols elsewhere (typically 100%-off), staff LINK that credit to the new
-- enrolment. The money is recognised as revenue exactly ONCE, on the
-- DESTINATION course when it is actually DELIVERED (lifecycle becomes 'passato')
-- — never on the cancelled origin, never twice.
--
-- Lifecycle of a credit (`stato`):
--   • aperto      — generated from a cancelled paid seat, not yet linked
--   • applicato   — linked to a destination enrolment (recognised on delivery)
--   • rimborsato  — money was refunded to the person instead (out of the ledger)
--   • annullato   — voided by staff (e.g. false positive)
--
-- Generation is IDEMPOTENT: one credit per cancelled enrolment, enforced by
-- UNIQUE (iscrizione_origine_id). The post-sync generator upserts with
-- ON CONFLICT DO NOTHING so re-runs never duplicate and never clobber a
-- staff-edited stato/destinazione.
--
-- Service-role only: RLS is enabled with NO public policy (identical to
-- corsi_partecipanti / corsi_presenze / exam_sessions). Every read/write goes
-- through the service-role key.
--
-- Idempotent — safe to re-run.

create table if not exists public.corsi_crediti (
  id                            bigint generated always as identity primary key,
  corsista_id                   bigint not null references public.corsisti(id) on delete cascade,
  -- Money collected on the cancelled seat = NET paid (gross − discount), in cents.
  importo_cents                 integer not null,
  -- The cancelled course + the exact enrolment the credit came from.
  corso_origine_id              bigint references public.corsi(id) on delete set null,
  iscrizione_origine_id         bigint references public.corsi_iscrizioni(id) on delete set null,
  -- Where the credit was applied (destination course + enrolment), once linked.
  corso_destinazione_id         bigint references public.corsi(id) on delete set null,
  iscrizione_destinazione_id    bigint references public.corsi_iscrizioni(id) on delete set null,
  stato                         text not null default 'aperto'
                                  check (stato in ('aperto','applicato','rimborsato','annullato')),
  nota                          text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  -- One credit per cancelled enrolment → generation is idempotent.
  unique (iscrizione_origine_id)
);

create index if not exists corsi_crediti_origine_idx      on public.corsi_crediti (corso_origine_id);
create index if not exists corsi_crediti_destinazione_idx on public.corsi_crediti (corso_destinazione_id);
create index if not exists corsi_crediti_corsista_idx     on public.corsi_crediti (corsista_id);
create index if not exists corsi_crediti_stato_idx        on public.corsi_crediti (stato);

alter table public.corsi_crediti enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the credit
-- generator (post-sync) and the crediti server actions go exclusively through
-- the service-role key.


-- ─────────────────────────────────────────────────────────
-- 20260702120000_corsi_crediti_codice
-- ─────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────
-- 20260702130000_corsi_crediti_shopify_discount
-- ─────────────────────────────────────────────────────────
-- Shopify discount GID for a transfer credit's redemption code.
--
-- When a course is cancelled, each orphaned paid seat becomes an "aperto" credit
-- (20260701200000) carrying a unique one-time code (20260702120000). The platform
-- now also CREATES that code as a real one-time, fixed-amount discount in Shopify
-- (via the GraphQL Admin API) when the credit is first generated — so staff can
-- hand the person a code that is already live at checkout.
--
-- This column stores the Shopify GID of the created discount node
-- (gid://shopify/DiscountCodeNode/...). It is NULL when the discount was not
-- created — e.g. before the token had the write_discounts scope, on any API
-- error (graceful degradation: the local `codice` is still usable), or for
-- codes created/managed manually.
--
-- Idempotent.

alter table public.corsi_crediti add column if not exists shopify_discount_id text;


-- ─────────────────────────────────────────────────────────
-- 20260702140000_attendee_email_confirmation
-- ─────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────
-- 20260702150000_exam_partecipante
-- ─────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────
-- 20260702160000_delivery_address
-- ─────────────────────────────────────────────────────────
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

