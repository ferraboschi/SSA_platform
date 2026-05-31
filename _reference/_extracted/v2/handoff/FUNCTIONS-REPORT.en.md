# SSA Platform · Functions Report — Implementation Guide

> This is the main working document. It lists **every UI function** of the prototype with
> **description**, **status**, **priority**, **endpoint** and **implementation notes**.
> Read alongside the cards in `functions/` and `DATA-MODEL.md`. (Source of truth for
> behaviour/visuals is the prototype `v2/index.html`.)

## Legend

**Status**
- 🟢 **In prod** — already present in the production app (see `SSA-TECHNICAL-SUMMARY.md`).
- 🟡 **Partial** — exists in production but redesigned/extended in the prototype.
- 🔵 **New** — does not exist in production, must be built from scratch.

**Priority** — **P0** foundation/blocking · **P1** high · **P2** medium · **P3** low.

---

## 0 · Foundations & cross-cutting

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Design tokens | Brand palette, type (Inter + JetBrains Mono), shadows, spacing, easing | 🟡 | **P0** | — | `tokens.css`. Port as theme variables |
| UI component library | `Icon`, `Avatar`, `Badge`, `StatusBadge`, `KPI`, `PageHeader`, etc. | 🟡 | **P0** | — | `components.jsx`/`.css`. Base for everything |
| Multilingual IT/EN (then FR/JP) | String extraction + per-language dictionaries | 🔵 | **P1** | — | Reference pattern: `RP_T` in the exam report |
| Config persistence | Thresholds, qualifications, targets, planned courses, notebook | 🔵 | **P1** | new | Today `localStorage`; file+Airtable in prod |
| Auth & roles | Login, profiles (admin/manager), permissions | 🟡 | **P1** | `/auth/*` | Today basic user/pass via env |

---

## 1 · Shell & navigation (card `01`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Grouped sidebar | Menu (Dashboard/Catalogue/People/System) with counts | 🔵 | P1 | — | |
| Courses submenu | Published courses with meta `i:NN / d:NN`, collapsible | 🔵 | P2 | `/api/courses` | |
| Global search ⌘K | Multi-category (courses/students/educators/pages), keyboard | 🔵 | P1 | — | Client-side; consider an endpoint at scale |
| Notifications bell | "Educator not qualified" alert + email send | 🔵 | P2 | new + **Resend** | Email mocked |
| User profile switch | Switch admin/manager with permissions | 🔵 | P1 | `/auth/*` | |
| Connection status | Shopify/Airtable indicators | 🔵 | P3 | `/api/health` | Cosmetic |
| Breadcrumbs | Contextual crumbs per page | 🔵 | P2 | — | |

---

## 2 · Dashboard (card `02`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Hero + dynamic headline | Greeting, courses below threshold, open invoices | 🟡 | P1 | `/api/courses` | "3 invoices" is mock today |
| KPI row (4) | Active courses, enrolments, margin, exam pass % | 🟡 | P1 | `/api/courses` | |
| Operational reminders | Kit shipments, book stock, exam sake, other | 🔵 | P1 | new | Book stock = mock; needs inventory |
| Set thresholds | `shipDays`, `bookMin`, `sakeExamPct` | 🔵 | P2 | new (persist) | |
| 6-month pipeline | Per-month grid + per-course bars + rich tooltip | 🔵 | P2 | `/api/courses` | |
| Needs attention | Table of courses below threshold | 🟡 | P1 | `/api/courses` | |
| Latest enrolments | Recent enrolment feed | 🟢 | P2 | `/api/courses` | |
| Top educators | Ranking by courses/enrolments | 🟢 | P3 | `/api/educator-profiles` | |
| SSA community + insight | Totals, returning, certified | 🟡 | P3 | aggregation | "2.3×" insight is mock |
| Monthly report (modal) | Month KPIs + table + PDF export | 🔵 | P2 | `/api/courses` | PDF: `window.print()` today |

---

## 3 · Courses — catalogue + detail (card `03`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Lifecycle tabs | Published/Drafts/Archived/Past | 🟡 | P1 | `/api/courses` | |
| Filters + sorting | Type/city/educator + 10 sorts | 🟡 | P1 | `/api/courses` | |
| 3 catalogue views | Timeline / Grid / Table | 🟡 | P2 | — | |
| Course health rule | `status` computation + explicit legend | 🟡 | **P1** | server | Replicate the rule faithfully |
| New / Cancel course | External Shopify flows | 🟢 | P2 | Shopify | Courses originate on Shopify |
| Hero + actions | WhatsApp, educator share, Excel, **mark invoiced** | 🟢 | P1 | `/api/costs`, `/api/fatturato`, export | |
| Inline KPI + P&L | Enrolled/Revenue/Costs/Margin | 🟢 | P1 | `/api/costs/:id` | |
| Recommendation engine | Textual explanation of status (`reasoning`) | 🔵 | P2 | new | `notebook` to persist |
| Enrolled section | List + QR name mismatch + overrides | 🟢 | P1 | `/api/courses`, overrides, Twilio | |
| Sake programme | Day/sake editor, **drag&drop**, notes, tech sheet | 🟢 | **P1** | `/api/costs`, `/api/airtable/sake` | Richest part |
| Apply materials template | Library modal → inherit days/sake/costs | 🔵 | P2 | new | See card 06 |
| Exam section | Summary linking to Exams & tests | 🔵 | P2 | new | |

---

