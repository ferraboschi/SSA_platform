# 08 · Corsisti (lista + profilo)

File prototipo: `page-corsisti.jsx` · Route: `#/corsisti` · `#/corsisti/:email`
In produzione esiste come pagina **"Corsisti"** (qui con profilo e journey).

Comunità completa dei corsisti dal 2016 (attuali da Shopify + ~80 **storici** pre-2024).

---

## Lista (`#/corsisti`)
- **KPI (4):** totale, attuali (post-2024), ripartecipanti (%), certificati.
- **Filtri:** ricerca (nome/email/città), segmento (Tutti / Attuali / Storici /
  Ripartecipanti), esito esame (promosso/recupero/bocciato).
- **Tabella:** corsista (avatar, badge Storico/Ripartecipante, email + telefono cliccabili
  con indicatore WhatsApp), città, storia (n. corsi, ultimo), esito esame, **speso totale**.
  Riga cliccabile → profilo. Paginazione (mostra 60).
- Azione: **Esporta CSV**.

## Profilo (`#/corsisti/:email`)
- **Hero dossier:** avatar, nome, contatti, badge stato (Storico/Ripartecipante).
  Azioni: mail · WhatsApp · esporta scheda.
- **4 statistiche:** corsi, esami, speso totale, status (Certificato/Returning/Attivo).
- **Journey timeline** (`JourneyTimeline`) — i corsi disposti su una **timeline per anno**,
  con esito.
- **Tabella dettaglio corsi** con esito e importo; righe non storiche linkano al corso.

## Dati & endpoint
- Da `SSA.STUDENTS` (`aggregateStudents`).
- In prod: aggregazione server su ordini Shopify + import storico; `GET
  /api/export/corsisti` per il CSV; WhatsApp via Twilio.

## Note di implementazione
- I corsisti **storici** sono mock generati: definire la sorgente reale dell'import pre-2024.
- **i18n:** segmenti, esiti, label statistiche, formati valuta/data.
- Priorità: **media** (lista esiste; profilo + journey sono nuovi e di valore CRM).
