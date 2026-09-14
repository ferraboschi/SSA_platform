# Runbook operativo — SSA Platform

Procedura per gestire produzione, migration, segreti, backup ed emergenze.
Pubblico: owner (Lorenzo) + chiunque metta mano alla piattaforma.
Aggiornato: 2026-08-11.

## 1. Deploy e rollback

- **Deploy**: push su `main` → GitHub Actions esegue la CI
  (`.github/workflows/ci.yml`: typecheck + lint + test + build) → Render
  auto-deploya. Con "Wait for CI" attivo su Render, una CI rossa **blocca** il
  deploy.
- **Stato deploy**: Render dashboard → servizio `SSA_platform` → Events.
- **ROLLBACK** (torna alla versione precedente in ~1 minuto):
  Render → `SSA_platform` → Events → trova l'ultimo deploy buono → **Rollback**.
  Non serve toccare git. Poi si indaga con calma.
- Il deploy NON tocca il database: rollback del codice ≠ rollback dei dati.

## 2. Disciplina pre-push (locale)

Obbligatoria anche con la CI attiva (la CI è la rete, non il trapezista):

```bash
npx tsc --noEmit
SYNC_CRON_DISABLED=1 npx vitest run
SYNC_CRON_DISABLED=1 npx next build
```

più la review avversariale (`.claude/workflows/pre-deploy-review.js`, 0 blocker)
e la **verifica dal vivo** post-deploy. Dettagli in `AGENTS.md`.

## 3. Migration del database

**Chi**: solo l'owner. **Dove**: Supabase dashboard → SQL editor (prod).

Procedura per una nuova migration:
1. Il file nasce in `supabase/migrations/AAAAMMGGHHMMSS_nome.sql` (nel repo, via PR).
2. Il codice che la usa DEVE degradare con grazia se la migration non è ancora
   applicata (try/catch o select-with-fallback) — il deploy arriva sempre prima.
3. L'owner esegue il contenuto del file nel SQL editor.
4. **Verifica**: interrogare la colonna/tabella appena creata (una select basta).
   Mai considerare applicata una migration non verificata.

**Stato attuale (verificato con probe REST l'11/8/2026)**: tutte le 35 migration
in `supabase/migrations/` risultano applicate al prod — incluse le più recenti
(`annullata_at`/`annullata_tipo`, `corsi_crediti` + `codice`,
`corsi_partecipanti`, `corsi_presenze`, `product_handle`, `seat_index`,
`exam_score_pct`).

**`20260913160000_profiles_least_privilege.sql` — APPLICATA il 14/9/2026**
(verifica owner: `column_default = 'guest'::text`): il ruolo di default dei
nuovi utenti auth è `guest` e il trigger lo scrive esplicitamente. Lo stesso
giorno la registrazione pubblica è stata disattivata (sez. 4-bis, verificato
`disable_signup = true`). Nessuna migration pendente.

### 4-bis. Blocco della registrazione pubblica (AZIONE OWNER, urgente)

La piattaforma non registra mai utenti da sola: gli account staff nascono
SOLO dagli inviti. Su Supabase però la registrazione self-service era attiva
(`/auth/v1/settings` → `disable_signup: false`, verificato il 13/9/2026) e,
prima della migration qui sopra, ogni nuovo utente auth nasceva `manager`.
Procedura: Supabase dashboard → Authentication → Providers → Email →
**"Allow new users to sign up" = OFF** (e nessun provider OAuth attivo).
Il chip "Registrazione pubblica" in dashboard resta ⚠ finché è attiva.
Stato: **OFF dal 14/9/2026** (probe `disable_signup = true`).

## 4. Segreti e variabili d'ambiente

**Dove vivono**: Render → `SSA_platform` → Environment (prod);
`.env.local` (solo sviluppo, MAI committato — è in `.gitignore`).

Inventario (nomi, mai valori):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — DB. La service key bypassa la RLS: è il
  segreto più critico.
- `SHOPIFY_*` (admin token, store domain) — vendite.
- `ANTHROPIC_API_KEY` — AI (correzione esami, sintesi).
- `EMBEDDINGS_API_KEY` (+ `EMBEDDINGS_MODEL`) — account OpenAI usato SOLO per gli
  embeddings della knowledge base: senza crediti sull'account OpenAI la
  correzione AI delle risposte aperte si ferma (429 `insufficient_quota`).
  Controllare il saldo su platform.openai.com → Billing prima di ogni sessione
  d'esame; il chip "Correzione AI" in dashboard lo segnala.
- `RESEND_API_KEY` — email (mittente solo su `mail.sakesommelierassociation.it`).
- `AIRTABLE_*` — costi sake.
- `SYNC_SECRET` — protegge `/api/sync/shopify` (endpoint esterno).
- `EXAM_LINK_SECRET` — firma i token dei link ESAME (`/esame/[token]`).
  Se manca, il codice ripiega su `SYNC_SECRET` (che viaggia nelle query
  string) e poi su una costante di sviluppo pubblica → link falsificabili.
  DEVE essere impostato su Render, distinto da `SYNC_SECRET`.
- `SHARE_LINK_SECRET` — firma i token dei link di CONDIVISIONE educator
  (`/condividi/[token]`, conferme). Stessa catena di fallback: va impostato.
  Il chip "Segreti link" in dashboard segnala i mancanti.
- `KB_GITHUB_TOKEN` — sync knowledge base dal repo wiki.

Regole:
- Rotazione: se un segreto finisce in un log, in una chat o in un dubbio →
  si rigenera dal provider e si aggiorna su Render. Prevedere una rotazione
  completa PRIMA del lancio di settembre.
- Mai loggare segreti (i log Render persistono). Mai committarli: in caso di
  commit accidentale, il segreto è DA CONSIDERARSI COMPROMESSO anche dopo il
  revert → rotazione immediata.

## 5. Backup e ripristino dati

- **Supabase Pro**: backup automatici giornalieri (retention 7 giorni) su
  dashboard → Database → Backups. Da lì si può ripristinare l'intero progetto
  a un backup precedente.
- **⚠️ AZIONE OWNER (una volta, prima del lancio)**: provare un restore su un
  progetto Supabase di test (Restore → new project) per verificare che i backup
  siano davvero utilizzabili. Un backup mai testato non è un backup.
- Errori di dati chirurgici (una riga sbagliata): mai hard-delete; correggere
  con update mirati e tracciati (il modello dati è mark-and-hide, vedi
  `AGENTS.md`).

## 6. Sync Shopify — operatività

- Automatico ogni 15' (scheduler in-app); ⟳ nella topbar = stesso sync a
  richiesta. "Nessuna modifica" = ha girato e non c'era nulla di nuovo (non è
  un errore).
