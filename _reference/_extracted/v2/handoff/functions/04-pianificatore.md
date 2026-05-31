# 04 · Pianificatore

File prototipo: `page-pianificatore.jsx`, `pianificatore-core.js` (logica pura, `window.PL`),
`pianificatore-views.jsx` (5 viste), `pianificatore-panels.jsx` (3 pannelli)
Route: `#/pianificatore` · **Modulo nuovo (non esiste in produzione)**

Strumento di pianificazione dei corsi sui **12 mesi mobili** a partire dal mese corrente.
Risponde a: *quali corsi mettere a calendario, quando, in quali città, con quali educator.*

---

## Concetti chiave

- **Corsi reali** (da Shopify, lifecycle `pubblicato`/`bozza`) + **corsi pianificati**
  in-app (non ancora su Shopify). I pianificati diventano reali solo dopo la creazione su
  Shopify.
- **Modalità scenario** (toggle): includere o no i pianificati nei KPI.
- **Obiettivi (targets)** modificabili: corsi introduttivi, certificati, città coperte,
  tasso promozione, nuovi sommelier. KPI confrontano *attuale vs obiettivo* con il delta
  dato dai pianificati.
- **Durata sessioni** calcolata per tipo + modalità (presenza = giorni consecutivi;
  online = appuntamenti settimanali) — vedi `genDates` in `pianificatore-core.js`.

## Interazioni

- **Aggiungi corso direttamente sul calendario** (click su una cella/mese → form), oppure
  **drag&drop** di un corso pianificato tra mesi/città/educator.
- Click su un corso reale → apre il dettaglio corso; su un pianificato → pannello azioni
  (modifica/sposta/rimuovi).
- Stato persistito in `localStorage` (chiave `ssa_pian_v3`): vista, scenario, targets,
  planned, soglie.

## Le 5 viste (`pianificatore-views.jsx`)

1. **Heatmap** — densità corsi per mese (calendario annuale).
2. **Mensile** — agenda verticale per mese (drag&drop).
3. **Barre per tipo** — barre mensili stacked per tipologia.
4. **Griglia Città × Mese.**
5. **Griglia Educator × Mese** (rispetta le **abilitazioni** educator).

## I 3 pannelli (`pianificatore-panels.jsx`)

1. **Engagement educator** — carico/giornate per educator.
2. **Segnali di pianificazione** — conflitti di date (`conflictDays`) e cannibalizzazione
   tra corsi vicini (`canniDays`); soglie modificabili.
3. **Confronto anno precedente (YoY).**

## Dati & endpoint

- Legge `SSA.COURSES` (reali) → `GET /api/courses`.
- Educator e abilitazioni da `app-state` → **da persistere**.
- I corsi **pianificati** sono un'entità **nuova** da persistere (bozze di pianificazione
  lato server), oltre allo stato preferenze utente.

## Note di implementazione

- Tutta la logica di date/sessioni/normalizzazione è isolata in `pianificatore-core.js`:
  ottimo punto di partamento per il porting (è plain JS, testabile).
- Le abilitazioni educator guidano chi è assegnabile a un corso → coerente con la
  notifica "educator non abilitato" della shell.
- **i18n:** nomi mesi (chiave logica), etichette viste/pannelli, label obiettivi.
- Priorità: **media** (modulo strategico ma non bloccante per l'operatività quotidiana).
