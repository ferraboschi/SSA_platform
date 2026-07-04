# KB da GitHub — sincronizzazione del wiki sake

## Cosa fa

Il pulsante **«Aggiorna KB da GitHub»** nella pagina **/esami** legge il wiki
Obsidian sul repository privato `ferraboschi/obsidian-sake` e lo indicizza
nella knowledge base usata dalla correzione AI degli esami (tabelle
`rag_documents` + `rag_chunks` su Supabase, embeddings OpenAI).

Per ogni nota `.md` nelle cartelle configurate (default: solo `Concetti/`):

- rimuove frontmatter, wikilink `[[…]]`, embed `![[…]]` e immagini (resta il testo pulito);
- la **sezione** (colonna `family`, usata per limitare il retrieval per capitolo)
  viene dal campo `section:` nel frontmatter, altrimenti dalla cartella di
  primo livello (`Concetti/` → `concetti`; file nella root → `generale`);
- file più grandi di 200 KB o con meno di 80 caratteri di testo utile vengono saltati.

> **Migration richiesta per le sezioni**: finché la migration
> `20260704060000_rag_documents_family_sections.sql` non viene eseguita su
> Supabase, il database accetta solo le famiglie storiche e la sync ripiega su
> `generale` (la sezione vera resta in `metadata.section`, quindi non si perde
> nulla). Dopo la migration basta ripremere «Aggiorna KB da GitHub» e i
> documenti vengono riscritti con la loro sezione reale. Nel frattempo la
> correzione AI funziona comunque: il retrieval senza filtro copre tutto il
> corpus.

Ogni sincronizzazione **sostituisce** i documenti GitHub precedenti (fonte
`github:…`). **Il corpus esistente ingerito da Dropbox (dispensa, libro,
glossario) non viene mai toccato.** L'esito dell'ultima sincronizzazione è
salvato in `settings_kv` (chiave `kb-sync-log`) e mostrato sotto il pulsante.

## Variabili d'ambiente (Render)

| Variabile | Obbligatoria | Default | Note |
| --- | --- | --- | --- |
| `KB_GITHUB_TOKEN` | **sì** | — | Fine-grained PAT GitHub: **solo** repository `obsidian-sake`, permesso **Contents: Read-only**. Nient'altro. |
| `KB_GITHUB_REPO` | no | `ferraboschi/obsidian-sake` | |
| `KB_GITHUB_BRANCH` | no | `main` | |
| `KB_GITHUB_PATHS` | no | `Concetti` | Prefissi separati da virgola (cartelle o file esatti), es. `Concetti,Schede prodotto`. |

Serve anche `EMBEDDINGS_API_KEY` (già configurata per la correzione esami):
senza chiave la sincronizzazione **si rifiuta di partire**, per non scrivere
vettori di test incompatibili con il corpus.

## Come creare il token

GitHub → Settings → Developer settings → Fine-grained personal access tokens →
Generate new token → Repository access: *Only select repositories* →
`obsidian-sake` → Permissions → Contents: **Read-only** → Generate.
Copiare il valore in `KB_GITHUB_TOKEN` su Render (Environment).

## Uso

1. Aggiorna il wiki in Obsidian (la cartella `Concetti/` è quella indicizzata).
2. Aspetta il push automatico su GitHub (obsidian-git).
3. Su **/esami** premi **«Aggiorna KB da GitHub»** (solo admin/manager).
4. La riga sotto il pulsante conferma: `KB aggiornata: N documenti, M frammenti`.
