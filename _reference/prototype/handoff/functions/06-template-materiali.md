# 06 · Template materiali

File prototipo: `page-template-materiali.jsx` · Route: `#/template-materiali` ·
`#/template-materiali/:id` · **Modulo nuovo (non esiste in produzione)**

Libreria di **template di programma riutilizzabili**. Un template definisce dei **giorni**;
dentro ogni giorno i **sake** da degustare; più le voci **materiali/costi** riutilizzabili.
Creando un corso si può applicare un template: il corso eredita giorni, sake e costi.

---

## Schermate

- **Libreria** (`TemplateLibrary`) — elenco template filtrabili per tipo corso, con
  conteggio utilizzi, ultima modifica, autore. Azioni: apri · **duplica** · elimina ·
  **crea nuovo**.
- **Editor** (`TemplateEditor`) — modifica nome/tipo/descrizione, gestione **giorni**
  (`DayCard`): rinomina giorno, aggiungi/rimuovi giorno, aggiungi/aggiorna/rimuovi sake,
  **riordino sake drag&drop**. Statistiche: n. sake, costo sake totale.
- **Materiali/costi** del template: `educatorPerDay`, `diplomaPerStudent`,
  `libroPerStudent`, ed `extra[]` (voci custom con valore e unità: per iscritto / per
  corso). Queste voci alimentano il conto economico del corso che adotta il template.

## Relazione con il Corso
Nel dettaglio corso (`03-corsi.md`, sezione Programma & Economia) il
`TemplateLibraryModal` permette di **applicare** un template al corso. Il modello dati del
template è in `DATA-MODEL.md`.

## Dati & endpoint
- Da `SSA.MATERIAL_TEMPLATES` (`buildMaterialTemplates`).
- In prod: **nuova entità** da persistere (CRUD template) + relazione corso→template;
  i sake fanno riferimento al catalogo (`/api/airtable/sake`).

## Note di implementazione
- Stato locale clonato in modo profondo (`tmDeepClone`) per editing non distruttivo.
- **i18n:** etichette materiali, nomi giorni di default, unità ("per iscritto"/"per corso").
- Priorità: **media** (accelera la creazione corsi, ma il programma è anche editabile
  direttamente sul corso).
