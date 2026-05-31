# SSA Platform · v2 — Modello dati & mapping verso le API reali

Questo documento descrive la **forma dei dati** usata dal prototipo e come ogni entità
si mappa sulle **sorgenti reali** (Shopify, Airtable, Twilio) descritte in
`SSA-TECHNICAL-SUMMARY.md`. I dati del prototipo sono generati in modo deterministico
(funzione `seed()`) per essere realistici e stabili tra i refresh.

---

## 1. Entità principali

### Corso (`SSA.COURSES[]`)
Generato da `buildCourse()` in `data.js`. Campi chiave:

| Campo | Tipo | Significato | Sorgente reale |
|---|---|---|---|
| `id` | string | ID interno prototipo (`c01`, `p03`, `b01`…) | → `handle` Shopify in prod |
| `handle` | string | Slug corso | Shopify product handle (**identificatore primario**) |
| `type` | enum | `certificato` \| `introduttivo` \| `masterclass` \| `shochu` \| `mixology` | da `parseCourseType(handle)` |
| `typeLabel` / `typeShort` / `typeColor` | string | Etichette e colore badge | derivati |
| `title` / `shortTitle` | string | Titolo lungo / breve | Shopify title |
| `city` / `mode` | string | Città · `presenza` \| `online` | `parseCourseCity(handle, title, tags)` |
| `month` / `year` / `day` / `days` | — | Data e durata in giorni | `parseCourseDate(handle)` (fallback `created_at`) |
| `educator` | object | `{id, name, role, city, …}` | metafield Shopify + metaobject "Chi Siamo" |
| `capacity` / `enrolled` | number | Posti / iscritti | `enrollmentCount` da ordini Shopify |
| `minStudents` / `price` | number | Soglia minima / prezzo | `COURSE_TYPES` config |
| `revenue` / `costs` / `totalCost` / `margin` | — | Conto economico | ordini Shopify + `course-costs.json` (Airtable) |
| `status` | enum | `in-traiettoria` \| `monitor` \| `rischio` \| `critico` | **regola salute** (vedi `03-corsi.md`) |
| `lifecycle` | enum | `pubblicato` \| `bozza` \| `archiviato` \| `passato` | stato Shopify + logica data |
| `students[]` | array | Iscritti (vedi sotto) | ordini Shopify + registrazioni QR Airtable |
| `program[]` | array | Giorni → sake da degustare | `course-costs.json.program` (Airtable) |
| `whatsappLink` / `shareLink` | string | Link gruppo WhatsApp / link condivisibile educator | `course-costs.json` + share-tokens |
| `notebook` | object | Note admin, tag, azione pianificata, *reasoning* salute | **nuovo** — da persistere (Airtable) |
| `exam` / `examMeta` / `examResults2` | object | Stato esame (vedi `data-exam.js`) | **nuovo** — modulo esami |

### Iscritto (`course.students[]`)
| Campo | Tipo | Sorgente reale |
|---|---|---|
| `name` / `email` / `phone` | string | Ordine Shopify |
| `orderNumber` / `orderDate` / `amount` / `grossAmount` | — | Ordine Shopify |
| `discountCode` | string\|null | Ordine Shopify |
| `hasWhatsApp` | bool | **Twilio Lookup** (line_type_intelligence, pattern non-bloccante) |
| `nameMismatch` / `registrationName` | — | cross-ref ordine Shopify vs registrazione QR (Airtable) |

### Corsista aggregato (`SSA.STUDENTS[]`)
Costruito da `aggregateStudents()`: unisce gli iscritti di tutti i corsi per email,
più ~80 corsisti **storici pre-2024** (flag `historical`). Campi: `email`, `name`,
`phone`, `city`, `courses[]` (con `examResult`), `totalSpent`, `isReturning`,
`firstSeen`. → in prod: aggregazione lato server su ordini Shopify + storico importato.

### Educator (`SSA.EDUCATORS[]`)
`{id, name, role, city, initials, bio, years, lang[]}`. → Shopify metaobject "Chi Siamo"
(`/api/educator-profiles`, `/api/educator/:id`). Il campo `lang[]` (IT/EN/FR…) è già un
seme per l'i18n e per il matching educator↔corso per lingua.

### Esami (`data-exam.js`)
- **Banche domande** per famiglia: `NIHONSHU_CATS` (5 macro-categorie), `SHOCHU_Q`.
- **Tipi domanda**: `single`, `multi`, `truefalse`, `fill`, `open`, `match`, `order`,
  `image`, `rating`.
- **Mini-test giornalieri** (`MINI_*`), **Feedback** per famiglia (`FEEDBACK_*`),
  **esame finale** (`TEMPLATES`).
- Solo corsi `certificato` e `shochu` hanno esame completo; `examResults2` contiene le
  sessioni/punteggi generati per i corsi passati.
- → **nuovo modulo** da persistere (DB o Airtable): definizioni esami, domande,
  sessioni studente, risposte, punteggi.

### Template materiali (`SSA.MATERIAL_TEMPLATES[]`)
`buildMaterialTemplates()`: ogni template = `{name, type, days[], materiali, uses,
lastUsed, createdBy}`. Ogni giorno contiene `sakes[]`. `materiali` definisce costi
riutilizzabili (`educatorPerDay`, `diplomaPerStudent`, `libroPerStudent`, `extra[]`).
→ **nuovo** — entità da creare e persistere; un corso può ereditarne giorni e costi.

### Stato app (`app-state.js`)
- **Utenti** (`USERS`): 2 profili (admin / manager) con switch. → in prod: auth reale
  (oggi `AUTH_USERNAME`/`AUTH_PASSWORD` su Render) + profili multipli.
- **Abilitazioni educator** (`getQuals`/`setQuals`): quali tipologie di corso un educator
  può insegnare. → **nuovo** — da persistere.
- **Soglie operative** (`getDashThresholds`): `shipDays`, `bookMin`, `sakeExamPct`. →
  **nuovo** — config persistente.
- **Notifiche** (`computeNotifications`): alert "educator non abilitato al tipo". →
  **nuovo** — + invio mail via **Resend** (futuro).
- Persistenza prototipo: `localStorage`; evento `ssa-state` per il re-render globale.

---

## 2. Mapping mock → API reali (sintesi)

| Dato prototipo | Endpoint reale (se esiste) | Note |
|---|---|---|
| `SSA.COURSES` | `GET /api/courses` | corsi + iscritti + revenue + educator |
| `course.costs` / `program` / `notebook` | `GET/POST /api/costs/:courseId` | config persistente (file + Airtable) |
| `course.students[].hasWhatsApp` | Twilio Lookup v2 (server-side) | pattern non-bloccante, cache 30gg |
| `SSA.STUDENTS` (export) | `GET /api/export/corsisti` | CSV clienti Shopify |
| `SSA.EDUCATORS` | `GET /api/educator-profiles`, `/api/educator/:id` | metaobject "Chi Siamo" |
| Programma sake (catalogo) | `GET /api/airtable/sake`, `/api/sakecompany/products` | catalogo + immagini sake |
| `course.shareLink` | `/api/share-link/:handle`, `/api/shared/:token`, `/share/:token` | link condivisione educator |
| Export Excel | `/api/export/course/:handle`, `/api/export/sake/:handle` | iscritti / sake del corso |
| Esami, Pianificatore, Template materiali, Notifiche, Account, i18n | **— da creare —** | nuovi moduli |

> Per i dettagli completi degli endpoint esistenti (auth, caching, rate limiting,
> variabili d'ambiente) fare riferimento a `SSA-TECHNICAL-SUMMARY.md`.
