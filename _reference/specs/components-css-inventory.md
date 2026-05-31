# SSA Platform — `components.css` Inventory & Design-System Showcase Spec

Source files analyzed:
- `/Users/ferraboschi/Documents/sakeplatform/_reference/prototype/components.css` (905 lines)
- `/Users/ferraboschi/Documents/sakeplatform/_reference/prototype/page-design-system.jsx` (design-system showcase)
- `/Users/ferraboschi/Documents/sakeplatform/_reference/prototype/tokens.css` (tokens + global resets + utility classes)

> All class names below are **verbatim** from the source. Token references (`--x`) are the exact CSS custom properties used. This is the canonical port reference for the shared component library: preserve class parity (or map 1:1 to Tailwind/component props).

---

## 0. Where the styles live (important for the port)

There are **two** stylesheets that produce "component" classes:

- **`components.css`** — all the component groups below (buttons, cards, badges, KPI, table, sidebar, topbar, etc.) plus global keyframes.
- **`tokens.css`** — the design tokens (`:root`), global element resets (`*`, `html/body`, `button/input`, `a`, `::selection`, scrollbar), **and a small set of typographic/utility classes** that the JSX uses heavily: `.eyebrow`, `.mono`, `.num`, `.display`, `.h1`, `.h2`, `.h3`, `.text-2`, `.text-3`, `.text-4`, `.divider`. Do not forget these — the showcase relies on them.

---

## 1. Component inventory (by group)

### 1.1 Layout shell

| Class | Element | Key properties |
|---|---|---|
| `.app` | Root grid wrapper | `display:grid`; `grid-template-columns: var(--sidebar-w) 1fr`; `min-height:100vh`; `background:var(--bg)` |
| `.app.no-sidebar` | Modifier | collapses to single column `1fr` |

### 1.2 Sidebar

| Class | Element | Key properties |
|---|---|---|
| `.sidebar` | Side nav container | `background:var(--surface)`; right border `var(--border)`; `padding:16px 12px`; flex column, `gap:4px`; `position:sticky; top:0; height:100vh; overflow-y:auto` |
| `.sb-brand` | Brand header block | flex row, `gap:10px`; `padding:8px 10px 18px`; bottom border `var(--border-2)` |
| `.sb-mark` | Logo mark tile | 28×28; `border-radius:6px`; `background:var(--navy)`; white text; grid-centered; bold 13px; `position:relative; overflow:hidden` |
| `.sb-mark::before` | **Pseudo-element** gradient overlay | `linear-gradient(135deg, var(--indigo) 0%, transparent 60%)`; `opacity:0.7`; absolute `inset:0` |
| `.sb-mark span` | Mark glyph | `position:relative; z-index:1` (sits above the ::before) |
| `.sb-brand-name` | Brand title text | semibold 13.5px; `letter-spacing:var(--ls-tight-sm)`; `color:var(--text)` |
| `.sb-brand-sub` | Brand subtitle | 10.5px; `color:var(--text-4)`; `margin-top:2px` |
| `.sb-group` | Nav group wrapper | flex column, `gap:2px`; `padding:8px 0` |
| `.sb-group-label` | Group caption | 10.5px semibold; `letter-spacing:var(--ls-caps)`; uppercase; `color:var(--text-4)`; `padding:6px 10px` |
| `.sb-link` | Nav item | flex row `gap:10px`; `padding:6px 10px`; `border-radius:var(--r-2)`; 13.5px medium; `color:var(--text-2)`; transition bg+color `var(--dur-fast) var(--ease)`; `position:relative` |
| `.sb-link svg` | Icon inside link | `color:var(--text-3)`; transition color; `flex-shrink:0` |
| `.sb-link:hover` | Hover | `background:var(--surface-hover)`; `color:var(--text)` |
| `.sb-link:hover svg` | Hover icon | `color:var(--indigo)` |
| `.sb-link.active` | **Active modifier** | `background:var(--indigo-50)`; `color:var(--indigo)`; semibold |
| `.sb-link.active svg` | Active icon | `color:var(--indigo)` |
| `.sb-link-count` | Trailing count | `margin-left:auto`; 11px; `color:var(--text-4)`; tabular-nums; `font-family:var(--font-mono)` |
| `.sb-link.active .sb-link-count` | Active count | `color:var(--indigo)` |
| `.sb-sublink` | Sub-nav item (expanded parent) | flex row `gap:9px`; `padding:7px 10px 7px 30px` (deep left indent); `border-radius:var(--r-2)`; 12.5px; `color:var(--text-3)` |
| `.sb-sublink-tick` | Sublink bullet dot | 5×5 circle; `background:var(--border-strong, var(--text-4))`; transitions bg+transform |
| `.sb-sublink:hover` / `:hover .sb-sublink-tick` | Hover | bg `var(--surface-hover)`, text `var(--text)`; tick → `var(--indigo)` |
| `.sb-sublink.active` | **Active modifier** | `color:var(--indigo)`; semibold; `background:var(--indigo-50)` |
| `.sb-sublink.active .sb-sublink-tick` | Active tick | `background:var(--indigo)`; `transform:scale(1.2)` |
| `.flip-up` | Chevron flip util | `transform:rotate(180deg)`; transition transform (used for expanded caret) |
| `.sb-foot` | Sidebar footer | `margin-top:auto`; `padding:12px 10px`; top border `var(--border-2)`; flex row `gap:10px` |
| `.sb-foot-info` | Footer text wrap | `flex:1; min-width:0` |
| `.sb-foot-name` | Footer user name | 13px medium; ellipsis truncation |
| `.sb-foot-role` | Footer user role | 11.5px; `color:var(--text-3)` |

