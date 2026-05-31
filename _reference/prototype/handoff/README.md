# SSA Platform · v2 — Pacchetto di handoff per l'implementazione

> **A chi è rivolto:** Claude Code (o qualsiasi sviluppatore) che deve trasformare il
> prototipo HTML/React `v2/index.html` in un'applicazione reale, scegliendo liberamente
> lo stack tecnico.
>
> **Cosa contiene questo pacchetto:** la specifica funzionale e UX completa della
> piattaforma, una scheda per ogni funzione del menu, il modello dati, e un report
> operativo con stato / priorità / endpoint / note per ogni funzione.

---

## 1. Cos'è il prototipo

`v2/index.html` è un prototipo ad **alta fedeltà** della dashboard gestionale della
**Sake Sommelier Association (SSA)**: gestione corsi di sake, iscritti, educator,
programmi didattici (sake da degustare), economia dei corsi, esami e pianificazione.

Il prototipo è una **SPA React** (caricata via Babel standalone in-browser) con
**routing ad hash** e **dati finti** (`data.js`, `data-exam.js`). Non ha backend:
serve a definire *cosa* costruire e *come deve comportarsi/apparire*, non *come*
implementarlo.

### Mappa file del prototipo

| File | Tipo | Ruolo |
|---|---|---|
| `index.html` | HTML | Entry point unico: carica gli script e monta `<V2_App/>` |
| `tokens.css` | CSS | Design tokens (colori, spaziature, ombre, tipografia) |
| `components.css` | CSS | Classi dei componenti UI |
| `data.js` | JS | Dati finti: educator, corsi, corsisti, template materiali, KPI |
| `data-exam.js` | JS | Dati finti esami: banche domande, mini-test, feedback, risultati |
| `app-state.js` | JS | Stato globale: utente loggato, abilitazioni educator, soglie, notifiche |
| `components.jsx` | JSX | Componenti condivisi: `Icon`, `Avatar`, `Badge`, `KPI`, `PageHeader`, routing |
| `shell.jsx` | JSX | Sidebar, Topbar, ricerca globale, notifiche, **router** (`V2_App`) |
| `page-*.jsx` | JSX | Una pagina per funzione di menu |
| `pianificatore-*.jsx` | JSX | Pianificatore: core (logica), views (5 viste), panels (3 pannelli) |
| `page-esame-*.jsx` | JSX | Modulo esami: sezione, test runner, live, studente, report |

> **Nota sullo scope:** il prototipo contiene **più funzioni dell'app attualmente in
> produzione** (vedi `SSA-TECHNICAL-SUMMARY.md`). Pianificatore, Esami & test, Template
> materiali, Notifiche, Ricerca globale, Account multi-utente e il multilingua sono
> **nuovi** e vanno costruiti. Il report funzioni indica per ciascuna se *esiste già* o
> è *da creare*.

---

## 2. Come leggere questo pacchetto

1. **Parti da `FUNCTIONS-REPORT.it.md`** (o `.en.md`) — è la guida operativa: tabella di
   tutte le funzioni con stato, priorità, endpoint e note di implementazione.
2. **Per ogni funzione, apri la scheda corrispondente** in `functions/` — descrive
   schermata per schermata cosa fa, gli stati, le interazioni e i dati che consuma.
3. **Tieni aperto `DATA-MODEL.md`** — definisce la forma dei dati e il mapping tra i
   dati finti del prototipo e le sorgenti reali (Shopify / Airtable / Twilio).
4. **Apri il prototipo** (`v2/index.html`) accanto alla scheda per vedere il
   comportamento dal vivo.

### Le schede `functions/` (una per voce di menu)

