# MSC 2026 — Medagliere · Handoff per l'integrazione

Portale pubblico dei risultati della **Milano Sake Challenge 2026**. Trilingue (IT / EN / JA), una pagina lista filtrabile + una pagina per ogni prodotto premiato. Questo documento contiene tutto il necessario per integrarlo/deployarlo senza altre domande.

---

## 1. TL;DR

- **Rotte:** `/msc2026` (lista) e `/msc2026/[id]` (scheda prodotto). **Pubbliche** — NON sotto il gruppo auth `(app)`.
- **Stack:** Next.js 16 (App Router) + React 19. ⚠️ *Non* è il Next.js classico (vedi `AGENTS.md` in root): `params` è una `Promise` → `await params`.
- **Dati:** "cotti" in JSON committati (non live). 403 prodotti premiati.
- **Generazione statica:** una pagina per prodotto (`generateStaticParams`) → `npm run build` emette ~**422 pagine statiche**.
- **Zero dipendenze nuove** oltre a quelle già nel progetto (`next/image`, `next/link`). Solo React + CSS inline + un blocco `<style>`.

---

## 2. Come girarlo in locale

```bash
npm install
npm run dev      # next dev -p 3210  →  http://localhost:3210/msc2026
npm run build    # produzione, ~422 pagine statiche
```

⚠️ **Gotcha noto:** un tool di sync/backup lascia file duplicati col suffisso " N" dentro `.git/` e `.next/` che rompono `git fetch` e la build. Se la build fallisce con errori in file tipo `… 2.ts`:
```bash
find .next -name '* [0-9]*' -delete    # oppure: rm -rf .next
```

---

## 3. File & architettura

Tutto sotto `src/app/msc2026/` (+ dati in `src/lib/` + asset in `public/`).

