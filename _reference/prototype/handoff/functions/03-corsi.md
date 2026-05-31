# 03 · Corsi (catalogo + dettaglio)

File prototipo: `page-corsi.jsx` (lista), `page-corso.jsx` (dettaglio)
Route: `#/corsi` · `#/corsi/:id`

---

## Catalogo (`#/corsi`)

- **Tab per lifecycle:** Pubblicati · Bozze · Archiviati · Passati (con conteggi).
- **Toolbar:** ricerca testo, filtri (tipo / città / educator), ordinamento (data, %
  iscritti, stato, ricavi, margine, città, educator), pulsante **"Regola stato"** (apre
  la legenda della regola salute), e **3 viste**: Timeline · Griglia · Tabella.
- **Azioni header:** Esporta · **Nuovo corso** (apre Shopify — i corsi si creano lì).

### Regola salute corso (`STATUS_RULES`) — importante
Stato calcolato da % iscritti vs capienza e giorni al corso:
- **In traiettoria** — ≥ 20% del max a ≥ 1 mese.
- **Da monitorare** — > 2 mesi al corso, dati ancora deboli.
- **A rischio** — 20–40% del max a 2–4 settimane, o < 50% del minimo a 1 mese.
- **Critico** — < 20% del max a 2 settimane → decisione entro 7 giorni.

> La regola è esplicitata nel codice ed è documentata in pagina (legenda). Va replicata
> fedelmente lato server quando si calcola `status`.

## Dettaglio corso (`#/corsi/:id`)

- **Hero:** badge tipo + stato, titolo, data/città/educator, countdown giorni. Azioni:
  Gruppo WhatsApp · Condividi con educator · Excel iscritti · Excel sake · **Segna
  fatturato**.
- **KPI inline (4):** Iscritti (con barra vs minimo) · Ricavi · Costi · Margine.
- **Box "Motore raccomandazioni":** spiegazione testuale dello stato salute
  (`notebook.reasoning`) + eventuale azione pianificata.
- **Tab di sezione:**
  1. **Iscritti** (`IscrittiSection`) — lista iscritti con email/telefono/WhatsApp,
     mismatch nome (ordine vs registrazione QR), override.
  2. **Programma & Economia** (`ProgrammaEconomiaSection`) — editor del **programma sake**
     per giorni: aggiungi/rimuovi giorni e sake, **riordino drag&drop** (`SakeRow`),
     note, scheda tecnica sake; **applica un Template materiali** (`TemplateLibraryModal`);
     conto economico con voci di costo.
  3. **Esame** (se il corso ha esame) — riepilogo che rimanda a **Esami & test**.
- **Zona pericolosa:** annullamento corso → si fa mettendo il prodotto in bozza su
  Shopify (link esterno).

## Dati & endpoint

| Funzione | Endpoint reale |
|---|---|
| Lista/dettaglio corsi, iscritti, revenue | `GET /api/courses` |
| Costi / programma / config / fatturato | `GET/POST /api/costs/:courseId`, `POST /api/fatturato/:courseId` |
| Override telefono/nome | `POST /api/phone-overrides/:courseId`, `/api/name-overrides/:courseId` |
| Export Excel | `/api/export/course/:handle`, `/api/export/sake/:handle` |
| Link condivisione educator | `/api/share-link/:handle`, `/api/share/:handle`, `/api/shared/:token`, `/share/:token` |
| Catalogo sake (per il programma) | `/api/airtable/sake`, `/api/sakecompany/products` |
| WhatsApp iscritti | Twilio Lookup (server, non-bloccante) |

## Note di implementazione

- I corsi **nascono su Shopify**: creazione e annullamento sono link esterni, non form.
- Il **programma sake** è la parte più ricca (drag&drop, template, costi) → priorità alta.
- `notebook` (note admin, tag, reasoning) è **nuovo** da persistere.
- **i18n:** etichette stato salute, voci di costo, testi reasoning.
