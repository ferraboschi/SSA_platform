# Checklist di verifica — Accesso esami con email verificata

> Da eseguire a fine sviluppo (2026-07-02). Ordine: prima la **Parte A** (una volta sola),
> poi la **Parte B** (la prova end-to-end, ~20 minuti), infine la **Parte C** (go-live, quando decidi tu).
> Tutto funziona in "modalità test" senza rischi: **nessuna email parte verso studenti reali**
> finché `EXAM_RESULT_EMAILS_LIVE` non è `true` (Parte C).

---

## Parte A — Prerequisiti (una volta sola)

### A1. Migrazioni Supabase da eseguire (SQL editor, in quest'ordine)

- [ ] `20260701160000_corsi_lifecycle_cancelled.sql`
- [ ] `20260701170000_corsi_presenze.sql`
- [ ] `20260701180000_corsi_product_handle.sql` (poi serve 1 sync Shopify per il backfill)
- [ ] `20260701190000_corsi_partecipanti.sql`
- [ ] `20260701200000_corsi_crediti.sql`
- [ ] `20260702120000_corsi_crediti_codice.sql`
- [ ] `20260702130000_corsi_crediti_shopify_discount.sql`
- [ ] `20260702140000_attendee_email_confirmation.sql` ← **quella nuova, indispensabile per questa verifica**
- [ ] (verifica) `20260604120000_exam_student_links.sql` e `20260608120000_exam_sessions.sql`
      dovrebbero già essere applicate — se non lo sono, applicale.

Come: Supabase → SQL Editor → incolla il contenuto del file → Run. Sono tutte
idempotenti (ri-eseguirle non fa danni).

### A2. Variabili d'ambiente su Render (verifica, non modifica)

- [ ] `EXAM_LINK_SECRET` presente (controllo rapido: `/api/health` → `examLinkSecret: true`).
- [ ] `EXAM_RESULT_EMAILS_LIVE` **assente o `false`** (deve restare così fino alla Parte C).
- [ ] `RESEND_API_KEY` presente (le email di prova arrivano a te).

---

## Parte B — Prova end-to-end (modalità test, nessuno studente coinvolto)

Usa un corso Certificato o Shochu **pubblicato** con iscritti reali (o un corso di prova).

### B1. Sanificazione email all'appello

- [ ] Piattaforma → corso → **Condividi con educator** → apri il link generato.
- [ ] Nella sezione **Appello**: ogni persona ha il **pallino email** (🟡 = in attesa).
- [ ] Clicca **Correggi** su una persona → cambia l'email (es. la tua) → Salva.
- [ ] Clicca **Invia conferma** → in modalità test NON parte nessuna email:
      appare il **link da copiare** → clicca **Copia link**.
- [ ] Apri il link copiato (è la pagina `/conferma/...` che vedrebbe lo studente):
      nome e telefono precompilati, email modificabile → **Conferma i miei dati**.
- [ ] Ricarica la pagina educator → il pallino di quella persona è **🟢 verde**.

### B2. Biglietto doppio (se il corso ne ha uno)

- [ ] Sulla riga del compratore con 2+ biglietti: **+ Aggiungi partecipante** → nome/telefono.
- [ ] Il partecipante ha la sua riga con pallino email → **Correggi** → inserisci un'email
      → **Invia conferma** → copia link → conferma come sopra → pallino verde.

### B3. Pannello Esami — invio link personali

- [ ] Sezione **Esami · link per gli studenti**: vedi le sotto-schede
      (Test giorno 1/2/3 · Feedback · Esame finale — solo quelle con domande configurate).
- [ ] Seleziona un test → **Durata link**: lascia "Fine giornata".
- [ ] Su uno studente clicca **Invia** → in modalità test appare il link → **Copia link**.
- [ ] Apri il link (finestra in incognito = sei lo studente): il test si apre **subito**,
      senza scegliere il nome da una lista. Rispondi a un paio di domande.
- [ ] Ricarica la pagina a metà test → le risposte **riprendono da dove eri**.
- [ ] Completa e invia → schermata di ringraziamento.
- [ ] Piattaforma → corso → tab **Esiti**: l'esito è arrivato, **col nome giusto**
      (la persona a cui hai inviato il link — non un'altra).

### B4. Link generale + gate email

- [ ] Nel pannello Esami → **Link generale** → Copia → apri in incognito.
- [ ] Chiede l'**email**: inserisci un'email NON iscritta → rifiutata (messaggio generico).
- [ ] Inserisci l'email **confermata** al punto B1 → entra e apre il test di quella persona.
- [ ] (contro-prova) Un'email di un iscritto che NON ha confermato → rifiutata.

### B5. Ciclo di vita link

- [ ] Nel pannello Esami, sul test usato: **Chiudi per tutti** → banner rosso "Test chiuso".
- [ ] Riapri il link personale copiato al B3 (incognito) → "Questo test è stato chiuso".
- [ ] Anche il link generale → rifiutato.
- [ ] Clicca **Invia** di nuovo su uno studente → il **nuovo** link funziona (la chiusura
      vale per i link vecchi; un re-invio riapre solo per chi re-inviti).
- [ ] **Riapri** → i vecchi link tornano validi (se non scaduti).

### B6. Regressione veloce (5 minuti)

- [ ] Menu: "Esami" sta in **Sistema**; in **Catalogo** ci sono le due librerie.
- [ ] Il corso attivo nel menu di sinistra si espande con Persone/Programma/Esame.
- [ ] Crediti: sezioni Attivi/Utilizzati, codici visibili, link al corso di destinazione.
- [ ] `/api/health`: `canWriteDiscounts: true`, `shopifySsa: true`, rag ok.
- [ ] Un'anteprima esame ("Anteprima" dal pannello interno) funziona come prima.

---

## Parte C — Go-live email (quando decidi tu, NON prima di aver finito la B)

- [ ] Render → Environment → `EXAM_RESULT_EMAILS_LIVE=true` → redeploy.
- [ ] Rifai B1 "Invia conferma" su una persona **con la TUA email**: ora l'email
      **arriva davvero** nella casella (mittente `no-reply@mail.sakesommelierassociation.it`).
- [ ] Rifai B3 "Invia" su te stesso: arriva l'email col link personale del test.
- [ ] Solo a questo punto il flusso è attivo per gli studenti veri.
- [ ] ATTENZIONE: questo stesso flag attiva anche le **email degli esiti** agli studenti
      (era la voce rimasta dal launch-audit) — decidilo consapevolmente.

---

## Limiti noti (non bloccano il lancio, decidere in seguito)

1. **Accompagnatori (doppio) ed esame**: hanno appello ed email confermata, ma non possono
   ancora ricevere un **link d'esame personale** (l'esito si lega solo a un corsista).
   Se un accompagnatore deve sostenere l'esame, per ora va iscritto come corsista.
2. **Il link "Condividi con educator" scade** (TTL breve, contiene il roster): per l'esame
   del **giorno 7** la segreteria deve **rigenerare** il link educator quel giorno.
3. **Chiusura ≠ spunta automatica**: chiudere un test non genera ancora automaticamente
   il "completato" per chi non ha consegnato (annotato come rifinitura futura).
4. **Stage 3 non iniziato**: dati QR completi su `/conferma` (indirizzo di consegna con
   **API Google Places** + eventuale ripubblicazione su Airtable). Prerequisito TUO:
   creare la chiave API Google (Places/Address Validation) — poi lo sviluppo riprende.
5. Rate-limit in-memory per istanza (noto da prima): su multi-istanza è best-effort.
