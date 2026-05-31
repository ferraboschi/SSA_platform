# 01 · Shell & Navigazione (globale)

File prototipo: `shell.jsx`, `components.jsx`, `app-state.js`

La shell avvolge ogni pagina (tranne le viste fullscreen come l'esame live). Tre aree:
**Sidebar** a sinistra, **Topbar** in alto, contenuto al centro. Stato globale e
re-render via evento `ssa-state`.

---

## Sidebar

Logo SSA + menu raggruppato:

- **(senza gruppo)** — Dashboard
- **Catalogo** — Corsi · Pianificatore · Esami & test · Template materiali · Archivio
- **Persone** — Corsisti · Educator
- **Sistema** — Design system

Dettagli:
- Ogni voce mostra un **conteggio** a destra (es. n. corsi pubblicati, n. corsisti).
- La voce **Corsi** è **collassabile** e mostra come sotto-menu i corsi pubblicati
  ordinati per data, con meta compatta `i:NN / d:NN` (iscritti / giorni mancanti).
- **Esami & test** ha un figlio fisso: "Libreria esami & test".
- In fondo: blocco utente loggato con **switch profilo** (admin/manager) e link
  "Profilo e impostazioni" → Account.

## Topbar

- **Breadcrumbs** contestuali per pagina.
- **Ricerca globale** (input + scorciatoia ⌘K):
  - cerca su **più categorie insieme**: Corsi, Corsisti, Educator, Pagine;
  - risultati raggruppati per categoria (max 6 per gruppo), con badge tipo, sottotitolo,
    evidenziazione del match;
  - navigazione da tastiera (↑/↓/Invio/Esc); suggerimenti e scorciatoie quando vuota.
- **Stato connessioni**: indicatori Shopify / Airtable.
- **Campanella notifiche** (vedi sotto).
- Pulsante **refresh**.

## Notifiche (campanella)

- Badge con conteggio.
- Notifiche calcolate da `computeNotifications()`: oggi solo **"Educator non abilitato"**
  — un corso (Shopify) assegnato a un educator non abilitato a quella tipologia.
- Ogni notifica linka al corso e mostra che verrà inviata una **mail via Resend**
  (integrazione futura, oggi mockata).

## Router

`V2_App` legge `location.hash` e instrada (vedi `useRoute` in `components.jsx`):

| Hash | Pagina |
|---|---|
| `#/dashboard` | Dashboard |
| `#/corsi` · `#/corsi/:id` | Catalogo · Dettaglio corso |
| `#/pianificatore` | Pianificatore |
| `#/esami` · `#/esami/editor` · `#/esami/:courseId` | Hub · Libreria · Dettaglio esame corso |
| `#/template-materiali` · `#/template-materiali/:id` | Template materiali |
| `#/corsisti` · `#/corsisti/:email` | Lista · Profilo corsista |
| `#/educator` · `#/educator/:id` | Lista · Dettaglio educator |
| `#/archivio` | Archivio |
| `#/esame-live/:id` | Cruscotto esame live (**fullscreen**, senza shell) |
| `#/esame-report/:id/:email` | Report esame PDF |
| `#/account` | Account |
| `#/design-system` | Design system |

> **Da evidenziare:** manca la route `#/esame-studente/:id` (il componente esiste, vedi
> `05-esami.md`).

## Componenti condivisi (`components.jsx`)

`Icon` (set SVG stroke 1.6 con ~60 glifi), `Avatar` (iniziali + tono auto da hash),
`Badge` / `StatusBadge` (salute corso), `KPI`, `Crumbs`, `PageHeader`, `useRoute`,
`useAppState`. Da portare 1:1 come libreria di componenti UI dell'app reale.

## Note di implementazione

- Lo switch utente e tutto lo stato (`app-state.js`) usano `localStorage` nel prototipo →
  in prod: sessione/utente reale + persistenza server.
- La ricerca globale è client-side su dati in memoria → in prod valutare endpoint di
  ricerca server-side se i volumi crescono.
- **i18n:** etichette menu, placeholder ricerca, testi notifiche tutti da tradurre.
