# 05 · Esami & test

File prototipo: `page-esami.jsx` (hub + editor + dettaglio), `page-esame-section.jsx`
(sezione esame riusabile + editor domande), `page-esame-tests.jsx` (test/feedback runner),
`page-esame-live.jsx` (cruscotto live), `page-esame-studente.jsx` (vista studente),
`page-esame-report.jsx` (report PDF), dati in `data-exam.js`.
Route: `#/esami` · `#/esami/editor` · `#/esami/:courseId` · `#/esame-live/:id` ·
`#/esame-report/:id/:email` · *(`#/esame-studente/:id` — route mancante, vedi sotto)*

**Modulo nuovo (non esiste in produzione).** Solo i corsi **Nihonshu (Certificato)** e
**Shochu** prevedono esame.

---

## Hub (`#/esami`)
KPI (esami da fare/conclusi, tasso promossi, template attivi) + due liste di corsi:
**Da fare** e **Fatti**, ognuna con esame finale (giorno), avanzamento mini-test, stato
feedback, esito. Click → dettaglio esame del corso.

## Dettaglio esame del corso (`#/esami/:courseId`)
Header corso + `V2_EsameSection`, che contiene i tab:
- **Overview** con 5 ToolCard: Check-in studenti · **Cruscotto live** · **Vista studente** ·
  **Report PDF** (tri-lingua IT/EN/JP) · Esporta risultati.
- **Mini-test giornalieri** (uno per giornata), **Esame finale**, **Feedback**, **Risultati**.

## Libreria esami & test (`#/esami/editor`)
Editor centrale delle domande, **per famiglia** (Nihonshu / Shochu) e separato per
esame finale / mini-test giornalieri / feedback. Tipi domanda supportati:
`single`, `multi`, `truefalse`, `fill`, `open`, `match`, `order`, `image`, `rating`.
Mostra stima tempo di compilazione per tipo. Editor domanda con sola lettura/modifica.

## Test runner & Feedback runner (`page-esame-tests.jsx`)
Esecuzione di un test (stati `bozza`/`aperto`/`chiuso`) e del feedback (come un test ma
senza punteggio giusto/sbagliato). Link passwordless per studente.

## Cruscotto esame live (`#/esame-live/:id`) — **fullscreen, dark mode**
Monitoraggio in tempo reale durante l'esame: studenti **non iniziato / in corso /
consegnato**, tempo trascorso/rimanente, punteggio medio, **istogramma distribuzione
punteggi**. (Nel prototipo l'avanzamento è simulato con un timer.)

## Vista studente (`#/esame-studente/:id`)
Anteprima di **come lo studente vede l'esame** sul proprio device — frame **mobile /
tablet / laptop**, **switch lingua IT/EN/JP**, navigazione domande. Nessuna app: web
responsive accessibile via link.
> **Da evidenziare — route mancante:** il bottone "Vista studente" punta a
> `#/esame-studente/:id` ma il router non gestisce quel ramo (cade sul fallback →
> Dashboard). Il componente `V2_PageEsameStudente` esiste ed è caricato. Da agganciare in
> implementazione (aggiungere il ramo nel router).

## Report esame PDF (`#/esame-report/:id/:email`) — **già tri-lingua**
Anteprima del certificato/report: vista **Singolo** (lingua a scelta IT/EN/JA) o
**Tri-lingua** (le tre affiancate). Punteggio finale + **breakdown per categoria**.
Azioni: Scarica PDF · Invia per email. Le stringhe sono già in un dizionario `RP_T`
(it/en/ja): **modello di riferimento per l'i18n di tutta l'app**.

## Dati & endpoint
- Tutto da `data-exam.js`: banche domande per famiglia, mini-test, feedback, template
  esame finale, risultati/sessioni dei corsi passati.
- In prod: **nuovo dominio dati** — definizioni esami, domande (con i 9 tipi), sessioni
  studente, risposte, punteggi, esiti; generazione PDF; invio email (Resend).

## Note di implementazione
- Il **report PDF tri-lingua** e la **vista studente** sono i punti dove il multilingua è
  strutturale (IT/EN/JP già previsti). Il dizionario `RP_T` è il pattern da generalizzare.
- Logica stima tempo duplicata tra `page-esame-section.jsx` e `page-esami.jsx` →
  consolidare.
- Priorità: **alta** (modulo nuovo e centrale per la certificazione).