### 1.3 Reorder buttons (question-list affordance)

| Class | Element | Key properties |
|---|---|---|
| `.reorder-btn` | Up/down move button | grid-centered 22×18; `border:1px solid var(--border)`; `border-radius:4px`; `background:var(--surface)`; `color:var(--text-3)`; transitions bg/color/border |
| `.reorder-btn:hover:not(:disabled)` | Hover | `background:var(--indigo-50)`; `color:var(--indigo)`; `border-color:var(--indigo-100)` |
| `.reorder-btn:disabled` | Disabled | `opacity:0.35`; `cursor:default` |

### 1.4 Topbar

| Class | Element | Key properties |
|---|---|---|
| `.topbar` | Top bar | `height:var(--topbar-h)`; `background:var(--surface)`; bottom border `var(--border)`; flex row `gap:16px`; `padding:0 var(--gutter)`; `position:sticky; top:0; z-index:30` |
| `.crumbs` | Breadcrumbs | flex row `gap:6px`; 13px; `color:var(--text-3)` |
| `.crumbs a` / `a:hover` | Crumb link | `color:var(--text-3)` → hover `var(--text)` |
| `.crumbs .sep` | Separator | `color:var(--text-mute)` |
| `.crumbs .current` | Current crumb | `color:var(--text)`; medium |
| `.topbar-search` | Search wrapper | `flex:1`; `max-width:460px`; `position:relative` |
| `.topbar-search input` | Search field | full width; `height:34px`; `padding:0 12px 0 36px`; `border-radius:var(--r-2)`; border `var(--border)`; `background:var(--bg)`; 13.5px |
| `.topbar-search input:focus` | Focus | `background:var(--surface)`; `border-color:var(--border-focus)`; `box-shadow:var(--sh-focus)` |
| `.topbar-search-icon` | Leading icon | absolute `left:11px`, vertically centered; `color:var(--text-4)`; `pointer-events:none` (also reused in DS Search demo) |
| `.topbar-search-kbd` | Trailing ⌘K hint | absolute right; `font-family:var(--font-mono)`; 10.5px; bordered chip |
| `.topbar-right` | Right cluster | flex row `gap:6px`; `margin-left:auto` |

### 1.5 Topbar search palette (command-palette dropdown)

| Class | Element | Key properties |
|---|---|---|
| `.topbar-search-pop` | Result popover | absolute `top:calc(100% + 6px)`; `background:var(--surface)`; border `var(--border)`; `border-radius:10px`; `box-shadow:var(--sh-popover)`; `z-index:80`; `min-width:540px; max-width:640px; max-height:70vh; overflow:auto`; `animation:tipIn 140ms var(--ease-out)` |
| `.search-section-label` | Section header | flex space-between; 10px/600 uppercase; `letter-spacing:var(--ls-caps)`; `color:var(--text-4)` |
| `.search-result` | Result row (button) | full-width flex `gap:10px`; `padding:8px 14px`; transparent button; left-aligned |
| `.search-result.active`, `.search-result:hover` | Active/hover | `background:var(--indigo-50)` |
| `.search-result-icon` | Result icon tile | 26×26; `border-radius:5px`; `background:var(--surface-2)`; grid-centered; `color:var(--text-2)` |
| `.search-result.active .search-result-icon` | Active icon | `background:var(--indigo)`; white |
| `.search-result-title` | Result title | 13px/600; `color:var(--text)`; ellipsis |
| `.search-result-sub` | Result subtitle | 11.5px; `color:var(--text-3)`; ellipsis |
| `.search-result-hint` | Per-row kbd hint | mono 10.5px; bordered chip |
| `.search-foot` | Sticky footer | `position:sticky; bottom:0`; `background:var(--surface-2)`; top border `var(--border-2)`; flex `gap:12px`; 10.5px |
| `.search-foot kbd` | Footer key chip | mono 10px; bordered; `color:var(--text-3)` |

### 1.6 Reminder rows (dashboard ops)

