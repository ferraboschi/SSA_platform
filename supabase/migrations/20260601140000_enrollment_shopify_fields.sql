-- Enrollment + purchase enrichment for the course "iscritti" detail view:
-- order reference (SSA####), order date, discount code + value, payment status,
-- Shopify ticket (line-item) id, and the buyer name (for the "doppio" check).
--
-- NOTE: `purchases` was originally created out-of-band (no prior migration), so
-- these ALTERs use IF NOT EXISTS and the table is created defensively first.

create table if not exists public.purchases (
  id            bigint generated always as identity primary key,
  corsista_id   bigint not null references public.corsisti(id) on delete cascade,
  source        text not null default 'shopify',
  external_id   text,                 -- Shopify order id
  product_title text,
  cluster       text,
  subtype       text,
  delivery      text,
  quantity      int not null default 1,
  amount_cents  int not null default 0,
  buyer_name    text,
  ordered_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.purchases add column if not exists order_name       text;
alter table public.purchases add column if not exists product_id       bigint;
alter table public.purchases add column if not exists line_item_id     bigint;
alter table public.purchases add column if not exists discount_code    text;
alter table public.purchases add column if not exists discount_cents   int not null default 0;
alter table public.purchases add column if not exists financial_status text;

create index if not exists purchases_product_id_idx on public.purchases (product_id);
create index if not exists purchases_line_item_idx  on public.purchases (line_item_id);

-- Enrollment-level mirror so the iscritti table can render without a join.
alter table public.corsi_iscrizioni add column if not exists order_name       text;
alter table public.corsi_iscrizioni add column if not exists order_date       timestamptz;
alter table public.corsi_iscrizioni add column if not exists discount_code    text;
alter table public.corsi_iscrizioni add column if not exists discount_cents   int not null default 0;
alter table public.corsi_iscrizioni add column if not exists financial_status text;
alter table public.corsi_iscrizioni add column if not exists line_item_id     bigint;
alter table public.corsi_iscrizioni add column if not exists buyer_name       text;
