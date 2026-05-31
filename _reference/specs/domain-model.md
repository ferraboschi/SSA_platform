# SSA Platform · Domain Model Specification

Complete, exhaustive domain model extracted from the React prototype (`data.js`, `data-exam.js`, `app-state.js`) and handoff documentation. This specification is the single source of truth for TypeScript domain types and repository interfaces.

---

## 1. Entity Catalog

### Course (Corso)

**Primary Key:** `handle` (Shopify identifier, immutable)

| Field | Type | Required | Constraints | Meaning |
|-------|------|----------|-------------|---------|
| `id` | string | ✓ | alphanumeric (`c01`, `p03`, `b01`, etc.) | Prototype internal ID; maps to Shopify product ID in production |
| `handle` | string | ✓ | slug format (`corso-{type}-{city}-{month}-{year}-{id}`) | **Primary key** in production; Shopify product handle |
| `type` | enum | ✓ | `certificato` \| `introduttivo` \| `masterclass` \| `shochu` \| `mixology` | Course classification; determines exam format and educator qualifications |
| `typeLabel` | string | ✓ | Derived; e.g., "Certificato", "Introduttivo", "Masterclass", "Shochu", "Mixology" | User-facing course type name |
| `typeShort` | string | ✓ | `CERT`, `INTRO`, `MASTER`, `SHOCHU`, `MIX` | Abbreviated label for badges/lists |
| `typeColor` | string | ✓ | `azzurro` \| `oro` \| `neutral` | Design token for visual categorization |
| `title` | string | ✓ | e.g., "Corso di Sake Sommelier Certificato — Maggio 2026, Milano" | Full, verbose course title |
| `shortTitle` | string | ✓ | e.g., "Sake Sommelier Certificato" or "Introduttivo al Sake" | Abbreviated title for lists/exports |
| `city` | string | ✓ | City name (IT) or "Online" | Training location; used in handle and course health logic |
| `mode` | string | ✓ | `presenza` \| `online` | Delivery mode; defaults to `online` if `city === "Online"`, else `presenza` |
| `month` | string | ✓ | Italian month name (e.g., "Maggio", "Giugno", "Dicembre") | Month of course start |
| `year` | number | ✓ | YYYY | Year of course start |
| `day` | number | ✓ | 1–31 | Day of month for course start |
| `days` | number | ✓ | 1–3 (typically) | Duration in calendar days; defaults: `certificato` 3, `introduttivo` 1, `shochu` 2 |
| `educator` | object | ✓ | Educator object (see below) | Assigned trainer; triggers "educator-mismatch" notification if educator lacks type qualification |
| `capacity` | number | ✓ | 4–50 | Max seats available; type-dependent minimum (`minStudents`) |
| `enrolled` | number | ✓ | 0–capacity | Current registration count; feeds course health status |
| `minStudents` | number | ✓ | 4–6 (per type) | Min threshold; values: `certificato` 6, `introduttivo` 6, `masterclass` 4, `shochu` 6, `mixology` 5 |
| `price` | number | ✓ | EUR; per-type default | Base price per student; values: `certificato` 590, `introduttivo` 150, `masterclass` 280, `shochu` 380, `mixology` 260 |
| `revenue` | number | ✓ | Calculated | `enrolled * (price * 0.85)` — accounts for typical discounts; rounded |
| `costs` | object | ✓ | Keys: `educator`, `gestione`, `diplomi`, `libri`, `location`, `food`, `adv` | Line-item cost breakdown (EUR). Values in `costsOverride` param replace defaults |
| `totalCost` | number | ✓ | Calculated | Sum of all cost line items |
| `margin` | number | ✓ | Calculated | `revenue - totalCost`, rounded |
| `status` | enum | ✓ | `in-traiettoria` \| `monitor` \| `rischio` \| `critico` | Health status computed from enrollment velocity, historical cohort data, and threshold rules |
| `statusLabel` | string | ✓ | Derived from STATUS_META | User-facing status label (e.g., "In traiettoria", "A rischio") |
| `statusTone` | string | ✓ | `good` \| `neutral` \| `warn` \| `bad` | Design tone for status visualization |
| `lifecycle` | enum | ✓ | `pubblicato` \| `bozza` \| `archiviato` \| `passato` | Course state: published (live), draft, archived (cancelled), past (completed) |
| `students` | array | ✓ | Array of Student objects (see below) | Registrants for this course; generated from `makeStudents(handle, capacity, enrolled)` |
| `program` | array | ✓ | Array of Program Day objects | Sake tasting schedule; generated from `makeProgram(handle, days)` |
| `whatsappLink` | string | ✓ | `https://chat.whatsapp.com/SSAGroup{id}` | WhatsApp group link for course cohort |
| `shareLink` | string | ✓ | `https://corsi.sakesommelierassociation.it/share/{id}abc123` | Educator share link for public course preview |
| `notebook` | object | ✓ | Admin notes, tags, planned action, reasoning | Course management metadata (new module) |
| `exam` | object | Optional | Exam object (see Exam section) | Full exam configuration; only for `certificato` and `shochu` types |
| `examResults2` | array | Optional | Array of ExamResult objects | Detailed per-student exam results; populated for `lifecycle === "passato"` |
| `examLive` | array | Optional | Array of ExamLiveSession objects | Real-time exam session state; populated only for active live exam (`id === "c01"`) |
| `examMeta` | object | Optional | Exam metadata (family, date, mini-tests, feedback state) | Summary of exam schedule and progress |
| `examResults` | object | Optional | `{ passed: number, retrial: number, failed: number }` | Legacy format: only for past courses with exam completion |