| # | Scheda | Voce di menu |
|---|---|---|
| 01 | `01-shell-navigazione.md` | Shell globale: sidebar, topbar, ricerca, notifiche, switch utente |
| 02 | `02-dashboard.md` | Dashboard |
| 03 | `03-corsi.md` | Corsi (catalogo + dettaglio corso) |
| 04 | `04-pianificatore.md` | Pianificatore |
| 05 | `05-esami.md` | Esami & test (+ live, studente, report PDF) |
| 06 | `06-template-materiali.md` | Template materiali |
| 07 | `07-archivio.md` | Archivio |
| 08 | `08-corsisti.md` | Corsisti (lista + profilo) |
| 09 | `09-educator.md` | Educator (lista + dettaglio) |
| 10 | `10-account.md` | Account / profilo / sessione |
| 11 | `11-design-system.md` | Design system (tokens & componenti) |

---

## 3. Decisioni prese in fase di handoff

- **Codice morto rimosso.** Esistevano tre versioni del progetto: una vecchia in `src/`
  (con `SSA Platform.html`), una intermedia con i `.jsx` nella root, e l'attuale in
  `v2/`. Solo `v2/` è viva: le altre sono state eliminate. È stata rimossa anche la
  cartella `v2/pages/`, un tentativo multi-pagina obsoleto (forzava un hash ma caricava
  comunque tutta l'app, e non includeva i moduli più recenti → sarebbe stato rotto).
- **Una sola SPA, non N pagine HTML.** Frammentare la SPA in file HTML separati avrebbe
  richiesto di riscrivere router e navigazione (toccando funzioni che già funzionano)
  per zero beneficio, dato che l'app reale verrà ricostruita con un suo stack. Il
  requisito "una pagina per funzione" è quindi consegnato a livello di **documentazione**:
  una scheda per funzione di menu, più il sorgente già diviso un file per funzione.
- **Funzioni non toccate.** Le funzionalità del prototipo sono considerate definitive.
  L'intervento sul codice si è limitato a rimuovere dead-code verificato al 100%
  (variabili/funzioni/export mai letti), senza alcun cambio di comportamento.

---

## 4. Piano multilingua (i18n)

L'app dovrà essere **multilingua**. Ordine di priorità:

1. **Italiano** (lingua sorgente, già presente nel prototipo)
2. **Inglese**
3. *(successivamente)* **Francese** e **Giapponese**

Indicazioni per l'implementazione:

- Tutte le stringhe UI del prototipo sono **hard-coded in italiano**. Vanno estratte in
  file di traduzione (es. `it.json`, `en.json`, `fr.json`, `ja.json`) con chiavi
  semantiche.
- Il **report esame PDF** è già progettato come documento **tri-lingua IT/EN/JP**
  (vedi scheda `05-esami.md`) → è il primo punto in cui il multilingua è strutturale.
- Attenzione a: formati **data** (mesi in italiano sono usati come chiave logica in più
  punti — es. `parseCourseDate`), formati **valuta** (`toLocaleString("it-IT")`),
  pluralizzazione (es. "città"/"città", "1 promosso"), e al **giapponese** (testo CJK,
  nomi sake con `nameJp` 純米大吟醸 già presenti nel modello dati).

---

## 5. Problemi noti da evidenziare

Vedi la sezione **"Da evidenziare"** in fondo a `FUNCTIONS-REPORT.it.md`. In sintesi:

- **Route mancante `esame-studente`.** Il bottone "Vista studente" punta a
  `#/esame-studente/:id` ma il router (`shell.jsx`) non gestisce quel ramo → cade nel
  fallback e mostra la Dashboard. Il componente `V2_PageEsameStudente` esiste ed è
  caricato. *Non corretto di proposito* (richiesta: non toccare le funzioni) → da
  agganciare in implementazione.
- **Componente `Field` ridefinito dentro il render** in `page-account.jsx` (e pattern
  simili altrove): in React causa il remount dell'input ad ogni keystroke. Da estrarre
  fuori dal componente padre nella riacrittura.
- **Logica di stima tempo duplicata** tra `page-esame-section.jsx` (`ES_EST_SEC`) e
  `page-esami.jsx` (`EX_EST`): consolidare in un'unica utility.
- **Email automatiche (Resend) e WhatsApp** sono mockate: le notifiche prevedono
  l'invio mail "via Resend" come integrazione futura.