- Stato: card **"Salute sistema"** in dashboard (freschezza sync, corsi non
  importati, duplicati, anomalie contabili). Marker tecnico:
  `settings_kv:sync_run_status`; watermark: `sync_state.last_synced_at`.
- Un prodotto Shopify non interpretabile NON sparisce: finisce nel pannello
  **"Corsi non importati"** su /corsi con il motivo e il link per correggerlo
  alla fonte (titolo: tipo + mese + anno).
- Il sync è auto-riparante (corsi importati in ritardo recuperano le iscrizioni
  al giro successivo). Non esistono e non servono pulsanti "sync totale".
- `SYNC_CRON_DISABLED=1` spegne lo scheduler (usato nei test/build; NON deve
  mai stare su Render).

## 7. Emergenze

| Sintomo | Azione |
|---|---|
| Piattaforma giù / errori 500 diffusi | Render → Events: se coincide con un deploy → **Rollback** (sez. 1). Altrimenti → Render status + Supabase status. |
| Sync fermo (card "Salute sistema" ⚠ oltre 30') | Riprova con ⟳; se persiste, Render → Logs, cerca `[sync-cron]` / `[shopify-sync]`. Il run ha un tetto di 9': non può restare appeso — se "running" da più di 10' è un bug nuovo, aprire indagine. |
| Dati sbagliati in massa dopo un sync | NON riscrivere a mano: identificare il bug, fixare il codice (il sync è idempotente e auto-riparante), rilanciare. Nel peggior caso: restore backup (sez. 5). |
| Segreto compromesso | Rotazione immediata dal provider + aggiornamento su Render (sez. 4). |
| Corso pubblicato ma invisibile | /corsi → pannello "Corsi non importati" → il motivo è scritto lì. |
| Chip "Correzione AI" ⚠ in dashboard (risposte aperte "valutazione non riuscita") | "crediti OpenAI esauriti" → ricaricare il saldo OpenAI (Billing), il chip torna verde entro 10'. Nel frattempo gli esiti NON restano bloccati: nella tab Esiti, risposta per risposta, l'educator assegna il **Voto educator (1-5)** — stessa scala e stessi punti dell'AI — e i pulsanti di conferma si sbloccano. |

## 8. Contesto architetturale

`AGENTS.md` (radice del repo) è la mappa: architettura, regole del denaro,
regola `annullata_at`, disciplina pre-deploy. Ogni nuova sessione di lavoro
(umana o AI) parte da lì.