| Class | Element | Key properties |
|---|---|---|
| `.reminder-row` | Reminder list row | flex `gap:10px`; `padding:8px`; `border-radius:5px`; inherits color; transition bg |
| `a.reminder-row:hover` | Hover (anchor) | `background:var(--surface-2)` |
| `.reminder-deadline` | Date badge box | min 38px / 38px; `border-radius:6px`; `background:var(--surface-2)`; border `var(--border-2)`; grid-centered; 9px; multi-line |
| `.reminder-deadline .num` | Day number | 14px/600; `color:var(--text)`; block |
| `.reminder-deadline.urgent` | **Urgent modifier** | `background:var(--danger-bg)`; `border-color:var(--danger)`; `color:var(--danger-fg)` |
| `.reminder-deadline.urgent .num` | Urgent number | `color:var(--danger-fg)` |
| `.reminder-title` | Title | 12.5px/600; ellipsis |
| `.reminder-sub` | Subtitle | 11px; `color:var(--text-3)` |

### 1.7 Topbar status pill

| Class | Element | Key properties |
|---|---|---|
| `.tb-status` | Status pill | inline-flex `gap:6px`; `height:26px`; `padding:0 10px`; `background:var(--surface-2)`; border `var(--border-2)`; `border-radius:var(--r-pill)`; 11.5px medium; `color:var(--text-2)` |
| `.tb-status .dot` | Status dot | 6×6 circle; `background:var(--success)` |

### 1.8 Page scaffolding & page-header

| Class | Element | Key properties |
|---|---|---|
| `.page` | Page content wrapper | `padding:var(--s-7) var(--gutter) var(--s-10)`; `max-width:var(--content-max)`; centered (`margin:0 auto`) |
| `.page-narrow` | Modifier | `max-width:1080px` |
| `.page-header` | Header row | flex `align-items:flex-start; justify-content:space-between; gap:32px`; `margin-bottom:var(--s-7)` |
| `.page-title-block .eyebrow` | Eyebrow above title | `margin-bottom:10px` |
| `.page-title` | Page H1 | 26px semibold; `letter-spacing:var(--ls-tight-sm)`; `color:var(--text)` |
| `.page-sub` | Page subtitle | 13.5px; `color:var(--text-3)`; `max-width:620px` |
| `.page-actions` | Actions cluster | flex `gap:8px`; `flex-shrink:0` |

### 1.9 Buttons — see §2 for the full matrix

### 1.10 Inputs / forms

| Class | Element | Key properties |
|---|---|---|
| `.input`, `.select`, `.textarea` | Form controls | `height:32px`; `padding:0 10px`; border `var(--border)`; `border-radius:var(--r-2)`; `background:var(--surface)`; 13.5px; transition border+shadow; `width:100%` |
| `.textarea` | Textarea override | `height:auto`; `padding:8px 10px`; `resize:vertical`; `min-height:64px`; `line-height:1.5` |
| `.input:hover`, `.select:hover` | Hover | `border-color:var(--border-strong)` |
| `.input:focus`, `.select:focus`, `.textarea:focus` | Focus | `border-color:var(--border-focus)`; `box-shadow:var(--sh-focus)` |
| `.input::placeholder`, `.textarea::placeholder` | Placeholder | `color:var(--text-4)` |
| `.field` | Field wrapper | flex column `gap:6px` |
| `.field-label` | Field label | 11.5px semibold; `color:var(--text-2)`; `letter-spacing:var(--ls-normal)` |
| `.field-hint` | Field hint | 11.5px; `color:var(--text-3)` |

### 1.11 Card

