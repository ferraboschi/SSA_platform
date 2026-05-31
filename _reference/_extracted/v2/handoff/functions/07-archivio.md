# 07 · Archivio

File prototipo: `page-archivio.jsx` · Route: `#/archivio`
In produzione esiste come pagina **"Passati"** (qui ampliata e ridisegnata).

Repository di **tutti** i corsi (passati, in corso e futuri; esclusi bozze e annullati).

---

## Schermate
- **KPI (4):** corsi, iscritti formati, ricavi cumulativi, città.
- **YearStrip** — grafico a **barre stacked per anno** (segmentate per tipo corso) con
  asse Y, gridlines, **linea media** di riferimento; click su un anno → filtra.
- **Toolbar:** ricerca, filtro anno, filtro tipo, **raggruppamento** per Anno / Città /
  Educator / Tipo.
- **Gruppi** (`ArchivioGroups`) — sezioni con header (conteggi: corsi, iscritti, ricavi)
  e card corso che linkano al dettaglio.
- Azione: **Esporta archivio**.

## Dati & endpoint
- Da `SSA.COURSES` filtrati per lifecycle → `GET /api/courses`.

## Note di implementazione
- La `YearStrip` è una mini data-viz fatta a mano in CSS/flex (nessuna libreria chart):
  in prod si può mantenere o sostituire con una lib, ma conservare l'estetica (barre
  stacked + linea media + asse).
- **i18n:** etichette raggruppamento, label tipi corso, "CONCLUSO"/"PROSSIMO".
- Priorità: **bassa/media** (esiste già una forma in produzione).
