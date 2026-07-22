# Audit fissi (workflow riutilizzabili)

Reti di verifica multi-agente **riutilizzabili** per i sottosistemi più bug-prone
della piattaforma esami. Sono state estratte dagli audit ad-hoc del 22/07/2026 —
lo stesso schema che ha intercettato **2 blocker reali** (perdita dati silenziosa
+ una race) *prima* che andassero in produzione.

## Come si lanciano

Non sono richiamabili per nome (solo i workflow built-in lo sono). Si eseguono
via `scriptPath` — chiedi a Claude, oppure fallo tu in una sessione Claude Code:

```
Workflow({ scriptPath: "/Users/ferraboschi/Documents/sakeplatform/.claude/workflows/<file>.js" })
```

Girano in background e notificano al termine; l'esito è strutturato
(blocker/nit, matrice, verdetto). Alcuni accettano `args` (vedi sotto).

## I workflow

| File | Quando | Cosa fa |
|---|---|---|
| **pre-deploy-review.js** | PRIMA di ogni push/deploy | Review avversaria del diff di branch (`origin/main...HEAD`). 3 dimensioni (correttezza/regressioni, percorso critico esame, sicurezza/dati) + verifica avversaria di ogni blocker. Ritorna `confirmedBlockers` — se non vuoto, **non deployare**. |
| **exam-link-audit.js** | Dopo modifiche a link/permessi/chiusura/consegna | Mappa la matrice completa degli stati dei link (presente/assente/chiuso/riaperto/scaduto/reset/già-consegnato × invio/gate/pagina/submit/poll) e la verifica in modo avversario. |
| **exam-grading-audit.js** | Dopo modifiche a correzione/grading/certificato | Traccia la pipeline gradeAnswers → score→esito → bozza → certificato/email e la verifica (cerca risposte corrette segnate sbagliate, flip di soglia, esiti divergenti, leak di lingua, cache avvelenata). |
| **access-gate-consistency.js** | Rapido, quando vuoi | Guardia leggera (1 agente): controlla che la decisione d'accesso resti consolidata in `src/lib/exam-links/access.ts` e che nessun punto abbia re-inlineato una copia divergente. |

## Parametri (`args`)

- **pre-deploy-review**: opzionale.
  - stringa → nota di focus extra per tutti i revisori.
  - `{ range: "..." }` → cambia l'intervallo del diff (default `origin/main...HEAD`).
  - `{ range, focus }`.

Esempio: `Workflow({ scriptPath: ".../pre-deploy-review.js", args: "occhio alla chiusura e alla grazia" })`

## Regola d'oro

**`pre-deploy-review` prima di ogni deploy sul percorso esame.** Gli altri tre si
lanciano dopo un intervento mirato sul rispettivo sottosistema, o periodicamente
per scovare derive. Sono behavior-neutral (sola lettura): non toccano il codice.
