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
