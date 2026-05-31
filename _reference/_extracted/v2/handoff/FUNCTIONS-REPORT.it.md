# SSA Platform · Report Funzioni — Guida per l'implementazione

> Questo è il documento operativo principale. Elenca **ogni funzione UI** del prototipo
> con **descrizione**, **stato**, **priorità**, **endpoint** e **note di implementazione**.
> Leggere insieme alle schede in `functions/` e a `DATA-MODEL.md`.

## Legenda

**Stato**
- 🟢 **In prod** — funzione già presente nell'app in produzione (vedi `SSA-TECHNICAL-SUMMARY.md`).
- 🟡 **Parziale** — esiste in produzione ma nel prototipo è ampliata/ridisegnata.
- 🔵 **Nuovo** — non esiste in produzione, va costruito da zero.

**Priorità** (per l'implementazione)
- **P0** — fondazione / bloccante.  **P1** — alta.  **P2** — media.  **P3** — bassa.

---

## 0 · Fondazioni & trasversali

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Design tokens | Palette brand, tipografia (Inter + JetBrains Mono), ombre, spaziature, easing | 🟡 | **P0** | — | `tokens.css`. Portare come variabili di tema |
| Libreria componenti UI | `Icon`, `Avatar`, `Badge`, `StatusBadge`, `KPI`, `PageHeader`, ecc. | 🟡 | **P0** | — | `components.jsx`/`.css`. Base per tutto |
| Multilingua IT/EN (poi FR/JP) | Estrazione stringhe + dizionari per lingua | 🔵 | **P1** | — | Pattern di riferimento: `RP_T` nel report esame |
| Persistenza configurazioni | Soglie, abilitazioni, obiettivi, pianificati, notebook | 🔵 | **P1** | nuovi | Oggi `localStorage`; file+Airtable in prod |
| Autenticazione & ruoli | Login, profili (admin/manager), permessi | 🟡 | **P1** | `/auth/*` | Oggi user/pass via env |

---

## 1 · Shell & navigazione (scheda `01`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Sidebar a gruppi | Menu (Dashboard/Catalogo/Persone/Sistema) con conteggi | 🔵 | P1 | — | |
| Sotto-menu Corsi | Corsi pubblicati con meta `i:NN / d:NN`, collassabile | 🔵 | P2 | `/api/courses` | |
| Ricerca globale ⌘K | Multi-categoria (corsi/corsisti/educator/pagine), tastiera | 🔵 | P1 | — | Client-side; valutare endpoint se volumi alti |
| Notifiche campanella | Alert "educator non abilitato" + invio mail | 🔵 | P2 | nuovo + **Resend** | Email mockata |
| Switch profilo utente | Cambio admin/manager con permessi | 🔵 | P1 | `/auth/*` | |
| Stato connessioni | Indicatori Shopify/Airtable | 🔵 | P3 | `/api/health` | Cosmetico |
| Breadcrumbs | Briciole contestuali per pagina | 🔵 | P2 | — | |

---

## 2 · Dashboard (scheda `02`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Hero + headline dinamica | Saluto, n. corsi sotto soglia, fatture aperte | 🟡 | P1 | `/api/courses` | "3 fatture" oggi è mock |
| Riga KPI (4) | Corsi attivi, iscritti, margine, % esame | 🟡 | P1 | `/api/courses` | |
| Promemoria operativi | Spedizioni kit, stock libri, sake esame, altre | 🔵 | P1 | nuovi | Stock libri = mock; serve inventario |
| Imposta soglie | `shipDays`, `bookMin`, `sakeExamPct` | 🔵 | P2 | nuovo (persist) | |
| Pipeline 6 mesi | Griglia mese + barre per corso + tooltip ricco | 🔵 | P2 | `/api/courses` | |
| Richiede attenzione | Tabella corsi sotto soglia | 🟡 | P1 | `/api/courses` | |
| Ultime iscrizioni | Feed iscritti recenti | 🟢 | P2 | `/api/courses` | |
| Top educator | Classifica per corsi/iscritti | 🟢 | P3 | `/api/educator-profiles` | |
| Comunità SSA + insight | Totali corsisti, ripartecipanti, certificati | 🟡 | P3 | aggregazione | Insight "2.3×" è mock |
| Report mese (modale) | KPI mese + tabella + export PDF | 🔵 | P2 | `/api/courses` | PDF: oggi `window.print()` |

---

## 3 · Corsi — catalogo + dettaglio (scheda `03`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Tab per lifecycle | Pubblicati/Bozze/Archiviati/Passati | 🟡 | P1 | `/api/courses` | |
| Filtri + ordinamento | Tipo/città/educator + 10 ordinamenti | 🟡 | P1 | `/api/courses` | |
| 3 viste catalogo | Timeline / Griglia / Tabella | 🟡 | P2 | — | |
| Regola salute corso | Calcolo `status` + legenda esplicita | 🟡 | **P1** | server | Replicare la regola fedelmente |
| Nuovo / Annulla corso | Flussi esterni su Shopify | 🟢 | P2 | Shopify | I corsi nascono su Shopify |
| Hero + azioni | WhatsApp, share educator, Excel, **fatturato** | 🟢 | P1 | `/api/costs`, `/api/fatturato`, export | |
| KPI inline + conto economico | Iscritti/Ricavi/Costi/Margine | 🟢 | P1 | `/api/costs/:id` | |
| Motore raccomandazioni | Spiegazione testuale dello stato (`reasoning`) | 🔵 | P2 | nuovo | `notebook` da persistere |
| Sezione Iscritti | Lista + mismatch nome QR + override | 🟢 | P1 | `/api/courses`, override, Twilio | |
| Programma sake | Editor giorni/sake, **drag&drop**, note, scheda | 🟢 | **P1** | `/api/costs`, `/api/airtable/sake` | Parte più ricca |
| Applica Template materiali | Modale libreria → eredita giorni/sake/costi | 🔵 | P2 | nuovo | Vedi scheda 06 |
| Sezione Esame | Riepilogo che rimanda a Esami & test | 🔵 | P2 | nuovo | |

---

## 4 · Pianificatore (scheda `04`) — tutto 🔵 Nuovo

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Finestra 12 mesi mobili | Calendario scorrevole dal mese corrente | 🔵 | P2 | `/api/courses` | Logica in `pianificatore-core.js` |
| Obiettivi (targets) | Intro/cert/città/promozione/sommelier vs target | 🔵 | P2 | nuovo | |
| Aggiungi/sposta corso | Click su mese + **drag&drop** tra mesi/città/educator | 🔵 | P2 | nuovo | Pianificati ≠ reali finché non su Shopify |
| Modalità scenario | Includere o no i pianificati nei KPI | 🔵 | P3 | — | |
| 5 viste | Heatmap, Mensile, Barre per tipo, Città×Mese, Educator×Mese | 🔵 | P2 | — | |
| Pannello Engagement | Carico/giornate per educator | 🔵 | P3 | — | Usa abilitazioni |
| Pannello Segnali | Conflitti date + cannibalizzazione (soglie) | 🔵 | P3 | — | |
| Pannello YoY | Confronto anno precedente | 🔵 | P3 | — | |

---

## 5 · Esami & test (scheda `05`) — tutto 🔵 Nuovo

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Hub liste | Esami da fare / fatti + KPI | 🔵 | P1 | nuovo | Solo Certificato + Shochu |
| Dettaglio esame corso | Overview + tab (mini-test/finale/feedback/risultati) | 🔵 | P1 | nuovo | |
| Libreria/editor domande | 9 tipi domanda, per famiglia, stima tempo | 🔵 | P1 | nuovo | |
| Mini-test giornalieri | Un test per giornata | 🔵 | P2 | nuovo | |
| Feedback | Questionario senza punteggio, link passwordless | 🔵 | P2 | nuovo | |
| Test/Feedback runner | Esecuzione (bozza/aperto/chiuso) | 🔵 | P1 | nuovo | |
| Cruscotto live | Dashboard fullscreen, avanzamento in tempo reale | 🔵 | P2 | nuovo (realtime) | Oggi simulato a timer |
| Vista studente | Anteprima device + lingua, navigazione domande | 🔵 | P1 | nuovo | ⚠️ **route mancante** (vedi sotto) |
| Report PDF tri-lingua | IT/EN/JP, breakdown categorie, download + email | 🔵 | **P1** | nuovo + PDF + **Resend** | Modello i18n (`RP_T`) |
| Esporta risultati | Excel + JSON risposte/punteggi | 🔵 | P2 | nuovo | |

---

## 6 · Template materiali (scheda `06`) — tutto 🔵 Nuovo

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Libreria template | Elenco filtrabile, utilizzi, duplica/elimina/crea | 🔵 | P2 | nuovo | |
| Editor giorni + sake | Rinomina/aggiungi giorni, sake **drag&drop**, note | 🔵 | P2 | nuovo + `/api/airtable/sake` | |
| Materiali/costi | educator/giorno, diplomi, libri, extra | 🔵 | P2 | nuovo | Alimenta il conto economico del corso |
| Applica a corso | Eredita giorni/sake/costi | 🔵 | P2 | nuovo | |

---

## 7 · Archivio (scheda `07`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| KPI + grafico anni | Barre stacked per anno + linea media | 🟡 | P2 | `/api/courses` | "Passati" esiste in prod |
| Filtri + raggruppamento | Anno/città/educator/tipo | 🟡 | P2 | `/api/courses` | |
| Esporta archivio | Export corsi | 🟡 | P3 | export | |

---

## 8 · Corsisti (scheda `08`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Lista + filtri + KPI | Segmenti, esiti, ricerca, speso | 🟡 | P1 | aggregazione | |
| Esporta CSV | Export clienti | 🟢 | P2 | `/api/export/corsisti` | |
| Profilo dossier | Hero, statistiche, contatti | 🔵 | P2 | aggregazione | |
| Journey timeline | Corsi per anno con esito | 🔵 | P2 | — | Import storico pre-2024 da definire |

---

## 9 · Educator (scheda `09`)

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Lista + filtro abilitazioni | Card con quals e statistiche | 🟡 | P2 | `/api/educator-profiles` | |
| Dettaglio + KPI + storico | Hero, lingue, prossimi/passati | 🟢 | P2 | `/api/educator/:id` | |
| Abilitazioni (quals) | Toggle tipologie assegnabili | 🔵 | P1 | nuovo (persist) | Guida Pianificatore + Notifiche |

---

## 10 · Account (scheda `10`) — tutto 🔵 Nuovo

| Funzione | Descrizione | Stato | Pri | Endpoint | Note |
|---|---|---|---|---|---|
| Profilo + foto | Dati personali, upload foto | 🔵 | P2 | nuovo + storage | |
| Cambio password | Con conferma | 🔵 | P2 | `/auth/*` | |
| Sessione / switch / ruoli | Profili attivi, permessi | 🔵 | P1 | `/auth/*` | |

---

## ⚠️ Da evidenziare (problemi noti & decisioni)

1. **Route `esame-studente` mancante.** Il bottone "Vista studente"
   (`page-esame-section.jsx`) punta a `#/esame-studente/:id`, ma `shell.jsx` non gestisce
   quel ramo → fallback su Dashboard. Il componente `V2_PageEsameStudente` esiste ed è
   caricato. **Non corretto di proposito** (richiesta: non toccare le funzioni). Da
   agganciare in implementazione.
2. **`Field` ridefinito nel render** (`page-account.jsx` e modali simili) → in React causa
   il remount dell'input ad ogni keystroke (perdita focus). Estrarre fuori dal padre.
3. **Logica stima tempo duplicata** (`ES_EST_SEC` in `page-esame-section.jsx` vs `EX_EST`
   in `page-esami.jsx`). Consolidare in un'unica utility.
4. **Email (Resend) e WhatsApp** sono mockate. Notifiche e invio report/feedback
   prevedono Resend come integrazione futura.
5. **Molti numeri sono mock hardcoded** (dashboard: "3 fatture", "78%", delta "+18%",
   insight "2.3×"; stock libri): collegare a dati reali.
6. **i18n strutturale** in report esame e vista studente (IT/EN/JP già previsti): partire
   da lì per generalizzare il sistema di traduzioni.
7. **Pulizia già fatta in handoff:** rimosse 3 versioni morte del progetto (`src/`,
   `.jsx` di root, `SSA Platform.html`) e la cartella obsoleta `v2/pages/`; rimosso
   dead-code interno verificato (variabili/export mai letti) senza toccare le funzioni.
