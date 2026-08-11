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
`exam_score_pct`). Nessuna pendente.

## 4. Segreti e variabili d'ambiente

**Dove vivono**: Render → `SSA_platform` → Environment (prod);
`.env.local` (solo sviluppo, MAI committato — è in `.gitignore`).

Inventario (nomi, mai valori):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — DB. La service key bypassa la RLS: è il
  segreto più critico.
- `SHOPIFY_*` (admin token, store domain) — vendite.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — AI (correzione esami, sintesi).
- `RESEND_API_KEY` — email (mittente solo su `mail.sakesommelierassociation.it`).
- `AIRTABLE_*` — costi sake.
- `SYNC_SECRET` — protegge `/api/sync/shopify` (endpoint esterno).
- `SHARE_LINK_SECRET` — firma i token dei link esame/condivisione.
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

## 8. Contesto architetturale

`AGENTS.md` (radice del repo) è la mappa: architettura, regole del denaro,
regola `annullata_at`, disciplina pre-deploy. Ogni nuova sessione di lavoro
(umana o AI) parte da lì.
