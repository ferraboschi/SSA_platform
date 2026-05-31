# 11 · Design system

File prototipo: `page-design-system.jsx`, `tokens.css`, `components.css`
Route: `#/design-system` · Pagina **interna di riferimento** (non necessariamente da
esporre nell'app finale).

Vetrina dei **design tokens** e dei **componenti** usati nel prototipo: colori, tipografia,
spaziature/ombre/raggi, e i componenti UI (`Icon`, `Avatar`, `Badge`, `StatusBadge`,
`KPI`, bottoni, tabelle, ecc.). Organizzata in sezioni (`DSSection`).

---

## A cosa serve nell'handoff
È la **fonte di verità visiva**. Per replicare l'aspetto dell'app:

- **Tokens** → `tokens.css`: palette (incl. brand `indigo`, `navy`, `azzurro`, `oro`),
  superfici, bordi, testo (`--text` … `--text-4`), ombre (`--sh-*`), durate/easing,
  tipografia (Inter + JetBrains Mono per i numeri/mono), letter-spacing maiuscoletto.
- **Componenti** → `components.css` + `components.jsx`.

## Note di implementazione
- Portare i tokens come **variabili di tema** (CSS custom properties o equivalente nello
  stack scelto) e i componenti come **libreria UI** condivisa.
- La classe `.num` / `var(--font-mono)` è usata ovunque per i numeri tabellari: mantenerla.
- Priorità: **fondazione** (da implementare per primo: tutto il resto vi si appoggia), ma
  la *pagina* di vetrina è opzionale in produzione.