**Default Cost Structure:**

```
{
  educator: 600,      // Per course
  gestione: 900,      // Per course
  diplomi: 460,       // Per course
  libri: 36,          // Per course
  location: 0 | 250,  // 0 for Milano, 250 elsewhere
  food: 0 | 80,       // 0 for certificato, 80 otherwise
  adv: 0              // Per course
}
```

**Status Logic (Computed):**

Course status is derived from:
1. **Enrollment velocity** relative to historical cohort median (4 similar courses in 18 months)
2. **Thresholds:**
   - `in-traiettoria`: velocity ≥ median (positive margin expected)
   - `monitor`: limited historical data OR at threshold; 2-week observation window
   - `rischio`: velocity < median −43%; closure risk if drops below `minStudents`
   - `critico`: insufficient data OR very low enrollment for phase

---

### Student (Iscritto / Student per-course)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `name` | string | ✓ | Full name from Shopify order |
| `email` | string | ✓ | Email address (lowercase); primary key for student aggregation |
| `phone` | string | ✓ | Phone number with country code (e.g., "+39 338 123 4567") |
| `orderNumber` | string | ✓ | Shopify order ID (format: `SSA{4-digit}`) |
| `orderDate` | ISO 8601 | ✓ | Order creation timestamp |
| `amount` | number | ✓ | EUR, post-discount |
| `grossAmount` | number | ✓ | EUR, pre-discount |
| `discountCode` | string \| null | Optional | Applied promo code (e.g., `KITSUNE100`, `EARLY50`, `FRIENDS20`) or null |
| `hasWhatsApp` | boolean | ✓ | Derived from Twilio Lookup v2 (`line_type_intelligence`) or cached result |
| `nameMismatch` | boolean | ✓ | True if order name ≠ QR registration name |
| `registrationName` | string \| null | Optional | Name from Airtable QR registration if mismatch detected |

**Source:** Shopify orders + Twilio Lookup (background, non-blocking) + Airtable QR registrations (cross-reference)

---

### Aggregate Student (Corsista)

Built from `aggregateStudents()`: combines per-course enrollments + ~80 historical pre-2024 records.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `email` | string | ✓ | Lowercase email (primary key) |
| `name` | string | ✓ | Student name |
| `phone` | string | ✓ | Phone with country code |
| `hasWhatsApp` | boolean | ✓ | Cached Twilio result |
| `city` | string | ✓ | Inferred from seeded CITIES array or historical data |
| `firstSeen` | string | ✓ | First course date (format: `YYYY-Mese`, e.g., "2026-Maggio") |
| `courses` | array | ✓ | Array of Course Enrollment objects (see below) |
| `totalSpent` | number | ✓ | Sum of `amount` across all course enrollments (EUR) |
| `isReturning` | boolean | ✓ | Computed: `courses.length > 1` |
| `historical` | boolean | Optional | Flag for pre-2024 data (imported, not live from Shopify) |

**Course Enrollment (nested in `courses[]`):**

| Field | Type | Meaning |
|-------|------|---------|
| `courseId` | string | Course ID |
| `courseTitle` | string | Short title |
| `courseType` | enum | `certificato`, `introduttivo`, etc. |
| `city` | string | Course city |
| `month` / `year` | string / number | Course date |
| `status` | enum | `passato`, `pubblicato`, etc. (from course.lifecycle) |
| `amount` | number | Amount paid for this course (EUR) |
| `examResult` | enum \| null | `passed` \| `retrial` \| `failed` (for past certificato/shochu only) |
| `historical` | boolean | Optional; marks pre-2024 data |

---

### Educator (Educatore)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string | ✓ | Short ID (e.g., `e1`, `e2`) |
| `name` | string | ✓ | Full name |
| `role` | string | ✓ | Title (e.g., "Founder & Senior Educator", "Senior Educator", "Educator") |
| `city` | string | ✓ | Base city or "Online" |
| `initials` | string | ✓ | 2-char initials |
| `bio` | string | ✓ | Professional bio (Italian) |
| `years` | number | ✓ | Years of experience |
| `lang` | array | ✓ | Languages (`["IT", "EN", "FR"]`, etc.) |

**Source:** Shopify metaobject "Chi Siamo" (educator profiles)

---