| File | Righe | Ruolo |
|---|---|---|
| `page.tsx` | 17 | **Server** — metadata SEO della lista, renderizza `<MedagliereClient/>`. |
| `medagliere-client.tsx` | ~440 | **`"use client"`** — la lista + tutto il sistema di filtri (medaglia, sessione, categoria, ricerca a tag). |
| `[id]/page.tsx` | 29 | **Server** — `generateStaticParams` (1 pagina/prodotto) + `generateMetadata` per-prodotto + `notFound()`; renderizza `<ProductView/>`. |
| `product-view.tsx` | ~418 | **`"use client"`** — la scheda prodotto (hero, medaglie, scheda tecnica, rapporti di valutazione/radar, condivisione, sakagura). |
| `shared.ts` | ~386 | **Modulo puro (server+client)** — tipi, token grafici (`C`), `MEDAL_META`/`SESSION_META`/`REGION_META`, stringhe i18n (`UI`), helper, import dati, `CATEGORY_GROUPS`/`CATEGORY_TYPE_OF`/`SEARCH_ENTITIES`, `medalImageFor()`. |
| `ui.tsx` | ~131 | **`"use client"`** — `Header`, icone, `useLang` (lingua persistita in localStorage), e **`MEDA_CSS`** (l'unico blocco CSS globale, iniettato via `<style>`). |

> Vecchio monolite `medagliere-client.tsx.bak` = solo storico, **ignorare**.

**Da sapere:** lo styling è quasi tutto **inline** (oggetti `style={{…}}`) + alcune classi nel blocco `MEDA_CSS` (per i media-query responsive e gli effetti hover/sticky). I colori/spaziature vengono dai token `C` in `shared.ts`. Sistema grafico = **Compify** (indigo `#4f46e5`, font **Inter**, card bianche, chip su "gray-track" segmentato, bande medaglia metalliche).

---

## 4. Dati — sorgente e refresh

I dati **non sono live**: sono estratti una volta da Compify e committati.

| File | Cosa contiene |
|---|---|
| `src/lib/msc2026-data.json` (~242 KB) | I 403 vincitori + scheda tecnica/regione. **Importato da `shared.ts`** (`ALL`; `VISIBLE` = `ALL` senza Magnifica). |
| `src/lib/msc2026-reports.json` (~634 KB) | I rapporti di valutazione per prodotto (chiave = `product_id`): radar, profilo qualitativo, commenti giuria. |
| `compify-all-data.json` (archiviato fuori repo: ~/Documents/SSA-archive-2026-07) | **Dump grezzo** da Compify (`{votes, regs}`, doppio-JSON-encoded). Sorgente per rigenerare i report. |
| `scripts/build_msc_reports.py` (~297 righe) | Rigenera `msc2026-reports.json` **e** arricchisce `msc2026-data.json` (aggiunge `product_id`, split pairing best/good with) partendo dal dump grezzo. |

**Per aggiornare i dati:** `python scripts/build_msc_reports.py` (legge `compify-all-data.json`, riscrive i due JSON in `src/lib/`). Le medaglie Design sono **per-categoria** (1 Best Design per categoria + i secondi come Good Design — per questo non esistono Shochu Good Design: 1 sola candidatura shochu per categoria).

> ⚠️ I 3 file dati (i due `msc2026-*.json` + `compify-all-data.json`) e gli asset (sotto) i due `msc2026-*.json` sono committati; il dump grezzo è archiviato fuori repo (~/Documents/SSA-archive-2026-07).

---

## 5. Asset (`public/`)

- `public/medals/` — **56 PNG** di artwork medaglia. `medalImageFor(winner)` (in `shared.ts`) risolve l'immagine per sessione+medaglia+`cat_code`.
- `public/msc-logo.png` — logo MSC (header + banner congratulazioni).
- `public/mockups/` — **17 file di SOLO RIFERIMENTO** (esplorazioni UX dei filtri). **Non sono linkati/spediti** dall'app; si possono escludere dal deploy.

**Gap noti sugli artwork (da rifornire al team design):**
1. Tutti gli artwork stampano **"2025"**, non 2026 → serve re-export.
2. Pairing: art presente solo per alcuni cibi; Lasagne/Gelato alla Fragola restano su `placeholder.png`.
3. Design/Pairing usano `placeholder.png` dove manca l'art.

---

## 6. Regole imposte dal cliente (NON cambiare senza ok)

1. **Nessun punteggio/voto, mai.** Solo dati qualitativi.
2. Vincitori in **ordine alfabetico** dentro ogni fascia-medaglia.
3. **Nomi prodotto e sakagura mai tradotti** (restano in originale). Regione/luogo possono essere localizzati.
4. **Trilingue** IT/EN/JA (switch in header, persistito).
5. **Magnifica nascosta** (embargo fino a settembre) — `VISIBLE` la filtra via.
6. Grafica **Compify** (lock concordato): chip su gray-track segmentato, niente colori/spazi "inventati".

---

## 7. Come funziona il filtro (riferimento comportamento)

- **MEDAGLIA** (riga 1): Platino · Doppio Oro · Oro · Argento · Best Design · Good Design · Best With · Good With. Ordine **fisso**. È un filtro; le non-pertinenti si **attenuano sul posto** (non spariscono, non si riordinano). Cliccare **Best With/Good With** **auto-seleziona** la sessione Abbinamento Cibo (sono medaglie di pairing).
- **SESSIONI** (riga 2): Nihonshu · Shochu · Abbinamento Cibo. È un **filtro vero** (nasconde le altre) e rivela le categorie. Filtra per *tipo-categoria* (`CATEGORY_TYPE_OF`), quindi "Nihonshu" include anche i sake nihonshu premiati al **Design** (scelta cliente: niente sessione "Design" separata). La categoria scelta entra **dentro** la pillola della sessione (`Nihonshu › Daiginjo ×`).
- **CATEGORIA**: pannello contestuale alla sessione; selezionarne una filtra e collassa la pillola.
- **RICERCA** (riga 3): campo unico autocomplete a **tag** (Sakagura / Prodotto / Regione). Semantica **OR** (un prodotto passa se soddisfa almeno un tag). Ordine suggerimenti: **Sakagura prima**, poi Prodotti, poi Regioni. Su scroll-down (con un filtro attivo) la riga ricerca si **collassa**, ricompare su scroll-up.
- **Cross-filter** medaglia↔sessione: una sessione disabilita le medaglie non presenti, e viceversa.
- **Reset** sempre visibile (disabilitato se non c'è nulla). Contatore "N results" (nascosto su mobile).
- **URL condivisibile:** `?medal=…&cat=…&t=type:value` (i tag); la sessione si deriva dalla categoria.
- **Nessun auto-scroll** al cambio filtro (la pagina resta ferma).
- **Mobile:** le righe prodotto mostrano nome+sakagura interi a capo + riga meta (Sessione · Categoria · Prefettura); Reset a destra; card che crescono in verticale.

---

## 8. Scheda prodotto (`/msc2026/[id]`)

Una **bottiglia fisica** (`product._id`) può vincere in più sessioni → tutte le medaglie insieme. Sezioni dall'alto:
1. **Hero** — immagine medaglia su plinto + chip medaglia **metalliche** + chip **Sake/Shochu** + nome + sakagura + meta + "Visit website" + "Forward".
2. **Medaglie** — tutte le medaglie del prodotto (card con banda metallica).
3. **Scheda tecnica** — solo: polishing rate, Sake Meter Value, alcol, (anno fondazione, riso, lievito, koji non-yellow). **Niente prezzo, niente product_type** (spostato nell'hero). Si nasconde se l'unico dato è prezzo/tipo.
4. **Rapporti di valutazione** (per sessione vinta) — header a **banda medaglia metallica**; **radar** che mostra **solo la media della giuria** (linea tratteggiata); fatti qualitativi come **sezioni a nuvola di tag** (Aromas/Palate/Texture/Channels…); citazioni giuria. **Nessun prezzo/fascia di prezzo.**
5. **Keep & share** — pulsante **Download PDF** con menu lingua (vedi §9, *solo grafica*) + icone social (WhatsApp/Facebook/X/LinkedIn/Email/Copy).
6. **Sakagura** — descrizione (se presente) + altri prodotti della stessa sakagura.

---

## 9. Lasciato in sospeso / da decidere (IMPORTANTE per l'integratore)

1. **Download PDF multilingua = SOLO GRAFICA.** Il menu mostra 6 lingue (Italiano / English / 日本語 / 中文 / Deutsch / Français) ma il click fa solo `window.print()`. La UI è solo IT/EN/JA e i **contenuti dei report sono in lingua sorgente** (IT/JP). **ZH/DE/FR non esistono.** L'export reale per-lingua richiede una pipeline PDF + traduzione (LLM o professionale).
2. **Modello "medaglia = scorri-verso invece di filtra"** — proposto dal cliente, **in discussione, NON implementato** (oggi la medaglia filtra). Idea: medaglia = navigazione scroll-spy, sessione/categoria = unici filtri.
3. **Collasso dell'intero blocco filtro** (barra compatta richiamabile su mobile e desktop) — proposto, **non costruito**.
4. **Contenuti report non tradotti** per lingua UI (aromi/commenti restano in originale).
5. Le **citazioni del report Design** vengono da "Consiglio al produttore" (consiglio candido al produttore) — valutare se curarle per uso marketing.
6. **Edit-mode produttore** (login sakagura → aggiunge descrizione/logo/social) — non costruito.
7. Vedi §5 per i gap sugli **artwork medaglia** (2025, pairing mancanti).

---

## 10. Note di integrazione / convenzioni

- Leggere `AGENTS.md` in root: convenzioni del progetto (data-fetching/`unstable_cache`, mesi italiani, URL/segreti env-overridable). Per il medagliere il dato è **cotto in JSON**, quindi `unstable_cache` non si applica qui.
- `params` è una **Promise** (Next 16): `const { id } = await params`.
- Tutto ciò che è specifico alla pagina vive in `src/app/msc2026/` + `src/lib/msc2026-*.json` + `public/medals|msc-logo.png`. Spostando questi, il modulo è **auto-contenuto** (unico import esterno: i token via `shared.ts`).
- i18n: tutte le stringhe in `UI` dentro `shared.ts` (3 lingue). `useLang()` in `ui.tsx` persiste la scelta.
- Build verde attesa: `npm run build` → ~422 pagine statiche, `tsc --noEmit` pulito.
