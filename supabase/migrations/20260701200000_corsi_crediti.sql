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
