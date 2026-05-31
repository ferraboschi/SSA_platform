# 10 · Account / profilo / sessione

File prototipo: `page-account.jsx` · Route: `#/account` · **Nuovo rispetto alla produzione**
(oggi l'auth è un semplice username/password via env su Render).

---

## Schermate
- **Profilo:** foto (upload con anteprima base64), nome, cognome, email, telefono,
  posizione, città. Salvataggio con toast di conferma.
- **Sicurezza:** cambio password (con conferma).
- **Sessione:** elenco profili attivi (admin / manager) con **switch profilo**; il profilo
  attivo determina i permessi (es. azioni admin nel Pianificatore).

## Dati & endpoint
- Da `app-state.js` (`USERS`, `getProfile`/`setProfile`, `getCurrentUserId`).
- In prod: **autenticazione reale** (utenti, ruoli, sessione), upload foto su storage,
  cambio password sicuro.

## Note di implementazione
> **Da evidenziare — bug React:** il componente `Field` è definito **dentro**
> `AccountInner`, quindi viene ricreato a ogni render → l'input perde il focus dopo ogni
> carattere. Va estratto fuori dal componente padre nella riscrittura. (Pattern presente
> anche in alcune modali — controllare i sotto-componenti definiti inline.)

- Ruoli: `admin` / `manager` — base per un sistema di permessi più ricco.
- **i18n:** etichette campi, ruoli, messaggi toast.
- Priorità: **media** (serve auth/utenti reali; nel prototipo è mockato).
