# 09 · Educator (lista + dettaglio)

File prototipo: `page-educator.jsx` · Route: `#/educator` · `#/educator/:id`
In produzione esiste (`/api/educator-profiles`, `/api/educator/:id`).

---

## Lista (`#/educator`)
- **Filtro per abilitazione** (pill per tipologia, con conteggio educator abilitati).
- **Card educator** (2 colonne): avatar, ruolo/città, bio, **badge abilitazioni**, e
  4 numeri: corsi · attivi · iscritti · % promossi.

## Dettaglio (`#/educator/:id`)
- **Hero:** avatar, ruolo, anni, **lingue** (`lang[]`), bio, base + città dove insegna.
- **Abilitazioni** (`EducatorQuals`) — toggle delle tipologie di corso a cui l'educator è
  assegnabile. Determina la sua presenza nelle liste del Pianificatore e genera la
  notifica "educator non abilitato" se viene assegnato a un tipo non abilitato.
- **KPI (5):** corsi totali, iscritti formati, ricavi generati, % promossi, città.
- **Prossimi corsi** (card) e **Storico corsi** (tabella con esiti esame e ricavi).
- Azione: link condivisi.

## Dati & endpoint
- Profili da Shopify metaobject "Chi Siamo"; statistiche derivate da `SSA.COURSES`.
- **Abilitazioni** (`getQuals`/`setQuals`): **nuove**, da persistere.
- `lang[]` è già un seme per matching educator↔corso per lingua e per l'i18n.

## Note di implementazione
- Le abilitazioni sono il cardine del controllo "chi può insegnare cosa" → coerenza con
  Pianificatore e Notifiche.
- **i18n:** ruoli, etichette tipologie, label KPI.
- Priorità: **media** (lista/dettaglio esistono; abilitazioni sono nuove).