| Class | Element | Key properties |
|---|---|---|
| `.card` | Card container | `background:var(--surface)`; `border-radius:var(--r-3)`; `box-shadow:var(--sh-card)` |
| `.card-pad` | Padding modifier | `padding:20px` |
| `.card-pad-lg` | Padding modifier | `padding:28px` |
| `.card-head` | Card header | flex space-between; `padding:14px 20px`; bottom border `var(--border-2)`; `gap:12px` |
| `.card-head .h3` | Header title | `font-size:14px` (overrides `.h3`'s 16px) |
| `.card-body` | Card body | `padding:20px` |

### 1.12 Badge

| Class | Element | Key properties |
|---|---|---|
| `.badge` | Badge base | inline-flex `gap:4px`; `height:20px`; `padding:0 7px`; `border-radius:var(--r-1)`; 11px semibold; `letter-spacing:0.02em`; `white-space:nowrap` |
| `.badge svg` | Badge icon | 10×10 |
| `.badge-indigo` | Variant | bg `var(--indigo-100)` / fg `var(--indigo-600)` |
| `.badge-success` | Variant | bg `var(--success-bg)` / fg `var(--success-fg)` |
| `.badge-warning` | Variant | bg `var(--warning-bg)` / fg `var(--warning-fg)` |
| `.badge-danger` | Variant | bg `var(--danger-bg)` / fg `var(--danger-fg)` |
| `.badge-neutral` | Variant | bg `var(--surface-2)` / fg `var(--text-2)` + border `var(--border-2)` |
| `.badge-azzurro` | Variant | bg `var(--azzurro-bg)` / fg `var(--azzurro)` |
| `.badge-oro` | Variant | bg `var(--oro-bg)` / fg **`#8A6E1A`** (hard-coded, not a token) |
| `.badge-navy` | Variant | bg `var(--navy)` / white |
| `.badge-dot::before` | **Dot modifier (pseudo-element)** | 6×6 circle; `background:currentColor`; prepended leading dot |
| `.badge-lg` | Size modifier | `height:24px`; `padding:0 9px`; 11.5px |

### 1.13 Avatar

| Class | Element | Key properties |
|---|---|---|
| `.avatar` | Avatar base | 28×28; `border-radius:50%`; `background:var(--indigo-100)`; `color:var(--indigo-600)`; inline-grid centered; 11px semibold; `overflow:hidden` |
| `.avatar-sm` | Size | 22×22 / 10px |
| `.avatar-md` | Size | 32×32 / 12px |
| `.avatar-lg` | Size | 48×48 / 15px |
| `.avatar-xl` | Size | 72×72 / 22px |

> Note: avatar `tone` (e.g. `tone="indigo"`, `tone="navy"`) is passed in JSX but is **not** defined as a CSS class in `components.css` — the `V2.Avatar` component must set tone colors inline or via additional classes. Default tone is indigo (the base `.avatar` colors). **Port action:** define `tone` variants in the component.

### 1.14 Table

| Class | Element | Key properties |
|---|---|---|
| `.table-wrap` | Table card wrapper | `background:var(--surface)`; `border-radius:var(--r-3)`; `box-shadow:var(--sh-card)`; `overflow:hidden` |
| `.table` | Table | `width:100%`; `border-collapse:collapse`; 13px |
| `.table th` | Header cell | left; 11px semibold uppercase; `letter-spacing:var(--ls-caps)`; `color:var(--text-4)`; `padding:10px 16px`; `background:var(--surface-2)`; bottom border `var(--border)` |
| `.table td` | Body cell | `padding:12px 16px`; bottom border `var(--border-2)`; `vertical-align:middle`; `color:var(--text)` |
| `.table tbody tr:last-child td` | Last row | `border-bottom:none` |
| `.table tbody tr` / `tr:hover` | Row hover | transition bg → hover `var(--surface-hover)` |
| `.table tbody tr.clickable` | **Clickable modifier** | `cursor:pointer` |
| `.table-num` | Numeric cell util | `font-variant-numeric:tabular-nums` |
| `.table-actions` | Actions column | `width:1%`; `white-space:nowrap` |
| `.col-resize-handle:hover` | Column resize affordance | `background:var(--indigo-50)` |
| `.col-resize-handle:hover > span` | Resize handle bar | `background:var(--indigo)` |

> Note: `.table td .num` (tabular numbers) used in the JSX comes from the **tokens.css** `.num` utility, not `.table-num`.

### 1.15 Tabs

| Class | Element | Key properties |
|---|---|---|
| `.tabs` | Tab strip | flex `gap:0`; bottom border `var(--border)`; `margin-bottom:24px` |
| `.tab` | Tab item | `position:relative`; `padding:10px 14px`; 13px medium; `color:var(--text-3)`; `margin-bottom:-1px`; `border-bottom:2px solid transparent`; transition color |
| `.tab:hover` | Hover | `color:var(--text)` |
| `.tab.active` | **Active modifier** | `color:var(--text)`; `border-bottom-color:var(--indigo)`; semibold |
| `.tab-count` | Count chip | mono 11px; `color:var(--text-4)`; `background:var(--surface-2)`; `padding:1px 6px`; `border-radius:4px` |
| `.tab.active .tab-count` | Active count | `background:var(--indigo-100)`; `color:var(--indigo-600)` |

### 1.16 Segmented control

| Class | Element | Key properties |
|---|---|---|
| `.segmented` | Segmented wrapper | inline-flex; `background:var(--surface-2)`; border `var(--border-2)`; `border-radius:var(--r-2)`; `padding:2px`; `gap:2px` |
| `.segmented button` | Segment | `height:26px`; `padding:0 10px`; `border-radius:4px`; 12px medium; `color:var(--text-3)`; inline-flex `gap:4px` |
| `.segmented button:hover` | Hover | `color:var(--text)` |
| `.segmented button.on` | **On modifier** | `background:var(--surface)`; `color:var(--text)`; semibold; `box-shadow:var(--sh-1)` |

### 1.17 KPI card

| Class | Element | Key properties |
|---|---|---|
| `.kpi-grid` | KPI grid | `display:grid`; `gap:16px` |
| `.kpi-grid.cols-3` / `.cols-4` / `.cols-5` | Column modifiers | `repeat(3/4/5, 1fr)` |
| `.kpi` | KPI card | `background:var(--surface)`; `border-radius:var(--r-3)`; `padding:16px 18px`; `box-shadow:var(--sh-card)`; flex column `gap:4px`; `position:relative; overflow:hidden`; transition box-shadow+transform `var(--dur) var(--ease)` |
| `.kpi-label` | Label | 12px; `color:var(--text-3)`; medium; `margin-bottom:6px` |
| `.kpi-value` | Big value | 26px semibold; `letter-spacing:var(--ls-tight-sm)`; `color:var(--text)`; tabular-nums |
| `.kpi-value .unit` | Unit suffix | `0.55em`; `color:var(--text-3)`; medium; `margin-left:3px` |
| `.kpi-delta` | Delta chip | inline-flex `gap:3px`; 11.5px semibold; `margin-top:8px` |
| `.kpi-delta.up` | **Up modifier** | `color:var(--success-fg)` |
| `.kpi-delta.dn` | **Down modifier** | `color:var(--danger-fg)` |
| `.kpi-foot` | Foot note | 11.5px; `color:var(--text-4)`; `margin-top:6px` |
| `.kpi-accent` | Accent bar (top) | absolute top strip; `height:2px`; `background:var(--indigo)` |
| `.kpi-accent.green` | Accent | `var(--success)` |
| `.kpi-accent.warning` | Accent | `var(--warning)` |
| `.kpi-accent.danger` | Accent | `var(--danger)` |
| `.kpi-accent.azzurro` | Accent | `var(--azzurro)` |
| `.kpi-accent.oro` | Accent | `var(--oro)` |
| `.kpi-anim` | **Entrance animation** | `animation:kpiIn 500ms var(--ease-out) both` |
| `.kpi-anim:nth-child(2..5)` | Stagger delays | 60 / 120 / 180 / 240 ms |

> Accent maps: JSX passes `accent="indigo"` (default class, no extra), `accent="green"`, `accent="danger"`, `accent="oro"`. Note `green` (CSS class) ≠ `success` (token name).

### 1.18 Progress bar

| Class | Element | Key properties |
|---|---|---|
| `.bar` | Track | `position:relative`; `height:4px`; `background:var(--border-2)`; `border-radius:999px`; `overflow:hidden` |
| `.bar > i` | Fill (width-driven) | absolute left fill; `background:var(--indigo)`; transition `width var(--dur) var(--ease)` |
| `.bar.success > i` | Variant fill | `var(--success)` |
| `.bar.warning > i` | Variant fill | `var(--warning)` |
| `.bar.danger > i` | Variant fill | `var(--danger)` |
| `.bar.azzurro > i` | Variant fill | `var(--azzurro)` |

> Fill percentage is set inline in JSX (`style={{ width: "78%" }}`).

### 1.19 Hero (mesh gradient)

| Class | Element | Key properties |
|---|---|---|
| `.hero` | Hero card | `background:var(--surface)`; `border-radius:var(--r-4)`; `box-shadow:var(--sh-card)`; `padding:32px`; `position:relative; overflow:hidden`; `margin-bottom:28px` |
| `.hero-mesh::before` | **Mesh gradient pseudo-element** | absolute `inset:0`; `background:var(--mesh-1)`; `pointer-events:none` |
| `.hero > *` | Content stacking | `position:relative; z-index:1` (above mesh) |

### 1.20 Pill / chip

| Class | Element | Key properties |
|---|---|---|
| `.pill` | Filter chip | inline-flex `gap:4px`; `height:24px`; `padding:0 9px`; `border-radius:var(--r-pill)`; 12px medium; `background:var(--surface-2)`; `color:var(--text-2)`; border `var(--border-2)`; transition bg/border/color |
| `.pill:hover` | Hover | `border-color:var(--border-strong)`; `color:var(--text)` |
| `.pill.on` | **Active modifier** | `background:var(--navy)`; white; `border-color:var(--navy)` |

### 1.21 Misc / brand / micro-affordances

| Class | Element | Key properties |
|---|---|---|
| `.dot` | Inline separator dot | 4×4 circle; `background:var(--text-mute)`; inline-block; `margin:0 8px` (NB: distinct from `.tb-status .dot` and `.s-dot`) |
| `.link` | Text link | `color:var(--link)`; medium; transition color |
| `.link:hover` | Hover | `color:var(--link-hover)`; underline |
| `.kbd` | Keyboard chip | mono 11px; `padding:1px 6px`; `border-radius:4px`; `background:var(--surface-2)`; border `var(--border-2)`; `color:var(--text-2)` |
| `.ph-img` | Placeholder image box | dashed border `var(--border)`; layered gradient + `var(--surface-2)`; grid-centered mono 10.5px uppercase label; `border-radius:var(--r-2)` |
| `.dist-bar` | Mini bar-chart container | flex `align-items:flex-end; gap:3px; height:100%` |
| `.dist-bar > div` | Chart column | `flex:1`; `background:var(--indigo-100)`; `border-radius:2px 2px 0 0`; `min-height:3px`; transition `height var(--dur-slow) var(--ease-out)` |
| `.s-dot` | Status dot | 8×8 circle; inline-block |
| `.s-dot.success` / `.warning` / `.danger` / `.indigo` / `.muted` | Color variants | `var(--success)` / `var(--warning)` / `var(--danger)` / `var(--indigo)` / `var(--text-mute)` |
| `.s-dot.pulse` | **Pulse animation modifier** | `animation:dotPulse 2s infinite` |

### 1.22 Modal / dialog (animation only)

`components.css` defines the **modal entrance animation classes** but not full modal layout — those live elsewhere (likely a base layout/overlay). What's here:

| Class | Element | Key properties |
|---|---|---|
| `.modal-overlay` | Backdrop | `animation:modalFade 160ms var(--ease-out)` (fade only) |
| `.modal-dialog` | Dialog box | `animation:modalPop 200ms var(--ease-out)` (pop: translateY 8px + scale 0.98 → 0) |

> **Port action:** the structural modal box/overlay CSS (positioning, sizing, backdrop color) is NOT in this file. Only the animation hooks are. Implement structure in the port and keep these animation class names.

### 1.23 Typographic / utility classes (defined in `tokens.css`, used by components & JSX)

| Class | Purpose |
|---|---|
| `.eyebrow` | 11px semibold uppercase `letter-spacing:var(--ls-caps)`; `color:var(--text-3)` — used throughout (DS sections, card labels, page headers) |
| `.mono` | `font-family:var(--font-mono)`; tabular-nums |
| `.num` | tabular-nums + `font-feature-settings:"tnum"` (used in `.table` numeric cells) |
| `.display` | 44px semibold; `letter-spacing:var(--ls-tight)`; `line-height:var(--lh-tight)` |
| `.h1` / `.h2` / `.h3` | 28 / 20 / 16px semibold heads (note `.card-head .h3` overrides to 14px) |
| `.text-2` / `.text-3` / `.text-4` | text color utilities → `var(--text-2/3/4)` |
| `.text-mute` (used in JSX `<span className="text-mute">`) | **Referenced in JSX but NOT defined as a class** in either file — only `--text-mute` token exists. **Port action:** add a `.text-mute { color: var(--text-mute) }` utility. |
| `.divider` | 1px `background:var(--border)` rule |

---

## 2. Button variants & sizes (full matrix)

**Base:** `.btn` — inline-flex centered; `gap:6px`; `height:32px`; `padding:0 12px`; `border-radius:var(--r-2)`; 13px semibold; `letter-spacing:var(--ls-normal)`; `color:var(--text)`; `background:var(--surface)`; border `var(--border)`; `box-shadow:var(--sh-1)`; `white-space:nowrap`; full transition set (bg/border/color/shadow/transform).
- `.btn:hover` → `background:var(--surface-2)`; `border-color:var(--border-strong)`
- `.btn:active` → `transform:translateY(1px)`; `box-shadow:none`
- `.btn:focus-visible` → `box-shadow:var(--sh-focus), var(--sh-1)`

**Variants (combine with `.btn`):**

| Class | Background | Text | Hover | Focus-visible |
|---|---|---|---|---|
| (default `.btn`) | `var(--surface)` | `var(--text)` | surface-2 + border-strong | sh-focus + sh-1 |
| `.btn-primary` | `var(--indigo)` | white | `var(--indigo-600)` | `0 0 0 1px var(--indigo-600), var(--sh-focus)` |
| `.btn-dark` | `var(--navy)` | white | `var(--navy-700)` | — |
| `.btn-ghost` | transparent (no shadow) | `var(--text-2)` | `var(--surface-hover)` + `var(--text)` | — |
| `.btn-danger` | `var(--danger)` | white | `var(--danger-fg)` | — |

> `.btn-primary` base shadow: `0 0 0 1px var(--indigo-600), 0 1px 1px 0 rgba(0,0,0,0.08)`.

**Sizes (combine with `.btn`):**

| Class | Height | Padding | Font |
|---|---|---|---|
| `.btn-sm` | 26px | `0 10px` | 12px |
| (default) | 32px | `0 12px` | 13px |
| `.btn-lg` | 36px | `0 14px` | 13.5px |

**Shape modifiers:**

| Class | Effect |
|---|---|
| `.btn-icon` | `width:32px; padding:0` (square icon button) |
| `.btn-icon.btn-sm` | `width:26px` (small square) |

**Disabled state:** there is **no `.btn:disabled` rule** — the DS showcase applies disabled styling inline (`opacity:0.5; cursor:not-allowed`). **Port action:** add a proper `:disabled` rule so disabled buttons don't rely on inline styles.

---

## 3. Class names the React components rely on (parity list)

From `page-design-system.jsx` (and the `window.V2` component contract). Maintain these exact strings or map them in the ported components.

**Layout / page:** `page`, `card`, `card-pad`, `card-pad-lg`, `card-head`, `card-body`, `eyebrow`.

**Headings / text:** `display`, `h1`, `h2`, `h3`, `text-2`, `text-3`, `text-4`, `text-mute` (⚠ undefined), `mono`, `num`.

**Buttons:** `btn`, `btn-primary`, `btn-dark`, `btn-ghost`, `btn-danger`, `btn-sm`, `btn-lg`, `btn-icon`.

**Inputs:** `field`, `field-label`, `field-hint`, `input`, `select`, `textarea`, plus `topbar-search-icon` reused for the search demo.

**Badges (via `V2.Badge tone=…`):** maps `tone` → `.badge` + `.badge-{indigo|success|warning|danger|neutral|azzurro|oro|navy}`; `dot` prop → `.badge-dot`. Sizes: `.badge-lg`.

**Status (via `V2.StatusBadge status=…`):** statuses seen — `in-traiettoria`, `monitor`, `rischio`, `critico`. The status→badge-tone mapping lives inside the component (not in CSS); confirm in the component source during port. (Mapping likely: in-traiettoria→success, monitor→neutral, rischio→warning, critico→danger.)

**Avatar (via `V2.Avatar name/size/tone`):** `.avatar` + `.avatar-{sm|md|lg|xl}`; `tone` (`indigo`/`navy`) has **no CSS class** — handled in component.

**KPI (via `V2.KPI`):** `.kpi-grid`, `.kpi-grid.cols-4`, plus internal `.kpi`, `.kpi-label`, `.kpi-value`, `.kpi-value .unit`, `.kpi-delta`, `.kpi-delta.up/.dn`, `.kpi-foot`, `.kpi-accent` + accent color class. `accent` prop values used: `indigo`, `green`, `danger`, `oro`. `deltaDir` → `up`/`dn`.

**Tabs / segmented:** `tabs`, `tab`, `tab active`, `tab-count`; `segmented`, segment button `on`.

**Table:** `table-wrap`, `table`, `clickable`, `num` (tabular cell), `text-3`, `text-mute`.

**Misc/brand:** `hero`, `hero-mesh`, `sb-mark` (reused as brand mark in DS), `pill`, `pill on`, `link`, `kbd`, `bar`, `bar success`, `bar warning`.

**Showcase-only helpers (local to the DS page, not shared lib):** `DSSection`, `DSGrid`, `DSDemo`, `PaletteGroup`, `TypeRow` are React function components (no CSS classes of their own beyond `card`/`eyebrow`/`mono`). They are **scaffolding for the showcase** — port them only if you reproduce the design-system page itself.

**Icon set referenced by `V2.Icon name=…`** (stroke 1.5, 16–18px). Names used in the showcase grid:
`home, book, users, user, graduation, calendar, archive, exam, settings, pin, mail, phone, whatsapp, share, download, plus, check, x, refresh, external, edit, trash, more, sparkle, globe, tag, warn, trending, filter, grid, list, timeline, bell, lightning, play, stop, pause, monitor, smartphone, tablet`. (Also used inline: `search`.)

---

## 4. Porting notes

### 4.1 Cosmetic vs. structural
- **Purely cosmetic (safe to map straight to Tailwind utility sets or keep as-is):** `.badge-*`, `.btn-*` color/size variants, `.kpi-accent.*`, `.bar.*`, `.s-dot.*`, `.text-2/3/4`, `.eyebrow`, `.mono`, `.kbd`, `.pill` colors, `.link`.
- **Structural (define real layout in the port; class parity matters):** `.app` grid, `.sidebar`, `.topbar`, `.page`/`.page-header`, `.card`/`.card-head`/`.card-body`, `.table*`, `.kpi-grid`, `.field`, `.topbar-search-pop` palette, `.modal-overlay`/`.modal-dialog` (structure not in this file).

### 4.2 Tricky bits (don't lose these in the port)
- **Pseudo-elements:**
  - `.sb-mark::before` — 135° indigo→transparent gradient overlay; glyph must sit on `z-index:1`.
  - `.badge-dot::before` — leading `currentColor` dot (color follows badge fg automatically).
  - `.hero-mesh::before` — full `var(--mesh-1)` 4-stop radial mesh; content must be `z-index:1`.
- **Keyframe animations (7 total):** `modalFade`, `modalPop` (translateY+scale, deliberately no horizontal slide), `kpiIn`, `tipIn` (note its `translateX(-50%)` centering — relevant if attached to a centered element), `expandIn` (declared but no class binds it — accordion reveal helper), `dotPulse`. Easing/duration tokens: `--ease`, `--ease-out`, `--dur-fast`, `--dur`, `--dur-slow`.
- **Staggered nth-child:** `.kpi-anim:nth-child(2..5)` cascade delays — preserve sequencing (or replicate with per-item delay props).
- **Grid layouts:** `.app` (`var(--sidebar-w) 1fr`), `.kpi-grid.cols-3/4/5`. The DS page also uses many inline `gridTemplateColumns` (repeat(N,1fr)) — those are showcase-local.
- **Width/`>i` fill pattern:** `.bar > i` and `.dist-bar > div` are driven by inline `width`/`height` — the port's Progress component must set the inline size.
- **Sticky + z-index stack:** `.topbar` (z-30), `.sidebar` (sticky top), `.topbar-search-pop` (z-80), `.search-foot` (sticky bottom). Keep z-index ordering coherent.
- **Token fallback syntax:** `.sb-sublink-tick` uses `var(--border-strong, var(--text-4))` — a nested var fallback; keep both.
- **Hard-coded color leak:** `.badge-oro` foreground is literal `#8A6E1A` (no token). Consider introducing an `--oro-fg` token in the port for consistency.
- **Naming mismatches to watch:** KPI accent class `green` vs token `--success`; `.kpi-delta.dn` (not `.down`); three different "dot" classes (`.dot` 4px separator, `.tb-status .dot` 6px, `.s-dot` 8px status).

### 4.3 Gaps to fix during the port (referenced but undefined)
1. `.text-mute` — used in JSX, **no CSS class** exists (only `--text-mute` token). Add `.text-mute { color: var(--text-mute); }`.
2. Avatar `tone` variants — passed as props, **no CSS classes**. Implement in component.
3. `V2.StatusBadge` status→tone mapping — lives in component code, not CSS. Confirm against the component source.
4. `.btn:disabled` — no rule; disabled styling is inline in the showcase. Add a real rule.
5. Modal structural CSS (box size/position, backdrop color) — not in `components.css`; only `modalFade`/`modalPop` animations are here.

### 4.4 All CSS custom properties referenced (across the three files)

**Brand / color:** `--indigo`, `--indigo-600`, `--indigo-500`, `--indigo-400`, `--indigo-100`, `--indigo-50`, `--navy`, `--navy-700`, `--navy-500`, `--navy-400`, `--navy-300`, `--navy-200`, `--navy-100`, `--link`, `--link-hover`.
**Semantic state:** `--success`, `--success-bg`, `--success-fg`, `--warning`, `--warning-bg`, `--warning-fg`, `--danger`, `--danger-bg`, `--danger-fg`.
**SSA accents:** `--azzurro`, `--azzurro-bg`, `--oro`, `--oro-bg`.
**Surface:** `--bg`, `--bg-mesh`, `--surface`, `--surface-2`, `--surface-hover`.
**Text:** `--text`, `--text-2`, `--text-3`, `--text-4`, `--text-on-dark`, `--text-mute`.
**Border:** `--border`, `--border-2`, `--border-strong`, `--border-focus`.
**Type:** `--font-sans`, `--font-mono`, `--fs-display`, `--fs-h1`, `--fs-h2`, `--fs-h3`, `--fs-body`, `--fs-small`, `--fs-micro`, `--fs-mono`; line-height `--lh-tight`, `--lh-snug`, `--lh-normal`, `--lh-relaxed`; letter-spacing `--ls-tight`, `--ls-tight-sm`, `--ls-normal`, `--ls-eyebrow`, `--ls-caps`; weight `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--fw-bold`.
**Spacing:** `--s-0`, `--s-px`, `--s-1` … `--s-12`.
**Radius:** `--r-1`, `--r-2`, `--r-3`, `--r-4`, `--r-5`, `--r-pill`.
**Shadow:** `--sh-1`, `--sh-2`, `--sh-3`, `--sh-4`, `--sh-card`, `--sh-popover`, `--sh-focus`.
**Layout:** `--sidebar-w`, `--topbar-h`, `--content-max`, `--gutter`.
**Motion:** `--ease`, `--ease-out`, `--dur-fast`, `--dur`, `--dur-slow`.
**Effects:** `--mesh-1`.

> Tokens defined but **not referenced** by `components.css`/the showcase (still port them for completeness): `--indigo-500`, `--navy-100`, `--text-on-dark`, `--bg-mesh`, `--fs-*` (most), `--lh-*` (used via body only), `--ls-eyebrow`, `--s-0/-px/-2..-6/-8..-12`, `--r-5`, `--sh-2`/`--sh-3` (only in DS swatch demo). Keep the full token set.
