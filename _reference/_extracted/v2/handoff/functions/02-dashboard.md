# 02 · Dashboard

File prototipo: `page-dashboard.jsx` · Route: `#/dashboard`

Pagina d'apertura: panoramica operativa per l'amministrazione SSA.

---

## Sezioni (dall'alto)

1. **Hero / saluto.** Data corrente, saluto personalizzato ("Buongiorno, {nome}") con
   headline dinamica (n. corsi sotto soglia, n. fatture da chiudere). Pulsanti rapidi:
   esame live (se presente), apri catalogo, **Report mese**. A destra: card "Pipeline 6
   mesi" con ricavi attesi e occupazione posti.

2. **Riga KPI (4).** Corsi attivi · Iscritti totali · Margine atteso · Tasso promozione
   esame. Ognuno con delta e accento colore.

3. **Promemoria operativi** (`OperationalReminders`) — 4 colonne:
   - **Spedizioni kit** (corsi online entro N giorni — soglia `shipDays`),
   - **Stock libri** (sotto soglia `bookMin`),
   - **Sake per esami** (% disponibilità vs fabbisogno — soglia `sakeExamPct`),
   - **Altre attenzioni** (fatture educator, rinnovo location…).
   - Pulsante **"Imposta soglie"** → modale `DashThresholdsModal` (persistite via
     `app-state`).

4. **Pipeline 6 mesi.** Griglia per mese: n. corsi, mini-barre per corso colorate per
   stato, iscritti/capienza, ricavi. Ogni barra ha **tooltip ricco** e linka al corso.

5. **Due colonne:** "Richiede attenzione" (tabella corsi sotto soglia) · "Ultime
   iscrizioni" (feed iscritti recenti con codice sconto e importo).

6. **Riga finale:** "Top educator" (4) · "Comunità SSA" (totale corsisti, attuali,
   ripartecipanti, certificati + insight).

## Modale "Report mese" (`MonthlyReportModal`)

Selettore periodo (mese/anno). KPI del mese: nuovi corsi, corsi svolti, % promossi,
economia corsi svolti, educator coinvolti, iscritti. Tabella corsi del periodo con esito
esame, stato, margine. Export PDF (oggi `window.print()`).

## Dati & endpoint

- Tutti i numeri derivano da `SSA.COURSES` / `SSA.STUDENTS` / `SSA.KPI` → in prod da
  `GET /api/courses` + aggregazioni.
- Promemoria spedizioni/stock libri/sake esame: **logica nuova**; i dati stock libri sono
  **mock hardcoded** → definire sorgente reale (inventario).
- Soglie operative: **nuove**, da persistere.

## Note di implementazione

- Diversi valori sono **mock hardcoded** (es. "3 fatture", "78%", delta "+18%"): sono
  placeholder da collegare a dati reali.
- **i18n:** saluto, headline, etichette KPI, mesi (il selettore report usa i nomi mese
  come chiave), formati valuta `it-IT`.
