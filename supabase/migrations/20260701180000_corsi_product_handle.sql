-- Store the REAL Shopify storefront product handle for each course ticket.
--
-- `corsi.handle` is a locally re-slugged title used for readable /corsi/<handle>
-- app URLs; it often differs from the real Shopify product handle, so building a
-- public /products/<handle> link from it 404s. This column holds the authoritative
-- handle fetched from the Shopify Admin API, so the enrolment (public signup) URL
-- can be built reliably. Refreshed on every sync. Idempotent.
alter table public.corsi add column if not exists product_handle text;