### Exam (Esame)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `courseId` | string | ✓ | Foreign key to Course.id |
| `family` | enum | ✓ | `nihonshu` \| `shochu` | Determines question bank and thresholds |
| `cats` | array | ✓ | Array of ExamCategory objects | Question categories for this family |
| `totalQuestions` | number | ✓ | 80 (shochu) or 110 (nihonshu) |
| `totalPoints` | number | ✓ | Sum of all question point values |
| `duration` | number | ✓ | 60 (nihonshu) or 50 (shochu); minutes |
| `mockDuration` | number | ✓ | 30 minutes (sempre) |
| `feedbackDuration` | number | ✓ | 15 minutes (sempre) |
| `thresholds` | object | ✓ | `{ pass: 0.80, retrial: 0.70 }` — percentage thresholds |
| `questions` | array | ✓ | Array of ExamQuestion objects |
| `phases` | object | ✓ | `{ mockTest, feedback, exam }` — three exam phases (see Phase below) |

**ExamCategory:**

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | e.g., `storia`, `produzione`, `varieta`, `degustazione`, `servizio` (nihonshu) or `storia-s`, `produzione-s`, `ingredienti`, `degustazione-s`, `servizio-s` (shochu) |
| `label` | string | e.g., "Storia & Cultura", "Produzione & Tecnica" |
| `short` | string | e.g., "Storia", "Produzione" |

**ExamPhase (in `phases`):**

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | `mock` \| `feedback` \| `exam` |
| `label` | string | "Mock test" \| "Feedback sessione" \| "Esame finale" |
| `scheduled` | string | e.g., "Giorno 3 · 14:00" or "Settimana +1 · sabato 14:00" |
| `duration` | number | Minutes |
| `status` | enum | `draft` \| `scheduled` \| `ready` \| `completed` |
| `n` | number | Question count |

---

### ExamQuestion

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string | ✓ | Unique ID (e.g., `q01`, `c01-q1`) |
| `cat` | string | ✓ | Category ID (foreign key to ExamCategory.id) |
| `type` | enum | ✓ | `single` \| `multi` \| `truefalse` \| `fill` \| `open` \| `match` \| `order` \| `image` \| `rating` |
| `important` | boolean | ✓ | High-priority question; wrong answers tracked separately |
| `lang` | string | ✓ | Language code (e.g., `it`, `en`, `jp`) |
| `text` | string | ✓ | Question text (Italian) |
| `options` | array | Optional | Choices for `single`, `multi`, `truefalse`, `image` types |
| `correct` | array | ✓ | Indices of correct option(s) in `options[]` (e.g., `[1]` for single-answer, `[0, 2, 3]` for multi) |
| `points` | number | ✓ | Point value (default 1); `open` questions 3, `match`/`order` 2 |
| `explanation` | string | Optional | Rationale for correct answer (e.g., for `truefalse`) |
| `pairs` | array | Optional | Match/pairing questions: `[{ l: "left", r: "right" }, ...]` |
| `items` | array | Optional | Order/sequence questions: array of items to order |
| `imageId` | string | Optional | Image reference for `image` type questions |
| `aiKey` | string | Optional | Key for AI-graded open-response (e.g., `kimoto-yamahai`, `junmai-daiginjo-profile`) |
| `n` | number | Optional | Question ordinal (set during exam instantiation from template) |

---

### ExamResult (Risultato esame studente)

| Field | Type | Meaning |
|-------|------|---------|
| `email` | string | Student email (foreign key) |
| `name` | string | Student name |
| `score` | number | Percentage (0–100); rounded |
| `status` | enum | `passed` (≥80%) \| `retrial` (70–79%) \| `failed` (<70%) |
| `completedAt` | ISO 8601 | Submission timestamp |
| `durationMin` | number | Minutes taken to complete exam |
| `sections` | array | Per-category breakdown (see Section below) |
| `wrongImportant` | array | Important questions answered incorrectly (top 3) |

**Section (nested):**

| Field | Type | Meaning |
|-------|------|---------|
| `cat` | string | Category ID |
| `label` | string | Category label |
| `short` | string | Short label |
| `pct` | number | Category score percentage |

**WrongImportant (nested):**

| Field | Type | Meaning |
|-------|------|---------|
| `questionId` | string | Question ID |
| `cat` | string | Category |
| `text` | string | Question text |
| `wrongAnswer` | string | Student's incorrect answer (or "—") |
| `correctAnswer` | string | Correct answer |

---

### ExamLiveSession

Real-time state during active exam (e.g., `course.id === "c01"`).

| Field | Type | Meaning |
|-------|------|---------|
| `email` | string | Student email |
| `name` | string | Student name |
| `status` | enum | `not-started` \| `in-progress` \| `submitted` |
| `progress` | number | Percentage complete (0–100) |
| `score` | number \| null | Score (only if `status === "submitted"`) |
| `durationMin` | number \| null | Minutes elapsed |
| `checkedIn` | boolean | Presence confirmation |

---

### Mini-Test (Prova giornaliera)

Template for daily tests during course.

| Field | Type | Meaning |
|-------|------|---------|
| `day` | number | Day number (1, 2, 3, ...) |
| `name` | string | e.g., "Nihonshu · Day 1 test" or "Shochu · Day 1 test" |
| `topic` | string | e.g., "Storia & basi di produzione" |
| `duration` | number | 10 minutes (sempre) |
| `questions` | array | Array of ExamQuestion objects specific to this day |

