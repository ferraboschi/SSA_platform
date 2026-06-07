# PWA — app installabile + notifiche push (impianto pronto)

Questo branch (`feature/pwa`) prepara l'infrastruttura per trasformare la
piattaforma in **app installabile** (senza store) con **notifiche push**.
**Non è attivo in produzione** finché il branch non viene unito a `main`.

## Cosa c'è già

- **Manifest** — `public/manifest.webmanifest` (nome, icone, tema, standalone).
- **Icone** — `public/icons/` (192, 512, 512-maskable, apple-touch 180), generate
  da `public/ssa-logo.png`.
- **Service worker** — `public/sw.js`. Volutamente **senza cache aggressiva** dei
  chunk (per non riportare i problemi di "pagina non caricata" post-deploy):
  solo installabilità, una pagina **offline** (`public/offline.html`) e la
  gestione delle **push** (mostra notifica + click).
- **Registrazione SW** — `ServiceWorkerRegister` montato in `src/app/(app)/layout.tsx`.
- **Installa app** — `InstallAppButton` (Android/Chrome: un tap; iOS: istruzioni
  Aggiungi-a-Home). In **Account → App e notifiche**.
- **Attiva notifiche** — `EnablePushButton` (permesso + iscrizione push). In
  **Account → App e notifiche**.
- **Backend push** — `src/lib/push/` (store su `settings_kv`, invio via `web-push`,
  azioni di iscrizione). Helper: `sendPushToUser(userId, payload)` /
  `sendPushToAll(payload)` da agganciare agli eventi del centro notifiche.
- **Test** — `GET /api/push/test` (admin o `?secret=SYNC_SECRET`) invia una push
  di prova a tutte le iscrizioni.
- **Metadata** — manifest, theme-color, apple-web-app in `src/app/layout.tsx`.

## Come attivarlo (quando il debug è finito)

1. **Genera le chiavi VAPID** (una volta):
   ```
   node scripts/generate-vapid.mjs
   ```
2. **Imposta le env su Render** (Environment):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = chiave pubblica
   - `VAPID_PRIVATE_KEY` = chiave privata (**segreta**)
   - `VAPID_SUBJECT` = `mailto:corsi@sakesommelierassociation.it`
3. **Unisci il branch**: `feature/pwa` → `main` (deploy automatico).
4. **Verifica installazione**:
   - Android/Chrome: appare "Installa l'app" (o il prompt del browser).
   - iPhone/Safari: Account → "Installa l'app" → Aggiungi a Home; poi riapri
     l'app dall'icona.
5. **Verifica notifiche**: in Account → "Attiva notifiche" (concedi il permesso),
   poi apri `/api/push/test` (da admin) → deve arrivare la notifica di prova.
6. **Aggancia gli eventi reali**: chiama `sendPushToUser(...)` dove oggi parte una
   notifica/email (allerte stock, esiti esame, corso da fatturare, ecc.).

## Note importanti

- **iOS**: le push funzionano solo dopo "Aggiungi a Home" (da iOS 16.4) — non sulla
  scheda Safari. Il pulsante guida l'utente.
- **Sicurezza/scoping**: questo impianto è per le notifiche. La **vista educator
  con dati ristretti** è il passo successivo (separato) e va costruita con cura
  (RLS / filtri server per `educator_id`).
- Il service worker **non fa cache dei chunk**: nessun rischio di pagine stantie.
