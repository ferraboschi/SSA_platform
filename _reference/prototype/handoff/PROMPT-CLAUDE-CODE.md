# Prompt di handoff per Claude Code

> Copia il testo qui sotto e incollalo a Claude Code come prompt iniziale, allegando la
> cartella `v2/` (prototipo) e `v2/handoff/` (documentazione).

---

## Contesto

Devi implementare la **piattaforma gestionale della Sake Sommelier Association (SSA)**
partendo da un **prototipo ad alta fedeltà** in HTML/React e da una **documentazione
funzionale completa**. Sei libero di scegliere lo stack tecnico.

**Materiali che ti passo (un unico `v2.zip` con tutto il progetto):**
- **Prototipo** — `v2/index.html` + tutti i file `.jsx`/`.css`/`.js` nella cartella `v2/`:
  la **fonte di verità** per comportamento e aspetto. Gira con dati finti, nessun backend.
- **`v2/handoff/`** — la documentazione:
  - `PROMPT-CLAUDE-CODE.md` — questo prompt
  - `README.md` — architettura, decisioni, piano multilingua, problemi noti
  - `FUNCTIONS-REPORT.it.md` (e `.en.md`) — **guida principale**: ogni funzione UI con
    descrizione, stato, priorità, endpoint, note
  - `DATA-MODEL.md` — shape dati + mapping mock → sorgenti reali
  - `functions/01…11` — una scheda per ogni voce di menu
  - `SSA-TECHNICAL-SUMMARY.md` — descrizione dell'app **attualmente in produzione**
    (Node/Express + Shopify/Airtable/Twilio), da cui ereditare gli endpoint esistenti.

**Prima di scrivere codice:** leggi `v2/handoff/README.md`, poi
`v2/handoff/FUNCTIONS-REPORT.it.md`; quindi apri il prototipo (`v2/index.html`) e naviga
ogni schermata. Resa grafica e mappatura endpoint devono basarsi su questi file — **non
inventare** nulla che non sia nel prototipo o nel technical summary.

---

## Architettura, integrazioni e decisioni infrastrutturali

Da tenere presente fin dall'inizio (alcune scelte si confermeranno durante lo sviluppo,
ma vanno previste nell'architettura):

- **Hosting / backend:** il sistema sarà connesso a **Render** e/o **Supabase** (o
  entrambi). Decideremo in corso d'opera: progetta lo strato dati in modo da non
  vincolarti a uno solo (astrai l'accesso ai dati).
- **Email transazionali:** **Resend** per l'invio di tutte le mail (notifiche, report
  esame, feedback, magic link).
- **Integrazioni dati esterne, da prevedere esplicitamente:**
  - **Shopify** — corsi (prodotti), ordini, iscritti, educator (metaobject).
  - **Airtable** — configurazioni corsi, catalogo sake, registrazioni QR studenti.
  - **Dropbox** — **nuova integrazione** da prevedere (es. archiviazione/sync di
    materiali, documenti, diplomi, allegati). Predisponi i punti di estensione anche se
    l'aggancio definitivo arriverà più avanti.
- **RAG / Knowledge base sul sake:** la piattaforma dovrà includere un **sistema RAG**
  in cui caricare una **knowledge base sul sake**, usata per la **correzione/valutazione
  assistita degli esami** (e potenzialmente per il supporto alle domande aperte).
  Predisponi l'architettura per: ingest dei documenti → indicizzazione/embedding →
  retrieval in fase di correzione esame. Vedi il modulo Esami (`functions/05-esami.md`).

---

## Nuovi requisiti di prodotto (oltre a quanto già nel prototipo)

1. **Sistema di notifiche.** Centro notifiche della piattaforma (oltre alla campanella
   già prototipata per "educator non abilitato"): notifiche in-app + invio email via
   Resend. Deve essere estendibile a nuovi tipi di evento (scadenze, esami, soglie,
   spedizioni, ecc.).
2. **Login e ruoli con priorità di visualizzazione diverse per utente.** Sistema di
   autenticazione con **profili e ruoli** (es. admin / manager / educator …). A seconda
   del ruolo cambiano **cosa vede e con quale priorità** ogni utente: viste, sezioni,
   azioni e ordine/rilevanza delle informazioni in dashboard e nelle pagine. Progetta un
   modello di permessi e di "priorità di visualizzazione" configurabile per ruolo.
3. **Multilingua IT / EN / FR / JP.** Partire da Italiano + Inglese. Estrarre tutte le
   stringhe in dizionari per lingua. Il report esame è già pensato tri-lingua (IT/EN/JP):
   usalo come pattern di riferimento.

---

## Richieste di verifica (obbligatorie)

Alla fine dell'implementazione (e idealmente in itinere) verifica e conferma
esplicitamente che:

1. **Integrazioni previste in architettura.** Il codice contempla e predispone le
   integrazioni con **Dropbox, Shopify e Airtable** (più Render/Supabase e Resend), con
   punti di estensione chiari anche dove l'aggancio definitivo è rimandato.
2. **RAG knowledge base sul sake.** Esiste ed è documentata la predisposizione di un
   **sistema RAG** in cui caricare la knowledge base sul sake per la **correzione degli
   esami** (ingest → indicizzazione → retrieval in valutazione).
3. **Codice pulito.** Il codice è pulito, senza tracce di codice morto, inutile o
   privo di senso, senza duplicazioni evidenti e con naming/struttura coerenti.
4. **Ogni funzione verificata e documentata.** Ogni funzione della piattaforma è
   verificata (funziona come nel prototipo) e **documentata** — aggiorna/estendi il
   `FUNCTIONS-REPORT` con lo stato reale di implementazione di ciascuna funzione.

---

## Note già segnalate da risolvere

(Dalla sezione "Da evidenziare" di `FUNCTIONS-REPORT.it.md`)

- Agganciare la route mancante **`esame-studente`** (nel prototipo il bottone "Vista
  studente" cade sulla Dashboard).
- Estrarre i componenti definiti dentro il render (es. `Field` in `page-account.jsx`):
  causano la perdita di focus degli input.
- Consolidare la logica duplicata di stima tempo (`ES_EST_SEC` / `EX_EST`).
- Collegare a dati reali i numeri oggi mock (dashboard, stock libri, insight).