---

### ExamMeta (Metadata esame per corso)

| Field | Type | Meaning |
|-------|------|---------|
| `family` | enum | `nihonshu` \| `shochu` |
| `familyLabel` | string | e.g., "Nihonshu · Certificato" |
| `examDate` | ISO 8601 | Final exam date (~1 week after course end) |
| `examDateLabel` | string | e.g., "lun 11 giu 2026" |
| `examDayNo` | number | Relative day number (e.g., 11 for Nihonshu 3-day course) |
| `done` | boolean | True if `course.lifecycle === "passato"` |
| `live` | boolean | True if active live exam |
| `miniTests` | array | Array of MiniTestMeta objects |
| `feedback` | object | Feedback summary (see Feedback below) |

**MiniTestMeta:**

| Field | Type | Meaning |
|-------|------|---------|
| `day` | number | Day number |
| `name` | string | Test name |
| `topic` | string | Topic |
| `nQuestions` | number | Question count |
| `status` | enum | `pianificato` \| `completato` |
| `avgScore` | number \| null | Average score if completed |
| `completion` | number | 0 or 100 |

**Feedback (in examMeta):**

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | e.g., "Feedback Nihonshu" |
| `total` | number | Course enrolled count |
| `sent` | boolean | True if sent to students |
| `responses` | number | Count of responses |
| `status` | enum | `pronto` \| `inviato` |

---

### MaterialTemplate (Template materiali)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string | ✓ | e.g., `mtpl-1`, `mtpl-2` |
| `name` | string | ✓ | e.g., "Certificato classico", "Introduttivo · serata singola" |
| `type` | enum | ✓ | Course type: `certificato`, `introduttivo`, `masterclass`, `shochu`, `mixology` |
| `days` | array | ✓ | Array of MaterialDay objects |
| `materiali` | object | ✓ | Cost config (see below) |
| `description` | string | ✓ | Purpose and notes |
| `lastUsed` | string | ✓ | Date string (e.g., "12 Mar 2026") |
| `uses` | number | ✓ | Count of times used |
| `createdBy` | string | ✓ | Creator name or ID |

**MaterialDay (nested):**

| Field | Type | Meaning |
|-------|------|---------|
| `day` | number | Day number (1, 2, 3, ...) |
| `name` | string | e.g., "Fondamenti & assaggi guidati", "Produzione & pairing" |
| `sakes` | array | Array of Sake objects (see below) |

**Sake (in program):**

| Field | Type | Meaning |
|-------|------|---------|
| `code` | string | Product code (e.g., `SAK001`) |
| `name` | string | Product name in Italian |
| `type` | enum | e.g., "Junmai Daiginjo", "Nigori", "Aged", etc. |
| `sakagura` | string | Brewery name (e.g., "Asahi Shuzo", "Dassai") |
| `size` | number | mL (e.g., 300, 720, 1800) |
| `cost` | number | EUR per unit |
| `qty` | number | Quantity to order |
| `note` | string | Optional notes |

**Materiali cost breakdown (in `materiali`):**

| Field | Type | Meaning |
|-------|------|---------|
| `educatorPerDay` | number | EUR per educator per course day (e.g., 200–300) |
| `diplomaPerStudent` | number | EUR per diploma (e.g., 60–115) |
| `libroPerStudent` | number | EUR per book (e.g., 8–12) |
| `extra` | array | Optional line items: `[{ id, label, value, per }]` where `per` is `"iscritto"` or `"corso"` |

---

### User (Utente)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string | ✓ | e.g., `lorenzo`, `camilla` |
| `first` | string | ✓ | First name |
| `last` | string | ✓ | Last name |
| `name` | string | ✓ | Full name |
| `role` | string | ✓ | e.g., "Fondatore · Admin SSA", "Resp. SSA Italiana" |
| `roleKey` | enum | ✓ | `admin` \| `manager` |
| `email` | string | ✓ | Email address |
| `phone` | string | ✓ | Phone with country code |
| `city` | string | ✓ | Base city |
| `position` | string | ✓ | Job title |
| `initials` | string | ✓ | 2-char initials |
| `tone` | string | ✓ | Color tone (e.g., `navy`, `oro`) |

**Source:** `app-state.js` USERS array; in production: auth integration (currently basic auth via `AUTH_USERNAME`/`AUTH_PASSWORD`)

---

