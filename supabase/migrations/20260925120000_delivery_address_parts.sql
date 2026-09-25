-- Structured delivery address confirmed on /conferma (owner rule 25/9/2026:
-- every component is mandatory — street, civic number, CAP, city, province,
-- country — and Google Places normalizes it). `delivery_address` keeps the
-- canonical one-line form for labels; this jsonb keeps the parts
-- ({street, number, postalCode, city, province, country, countryCode, source,
-- placeId, formatted}) for exports and re-geocoding. Same two tables as
-- delivery_address (20260702160000); additive + IF NOT EXISTS: until applied
-- the save simply retries without this column (delivery_address still lands).

alter table public.corsi_iscrizioni
  add column if not exists delivery_address_parts jsonb;

alter table public.corsi_partecipanti
  add column if not exists delivery_address_parts jsonb;
