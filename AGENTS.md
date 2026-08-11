<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SSA Platform — guida per agenti e sviluppatori

Piattaforma gestionale della Sake Sommelier Association: corsi, corsisti, esami,
economics. **LIVE** su https://platform.sakesommelierassociation.it (Render, che
auto-deploya `main` dopo CI verde) + Supabase (DB prod) + Shopify (vendite) +
Airtable (costi) + Resend (email). Operativa: dati e utenti sono REALI.

## Architettura in 60 secondi

- `src/app/(app)/…` — pagine interne autenticate (dashboard, corsi, corsisti,
  crediti, anomalie, conto-economico, pagamenti, esami…).
- `src/app/esame/[token]` — runner d'esame PUBBLICO (token-based, niente login).
- `src/lib/data/supabase/` — repository + mapper (unica via di lettura dominio).
- `src/lib/sync/` — sync Shopify→piattaforma (vedi sotto).
- `src/lib/economics/revenue.ts` — LA regola del denaro (leaf module, testato).
- `src/lib/anomalie/rules.ts` — rilevamento discrepanze (puro, testato).
- `supabase/migrations/` — schema versionato; vedi `docs/runbook.md`.

## Le regole che NON si violano

1. **Denaro = netto incassato, contato una volta.**
   `netPaidCents = max(amount_cents − discount_cents, 0)`, conta solo se
   `isPaidRevenue(financial_status)`. Mai sommare il lordo; mai sommare un corso
   sia da `corsi_iscrizioni` sia da `purchases` (cluster `corso` vive nelle
   iscrizioni). Ogni lettura passa da `src/lib/economics/revenue.ts`.
2. **`annullata_at` si esclude OVUNQUE.** Un posto rimosso (rimborso/credito/
   trasferimento) resta nel DB per audit ma è fuori da roster, ricavi, statistiche,
   esami, anomalie, spesa per-persona. Ogni nuovo lettore di `corsi_iscrizioni`
   DEVE filtrarlo (è il bug più recidivo del progetto).
3. **Mai buttare dati.** Niente hard-delete di iscrizioni/corsisti/ordini: si
   marca (`annullata_at`, `merged_into`, lifecycle) e si nasconde dalle liste.
4. **Nessun dato scartato in silenzio.** Se il sync non può interpretare qualcosa
   lo REGISTRA (`skippedProducts` → pannello "Corsi non importati" + "Salute
   sistema" in dashboard). Ogni nuova pipeline deve seguire lo stesso principio.
5. **I gate si ri-verificano.** Un controllo fatto al mint di un link (presenza,
   conferma email) va rifatto a open e submit: lo stato può cambiare dopo.
6. **Mai loggare segreti** (token, API key) — i log Render persistono. Solo
   identificatori/scope.
7. **Niente riscritture unilaterali della logica finanziaria.** Le policy sul
   denaro (valore crediti, riconoscimento ricavi) le decide l'owner: segnalare
   e chiedere, poi implementare.

## Sync Shopify → piattaforma (una direzione sola)

- **Scheduler in-app** ogni 15' (`src/lib/sync/scheduler.ts`, avviato da
  `src/instrumentation.ts` in prod). Il pulsante ⟳ fa lo stesso sync
  INCREMENTALE (solo ordini aggiornati dopo il watermark `sync_state`).
- Il sync è **auto-riparante**: i corsi importati in ritardo ricevono le
  iscrizioni dai dati già in `purchases` (`backfillMissedEnrollments`, corsi
  ended con roster 0). Non servono (e non vanno aggiunti) pulsanti "full sync".
- Parser titoli corsi: `src/lib/sync/course-title.ts` (PURO, testato coi titoli
  reali). Anni accettati: 2024+ (pre-2024 = import storico, non duplicare).
  Se cambi il parser, aggiorna i test con i titoli veri.
- Ogni fetch Shopify ha timeout 30s + retry; il run ha un tetto di 9' — un sync
  non può restare appeso. Stato del run in `settings_kv:sync_run_status`.
- La piattaforma NON scrive mai su Shopify (inventario incluso): capienza e
  posti si riallineano a mano, guidati dai promemoria in UI.

## Disciplina pre-deploy (obbligatoria)

Render deploya `main` in produzione. Prima di OGNI push:

1. `npx tsc --noEmit` — zero errori.
2. `SYNC_CRON_DISABLED=1 npx vitest run` — tutti verdi (500+).
3. `SYNC_CRON_DISABLED=1 npx next build` — build pulita.
4. Review avversariale: `Workflow({scriptPath: ".claude/workflows/pre-deploy-review.js"})`
   — si committa solo con 0 blocker.
5. Dopo il deploy: **verificare dal vivo** la modifica sulla piattaforma (non
   fidarsi del solo ragionamento; per la UI misurare, screenshot/JS).

La CI (`.github/workflows/ci.yml`) ripete 1-3 su GitHub: se è rossa, il deploy
non parte. Non è un sostituto della disciplina locale — è la rete di sicurezza.

## Migration & dati

- Nuove migration in `supabase/migrations/` (timestamp + nome parlante), sempre
  con degrado grazioso nel codice (il prod può essere indietro di una migration).
- Le migration le ESEGUE L'OWNER sul SQL editor Supabase; registro e procedura
  in `docs/runbook.md`. Mai dare per applicata una migration senza verificarla
  (probe della colonna/tabella).
- Query dirette al DB prod: SOLO letture per debug. Scritture manuali solo su
  richiesta esplicita dell'owner, mai distruttive.

## UI

- Token di design della piattaforma (`--indigo`, `--success/--warning/--danger`,
  `.badge`, `.card`) — niente esadecimali improvvisati; un colore = un solo
  significato (verde = confermato).
- Niente layout shift: azioni su righe proprie, messaggi accanto, non sopra.
- Le sezioni larghe scorrono nel PROPRIO contenitore (`overflow-x: auto`), mai
  la pagina intera. Verificare le pagine responsive a 390/768/1280.
- Lingue: it (default), en, ja dove previsto (`src/lib/i18n/`); il pubblico
  esame segue la lingua del link/esame.

## Convenzioni tecniche

### Data-fetching & caching
- **Letture condivise non-utente** (catalogo/ricerca/aggregati uguali per tutti)
  → `unstable_cache` con chiave esplicita **e tag**, come `getShellData`
  (`src/lib/shell-data.ts`). Revalidare il tag dopo un sync/merge. **Bump della
  chiave (`…-v2`)** quando cambia la *forma* dell'oggetto cacheato.
- **Letture per-utente** (dipendono da sessione/cookie) → NON cacheare.
- **Mutazioni** (`"use server"`) → mai in `unstable_cache`; dopo la scrittura
  chiamare `revalidatePath`/`revalidateTag`.

### Mesi italiani
Unica fonte: `src/lib/dates/italian-months.ts` (`MONTH_NAMES_IT`,
`MONTH_TO_NUM`, `monthIndexIt`, `parseItDate`). Non ridefinire mappe locali.

### URL esterni & secrets
- Base URL dei provider env-overridabili con fallback reale (`ANTHROPIC_API_URL`,
  `OPENAI_API_URL`, `RESEND_API_URL`, `AIRTABLE_API_URL`) — non impostarle.
- Link admin Shopify via `shopifyAdminProductsUrl()` / `shopifyAdminProductUrl()`
  (`src/lib/integrations/shopify/admin-url.ts`), slug configurabile con
  `NEXT_PUBLIC_SHOPIFY_STORE_SLUG`.