## 4 · Planner (card `04`) — all 🔵 New

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Rolling 12-month window | Scrolling calendar from current month | 🔵 | P2 | `/api/courses` | Logic in `pianificatore-core.js` |
| Targets | Intro/cert/cities/pass-rate/sommeliers vs target | 🔵 | P2 | new | |
| Add/move course | Click month + **drag&drop** across month/city/educator | 🔵 | P2 | new | Planned ≠ real until on Shopify |
| Scenario mode | Include planned in KPIs or not | 🔵 | P3 | — | |
| 5 views | Heatmap, Monthly, Bars by type, City×Month, Educator×Month | 🔵 | P2 | — | |
| Engagement panel | Load/days per educator | 🔵 | P3 | — | Uses qualifications |
| Signals panel | Date conflicts + cannibalisation (thresholds) | 🔵 | P3 | — | |
| YoY panel | Year-over-year comparison | 🔵 | P3 | — | |

---

## 5 · Exams & tests (card `05`) — all 🔵 New

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| List hub | Exams to do / done + KPIs | 🔵 | P1 | new | Only Certificato + Shochu |
| Course exam detail | Overview + tabs (mini-test/final/feedback/results) | 🔵 | P1 | new | |
| Question library/editor | 9 question types, per family, time estimate | 🔵 | P1 | new | |
| Daily mini-tests | One test per day | 🔵 | P2 | new | |
| Feedback | Unscored questionnaire, passwordless link | 🔵 | P2 | new | |
| Test/Feedback runner | Run (draft/open/closed) | 🔵 | P1 | new | |
| Live dashboard | Fullscreen, real-time progress | 🔵 | P2 | new (realtime) | Timer-simulated today |
| Student view | Device + language preview, question nav | 🔵 | P1 | new | ⚠️ **missing route** (see below) |
| Tri-lingual PDF report | IT/EN/JP, category breakdown, download + email | 🔵 | **P1** | new + PDF + **Resend** | i18n model (`RP_T`) |
| Export results | Excel + JSON answers/scores | 🔵 | P2 | new | |

---

## 6 · Materials templates (card `06`) — all 🔵 New

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Template library | Filterable list, uses, duplicate/delete/create | 🔵 | P2 | new | |
| Day + sake editor | Rename/add days, **drag&drop** sake, notes | 🔵 | P2 | new + `/api/airtable/sake` | |
| Materials/costs | educator/day, diplomas, books, extras | 🔵 | P2 | new | Feeds the course P&L |
| Apply to course | Inherit days/sake/costs | 🔵 | P2 | new | |

---

## 7 · Archive (card `07`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| KPIs + year chart | Stacked bars per year + average line | 🟡 | P2 | `/api/courses` | "Past" exists in prod |
| Filters + grouping | Year/city/educator/type | 🟡 | P2 | `/api/courses` | |
| Export archive | Export courses | 🟡 | P3 | export | |

---

## 8 · Students (card `08`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| List + filters + KPIs | Segments, results, search, spend | 🟡 | P1 | aggregation | |
| Export CSV | Customer export | 🟢 | P2 | `/api/export/corsisti` | |
| Dossier profile | Hero, stats, contacts | 🔵 | P2 | aggregation | |
| Journey timeline | Courses per year with result | 🔵 | P2 | — | Pre-2024 import to define |

---

## 9 · Educators (card `09`)

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| List + qualification filter | Cards with quals and stats | 🟡 | P2 | `/api/educator-profiles` | |
| Detail + KPIs + history | Hero, languages, upcoming/past | 🟢 | P2 | `/api/educator/:id` | |
| Qualifications | Toggle assignable course types | 🔵 | P1 | new (persist) | Drives Planner + Notifications |

---

## 10 · Account (card `10`) — all 🔵 New

| Function | Description | Status | Pri | Endpoint | Notes |
|---|---|---|---|---|---|
| Profile + photo | Personal data, photo upload | 🔵 | P2 | new + storage | |
| Change password | With confirmation | 🔵 | P2 | `/auth/*` | |
| Session / switch / roles | Active profiles, permissions | 🔵 | P1 | `/auth/*` | |

---

## ⚠️ To highlight (known issues & decisions)

1. **Missing `esame-studente` route.** The "Student view" button
   (`page-esame-section.jsx`) points to `#/esame-studente/:id`, but `shell.jsx` doesn't
   handle that branch → falls back to Dashboard. `V2_PageEsameStudente` exists and is
   loaded. **Deliberately not fixed** (requirement: don't touch the functions). Wire it up
   during implementation.
2. **`Field` defined inside render** (`page-account.jsx` and similar modals) → in React
   this remounts the input on every keystroke (focus loss). Extract it out of the parent.
3. **Duplicated time-estimate logic** (`ES_EST_SEC` in `page-esame-section.jsx` vs
   `EX_EST` in `page-esami.jsx`). Consolidate into one utility.
4. **Email (Resend) and WhatsApp** are mocked. Notifications and report/feedback delivery
   assume Resend as a future integration.
5. **Many numbers are hardcoded mocks** (dashboard: "3 invoices", "78%", "+18%" delta,
   "2.3×" insight; book stock): wire to real data.
6. **Structural i18n** in the exam report and student view (IT/EN/JP already planned):
   start there to generalise the translation system.
7. **Cleanup already done at handoff:** removed 3 dead project versions (`src/`, root
   `.jsx`, `SSA Platform.html`) and the obsolete `v2/pages/` folder; removed verified
   internal dead code (never-read variables/exports) without touching the functions.