### Notification (Notifica)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string | ✓ | e.g., `qual-c01` |
| `kind` | enum | ✓ | `educator-mismatch` (only kind in prototype) |
| `tone` | enum | ✓ | `danger` \| `warning` \| `info` |
| `icon` | string | ✓ | Icon key (e.g., `warn`) |
| `title` | string | ✓ | Notification title |
| `body` | string | ✓ | Detailed message |
| `meta` | string | ✓ | Contextual info (e.g., "Milano · Maggio 2026 · da Shopify") |
| `email` | string | ✓ | Recipient email (educator's email for educator-mismatch) |
| `href` | string | ✓ | Navigation link (e.g., `#/corsi/c01`) |
| `courseId` | string | ✓ | Related course ID |

**Notification Logic:** Triggered by `computeNotifications()` when:
- Course lifecycle is `pubblicato` or `bozza`
- Assigned educator lacks qualification for course type (not in `getQuals(educatorId)`)
- Future: email via Resend

---

### Threshold / Settings (Soglie operative)

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `shipDays` | number | 5 | Days before course start to ship materials |
| `bookMin` | number | 30 | Minimum books to order threshold |
| `sakeExamPct` | number | 70 | Exam passing percentage (currently unused; thresholds 80/70 hardcoded in Exam) |

**Persistence:** localStorage key `ssa_dash_thresholds`; mutable via `setDashThresholds(patch)`

---

### Notebook (Note corso)

| Field | Type | Meaning |
|-------|------|---------|
| `adminNotes` | array | Array of Note objects: `{ id, text, author, at }` |
| `plannedAction` | string \| null | e.g., "Campagna ADV" |
| `tags` | array | e.g., `["sede-confermata", "catering-ok", "bassa-iscrizione"]` |
| `reasoning` | string | Explanation for current health status |

**Note (nested):**

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Unique ID |
| `text` | string | Note content |
| `author` | string | Author ID (e.g., `admin`) |
| `at` | ISO 8601 | Timestamp |

---

## 2. Relationships & Foreign Keys

```
User (1) ──→ (M) Course          — user can manage multiple courses
User (1) ──→ (M) Educator Qualification  — user can enable/disable educator course types

Educator (1) ──→ (M) Course      — educator teaches multiple courses
Educator (1) ──→ (M) Courses Taught (aggregated)

CourseType (1) ──→ (M) Course    — type defines defaults (price, minStudents, days, color)

Course (1) ──→ (M) Student       — course has many enrollments
Student → Student (Corsista)      — per-course Student aggregated by email → Corsista

Course (1) ──→ (1) Exam          — only certificato / shochu courses have exams
Exam (1) ──→ (M) ExamQuestion    — exam contains many questions
ExamQuestion (M) ──→ (1) ExamCategory  — question belongs to category

Course (1) ──→ (1) ExamMeta       — metadata about exam schedule/progress
ExamMeta (1) ──→ (M) MiniTestMeta
ExamMeta (1) ──→ (1) Feedback

Course (1) ──→ (M) ExamResult    — course has result per student

Course (1) ──→ (1) MaterialTemplate  — course inherits days/program structure from template
MaterialTemplate (1) ──→ (M) MaterialDay ──→ (M) Sake

Course → Notification           — course can trigger educator-mismatch notification

Educator (1) ──→ (M) Qualification  — educator has list of allowed course types (stored separately in localStorage)
```

---

## 3. Enums & Constants

### Course Types (COURSE_TYPES)

Exact keys and configuration:

```javascript
{
  certificato: {
    label: "Certificato",
    short: "CERT",
    color: "azzurro",
    minStud: 6,
    price: 590,
    hasExam: true,  // implicit; only certificato & shochu
    defaultDays: 3
  },
  introduttivo: {
    label: "Introduttivo",
    short: "INTRO",
    color: "oro",
    minStud: 6,
    price: 150,
    hasExam: false,
    defaultDays: 1
  },
  masterclass: {
    label: "Masterclass",
    short: "MASTER",
    color: "neutral",
    minStud: 4,
    price: 280,
    hasExam: false,
    defaultDays: 1
  },
  shochu: {
    label: "Shochu",
    short: "SHOCHU",
    color: "azzurro",
    minStud: 6,
    price: 380,
    hasExam: true,
    defaultDays: 2
  },
  mixology: {
    label: "Mixology",
    short: "MIX",
    color: "oro",
    minStud: 5,
    price: 260,
    hasExam: false,
    defaultDays: 1
  }
}
```

### Course Lifecycle (STATUS)

Exact string values:

```javascript
[
  "pubblicato",    // Active, publicly listed
  "bozza",         // Draft, not yet published
  "archiviato",    // Cancelled/archived
  "passato"        // Completed, past course
]
```

### Course Health Status (STATUSES)

Exact string values with metadata:

```javascript
[
  "in-traiettoria",  // On track; margin positive expected
  "monitor",         // Monitor for 2 weeks; limited history or at threshold
  "rischio",         // At risk; velocity < cohort median -43%
  "critico"          // Critical; insufficient data or very low enrollment
]

// STATUS_META labels and tones
{
  "in-traiettoria": { label: "In traiettoria", tone: "good" },
  "monitor":        { label: "Da monitorare",  tone: "neutral" },
  "rischio":        { label: "A rischio",      tone: "warn" },
  "critico":        { label: "Critico",        tone: "bad" }
}
```

### Exam Family

```javascript
[
  "nihonshu",   // Sake sommelier certification
  "shochu"      // Shochu certification
]
```

### Exam Question Types

```javascript
[
  "single",      // Single choice
  "multi",       // Multiple choice
  "truefalse",   // True/False
  "fill",        // Fill in the blank
  "open",        // Open-ended (AI-graded)
  "match",       // Matching pairs
  "order",       // Sequence ordering
  "image",       // Image identification
  "rating"       // Rating scale
]
```

### Nihonshu Exam Categories (NIHONSHU_CATS)

```javascript
[
  { id: "storia", label: "Storia & Cultura", short: "Storia" },
  { id: "produzione", label: "Produzione & Tecnica", short: "Produzione" },
  { id: "varieta", label: "Varietà & Stili", short: "Varietà" },
  { id: "degustazione", label: "Degustazione & Sensoriale", short: "Degustazione" },
  { id: "servizio", label: "Servizio & Pairing", short: "Servizio" }
]
```

### Shochu Exam Categories (SHOCHU_CATS)

```javascript
[
  { id: "storia-s", label: "Storia & Tradizione", short: "Storia" },
  { id: "produzione-s", label: "Produzione & Distillazione", short: "Produzione" },
  { id: "ingredienti", label: "Ingredienti & Koji", short: "Ingredienti" },
  { id: "degustazione-s", label: "Degustazione", short: "Degustazione" },
  { id: "servizio-s", label: "Servizio & Cocktail", short: "Servizio" }
]
```

### Exam Result Status

```javascript
[
  "passed",    // score >= threshold.pass (0.80)
  "retrial",   // threshold.retrial (0.70) <= score < threshold.pass
  "failed"     // score < threshold.retrial
]
```

### Exam Phase Status

```javascript
[
  "draft",       // Not yet scheduled
  "scheduled",   // Scheduled but not started
  "ready",       // Ready to administer
  "completed"    // Completed
]
```

### Role Keys (for Users)

```javascript
[
  "admin",       // Full administrative access
  "manager"      // Regional/operational management
]
```

### Discount Code (known values in prototype)

```javascript
[
  "KITSUNE100",  // €100 discount
  "EARLY50",     // €50 early-bird discount
  "FRIENDS20",   // €20 friends referral
  null           // No discount
]
```

### Sake Types (for program)

```javascript
[
  "Junmai Daiginjo",
  "Junmai Ginjo",
  "Junmai",
  "Honjozo",
  "Daiginjo",
  "Nigori",
  "Sparkling",
  "Aged",
  "Kimoto",
  "Yamahai"
]
```

### Languages (for educators & i18n)

```javascript
[
  "IT",   // Italian
  "EN",   // English
  "FR",   // French
  "JA"    // Japanese (for exam reports)
]
```

### Sake Breweries (sakagura, sample)

```javascript
[
  "Asahi Shuzo",
  "Dassai",
  "Tatenokawa",
  "Born Brewery",
  "Hakkaisan",
  "Tedorigawa",
  "Kikusui",
  "Suehiro",
  "Tengumai",
  "Kamoizumi"
  // ... more in SAKE_SAKAGURA array
]
```

---

## 4. Derived / Computed Logic

### Course Status (Health)

**Rule:** Computed at course instantiation from:
1. Historical velocity (enrollment rate vs. 4-course median cohort over 18 months)
2. Current enrollment relative to `minStudents`
3. Course lifecycle phase

**Thresholds:**
- `in-traiettoria`: velocity ≥ median AND margin positive expected
- `monitor`: velocity near median OR limited history; 2-week observation window recommended
- `rischio`: velocity < median −43%; closure risk if enrolled < minStudents after observation
- `critico`: insufficient data OR very low enrollment relative to expectations

**Note:** In prototype, status is assigned at mock-data generation. In production, implement as server-side computation during `/api/courses` fetch.

### Course Revenue

```
revenue = enrolled × (price × 0.85)
// 0.85 factor accounts for typical discounts (EARLY50, FRIENDS20, etc.)
// Result rounded to nearest EUR
```

### Course Margin

```
margin = revenue - totalCost
// Rounded to nearest EUR
// Used in health assessment
```

### Student Aggregation (Corsista)

**Logic in `aggregateStudents()`:**

1. Iterate all courses and their students
2. Group by `email.toLowerCase()` (primary key)
3. For each email, collect:
   - Metadata (name, phone, hasWhatsApp, city, firstSeen)
   - Array of course enrollments
   - `totalSpent` sum
4. Append ~80 pre-2024 historical students (with `historical: true` flag)
5. Compute `isReturning = courses.length > 1`

### Exam Result Status

```javascript
if (score >= thresholds.pass)           // >= 0.80
  status = "passed"
else if (score >= thresholds.retrial)   // >= 0.70
  status = "retrial"
else
  status = "failed"
```

### Exam Scoring (per-question)

- Each question has `points` field (default 1; open questions 3, match/order 2)
- Total exam points = sum of all question points
- Score percentage = (earned points / total points) × 100

### Notification Computation (computeNotifications)

**Rule:** For each course with `lifecycle === "pubblicato"` or `"bozza"`:
- If `educator.id` NOT in `getQuals(educator.id)` for `course.type`
- Generate notification of kind `educator-mismatch`
- Tone: `danger`, icon: `warn`

```javascript
notification = {
  id: `qual-${course.id}`,
  kind: "educator-mismatch",
  title: "Educator non abilitato",
  body: `${educator.name} è assegnato a "${course.shortTitle}" ma non è abilitato a questa tipologia.`,
  email: educator.email,
  courseId: course.id
}
```

### Course Lifecycle Transitions

```
BOZZA → PUBBLICATO  (published, made live)
PUBBLICATO → PASSATO  (after course end date + some grace period)
ANY → ARCHIVIATO  (manual cancellation)
```

**Logic in prototype:** based on course date vs. current date and explicit `lifecycle` field. In production: implement state machine with guards.

### Mini-Test Progress (per day)

For each course day (1 to `course.days`):
1. Instantiate from template (MINI_NIHONSHU or MINI_SHOCHU)
2. Status: `pianificato` (scheduled) or `completato` (completed)
3. `avgScore`: populated if completed; null otherwise
4. `completion`: 0 (not done) or 100 (done)

### Exam Meta Date Calculation

```javascript
// Final exam ~1 week after course end
mIdx = MONTHS.indexOf(course.month)
examDate = new Date(course.year, mIdx, course.day + course.days + 7)
examDateLabel = `${DOW[examDate.getDay()]} ${examDate.getDate()} ${MONTHS[...].slice(0,3)} ${examDate.getFullYear()}`
examDayNo = course.days + 8  // relative day number
```

### KPI Computation (Dashboard)

**Computed from active courses (`lifecycle === "pubblicato"`):**

```javascript
KPI = {
  coursesActive: count of active courses,
  coursesAtRisk: count with status === "rischio" OR "critico",
  enrolledActive: sum of enrolled,
  revenueActive: sum of revenue,
  marginActive: sum of margin,
  studentsTotal: unique student count (Corsista),
  returningStudents: count with isReturning === true,
  examPassRate: 0.78  // hardcoded in prototype; compute from results in prod
}
```

---

## 5. External System Provenance

### Fields from Shopify (SSA Store)

| Field | Shopify Source |
|-------|---|
| `id` | Product ID (numeric, converted to string) |
| `handle` | Product handle (immutable, primary key) |
| `title` | Product title |
| `type` | Derived from handle via `parseCourseType()` |
| `students[].name`, `email`, `phone` | Order customer data |
| `students[].orderNumber` | Order ID / order number |
| `students[].orderDate` | Order created_at |
| `students[].amount`, `grossAmount` | Line item prices |
| `students[].discountCode` | Discount code applied |
| `educator` | Metafield or metaobject "Chi Siamo" |
| `revenue` | Computed from orders (enrolled count × price × 0.85) |
| `lifecycle` | Inferred from product status + date |

### Fields from Airtable

| Field | Airtable Source |
|-------|---|
| `costs` | Table `SSA_CourseConfig`, field `course_costs` (JSON) |
| `program` | Table `SSA_CourseConfig`, field `program` (JSON with sake list) |
| `notebook` | **New module** — will be persisted in `SSA_CourseConfig` |
| `whatsappLink` | Table `SSA_CourseConfig`, field `whatsappLink` |
| `shareLink` | Table `share_tokens` (auto-generated tokens) |
| `students[].registrationName`, `nameMismatch` | Table `tblmHWvzfar6Wf0hw` (QR registration) |
| MATERIAL_TEMPLATES | **New module** — will be stored in dedicated table |

### Fields from Twilio

| Field | Twilio Source |
|-------|---|
| `students[].hasWhatsApp` | Twilio Lookup v2 (`line_type_intelligence`) — background, non-blocking |

### Fields Derived / Generated (no external source)

| Field | Logic |
|-------|---|
| `typeLabel`, `typeShort`, `typeColor` | From `COURSE_TYPES[type]` |
| `shortTitle` | Templated from type and city |
| `mode` | Derived from city (if "Online" → `online`, else `presenza`) |
| `status` | Computed health rule |
| `statusLabel`, `statusTone` | From `STATUS_META[status]` |
| `students[].hasWhatsApp` | Twilio Lookup (cached or background) |
| `revenue`, `totalCost`, `margin` | Computed from enrolled × price, sum(costs) |
| `isReturning` | Computed: `courses.length > 1` |
| All exam fields | Generated from templates + mock data seeding |

---

## 6. Identifier Conventions

### Primary Keys

| Entity | Primary Key | Format | Example | Immutable |
|--------|---|---|---|---|
| Course | `handle` (Shopify) | slug | `corso-certificato-milano-maggio-2026-c01` | ✓ |
| Student (per-course) | `(course.id, email)` | compound | N/A | ✓ |
| Corsista (aggregate) | `email` | email | `marco.rossi@gmail.com` | ✓ |
| Educator | `id` | short code | `e1`, `e2` | ✓ |
| Exam | `(courseId)` | derived | N/A | — |
| ExamQuestion | `id` | question ID | `q01`, `c01-q1` | ✓ |
| ExamResult | `(courseId, email)` | compound | N/A | — |
| MaterialTemplate | `id` | template ID | `mtpl-1` | ✓ |
| User | `id` | username | `lorenzo`, `camilla` | ✓ |
| Notification | `id` | generated | `qual-c01` | ✓ |

### Foreign Keys

All foreign keys are **string references**; nullable or optional as indicated:

```
Student.courseId → Course.id
Exam.courseId → Course.id
ExamQuestion.cat → ExamCategory.id
ExamResult.courseId → Course.id
ExamResult.email → Student.email
Course.educator.id → Educator.id
Notification.courseId → Course.id
Notification.email → Educator.email (or User.email)
```

### String Keys for Lookups

```
COURSE_TYPES[courseType] → CourseType object
STATUS_META[courseStatus] → { label, tone }
NIHONSHU_CATS[...] → ExamCategory
SHOCHU_CATS[...] → ExamCategory
Educator.lang[...] → language code
```

---

## 7. Data Type & Constraint Summary

| Type | Validation | Examples |
|------|---|---|
| **enum** | Exact string match (case-sensitive) | `"certificato"`, `"passato"`, `"IT"` |
| **ISO 8601** | Timestamp with timezone | `"2026-05-30T14:30:00Z"` |
| **Slug** | Kebab-case, no spaces | `"corso-certificato-milano-maggio-2026-c01"` |
| **Number (EUR)** | Decimal, >= 0 | 590.00, 0, 1670.50 |
| **Number (percentage)** | 0–100 | 85, 0.80 (as decimal in thresholds) |
| **Email** | RFC 5322 (or simple check) | `marco.rossi@gmail.com` |
| **Phone** | +CC format | `"+39 338 123 4567"` |
| **Language code** | ISO 639-1 + "JA" | `"IT"`, `"EN"`, `"FR"`, `"JA"` |
| **Boolean** | true \| false | — |
| **Array** | Type-specific; nullable | `[...]` |
| **Object** | Nested structure; nullable | `{ key: value, ... }` |

---

## 8. Notes on Ambiguities & Gaps

### Identified Ambiguities

1. **Exam Scoring Edge Cases:**
   - Open-ended questions (`type: "open"`) require AI grading; no implementation in prototype. `aiKey` field hints at future AI integration (e.g., Claude API).
   - How to weight category scores if they contain different numbers of questions? Current implementation uses per-question weighting.

2. **Educator Qualification Persistence:**
   - Currently stored in localStorage (`ssa_quals`). In production, must decide: Airtable, Supabase table, or Shopify metafield?
   - No version history or audit trail for qualification changes.

3. **Course Status Computation:**
   - Prototype assigns status at mock-data generation. Real rule requires:
     - Access to 18-month historical cohort data (similar courses)
     - Enrollment velocity calculation
     - When to run computation (real-time, cached hourly, or on-demand)?

4. **Notification Delivery:**
   - Prototype only generates notifications (no email sending). Future: Resend integration, but recipient email/template/timing undefined.

5. **Mini-Test Daily State:**
   - Prototype marks mini-tests complete/incomplete arbitrarily. Real logic: how to track per-student completion? API endpoint needed.

6. **Exam Live Session:**
   - Only instantiated for one course (`c01`). Real implementation: how to handle concurrent exams? WebSocket for real-time updates?

7. **Material Template Cost Breakdown:**
   - `educatorPerDay`, `diplomaPerStudent`, etc. are stored in template, but course may override. Unclear: is cost override applied per-course, or does course always inherit from template?

8. **Historical Student Data:**
   - ~80 pre-2024 students are generated synthetically. In production: how to migrate/import historical data? Schema for legacy records?

9. **Locale & Internationalization:**
   - Only English locale visible in prototype UI. Italian (IT) and Japanese (JA) labels exist in question/report data. Full i18n strategy (routing, language persistence, RTL handling) undefined.

### Recommended Data Clarifications

1. Confirm **Exam question point weighting** and **category score calculation**.
2. Define **educator qualification storage** (Airtable vs. Supabase).
3. Specify **course health status computation frequency** and caching.
4. Clarify **notification recipient routing** (email vs. in-app vs. both) and Resend template IDs.
5. Decide on **mini-test tracking**: per-student or per-course aggregate?
6. Specify **exam system architecture** for concurrent sessions (WebSocket, polling, or batch results sync).
7. Confirm **material template cost application** (override strategy and persistence).
8. Define **historical data migration** schema and import process.

---

## 9. Summary

This specification documents **33 core entities** and their relationships, **11 enum families** with exact string values, and **6 major computed logic flows**. The domain model is **backend-agnostic** (suitable for Supabase, Postgres, or any REST API), fully **typed** (ready for TypeScript code generation), and traces all fields to their **external system sources** (Shopify, Airtable, Twilio) or derivation rules.

**Files generated:**
- `/Users/ferraboschi/Documents/sakeplatform/_reference/specs/domain-model.md` (this file)

**Next steps:**
1. Generate TypeScript interfaces from entity catalog (sections 1, 2)
2. Implement repository interfaces (CRUD operations, query filters, aggregations)
3. Define Supabase/Postgres schema mapping (PK → column, FK → foreign key constraint, enum → CHECK constraint)
4. Clarify ambiguities (section 8) with stakeholders before backend development

