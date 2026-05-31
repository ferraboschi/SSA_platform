// SSA v2 — Shared UI components (load BEFORE pages)
const { useState, useEffect, useMemo, useRef, Fragment } = React;

// =============== Icons (stroke 1.5, 16px) ===============
function Icon({ name, size = 16, className = "" }) {
  const c = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", className };
  switch (name) {
    case "search":   return <svg {...c}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "home":     return <svg {...c}><path d="M3 11l9-8 9 8"/><path d="M5 9v12h14V9"/></svg>;
    case "book":     return <svg {...c}><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M4 4v12a4 4 0 0 0 4 4"/></svg>;
    case "users":    return <svg {...c}><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><circle cx="17" cy="6" r="3"/><path d="M22 18c0-2.8-2.2-5-5-5"/></svg>;
    case "user":     return <svg {...c}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case "graduation":return <svg {...c}><path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11v5c2 2 4 3 6 3s4-1 6-3v-5"/></svg>;
    case "calendar": return <svg {...c}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;
    case "archive":  return <svg {...c}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 13h4"/></svg>;
    case "exam":     return <svg {...c}><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>;
    case "settings": return <svg {...c}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "pin":      return <svg {...c}><path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>;
    case "mail":     return <svg {...c}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case "phone":    return <svg {...c}><path d="M22 16.9V20a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-6-6 19 19 0 0 1-3-8.4A2 2 0 0 1 4.5 2h3.1a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.4 2.1L8.5 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/></svg>;
    case "whatsapp": return <svg {...c}><path d="M3 21l1.7-5.2A9 9 0 1 1 8.2 19.3L3 21z"/></svg>;
    case "share":    return <svg {...c}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9"/></svg>;
    case "download": return <svg {...c}><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
    case "plus":     return <svg {...c}><path d="M12 5v14M5 12h14"/></svg>;
    case "chevron":  return <svg {...c}><path d="M9 6l6 6-6 6"/></svg>;
    case "chevron-d":return <svg {...c}><path d="M6 9l6 6 6-6"/></svg>;
    case "chevron-l":return <svg {...c}><path d="M15 6l-6 6 6 6"/></svg>;
    case "arrow":    return <svg {...c}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case "arrow-l":  return <svg {...c}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>;
    case "arrow-up": return <svg {...c}><path d="M12 19V5M6 11l6-6 6 6"/></svg>;
    case "arrow-dn": return <svg {...c}><path d="M12 5v14M6 13l6 6 6-6"/></svg>;
    case "check":    return <svg {...c}><path d="M4 12l5 5 11-12"/></svg>;
    case "x":        return <svg {...c}><path d="M5 5l14 14M19 5L5 19"/></svg>;
    case "refresh":  return <svg {...c}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>;
    case "external": return <svg {...c}><path d="M14 4h6v6"/><path d="M20 4L10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>;
    case "edit":     return <svg {...c}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case "trash":    return <svg {...c}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>;
    case "more":     return <svg {...c}><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/></svg>;
    case "lock":     return <svg {...c}><rect x="4.5" y="11" width="15" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case "unlock":   return <svg {...c}><rect x="4.5" y="11" width="15" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>;
    case "sparkle":  return <svg {...c}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>;
    case "globe":    return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case "tag":      return <svg {...c}><path d="M21 12l-9 9-9-9V3h9l9 9z"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/></svg>;
    case "warn":     return <svg {...c}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17v.5"/></svg>;
    case "trending": return <svg {...c}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case "filter":   return <svg {...c}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></svg>;
    case "grid":     return <svg {...c}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case "list":     return <svg {...c}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>;
    case "timeline": return <svg {...c}><path d="M3 6h18M3 12h18M3 18h12"/></svg>;
    case "bell":     return <svg {...c}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    case "lightning":return <svg {...c}><path d="M13 2L4 14h8l-1 8 9-12h-8l1-8z"/></svg>;
    case "play":     return <svg {...c}><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>;
    case "stop":     return <svg {...c}><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg>;
    case "pause":    return <svg {...c}><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>;
    case "monitor":  return <svg {...c}><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg>;
    case "smartphone":return <svg {...c}><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 18h.01"/></svg>;
    case "clock":    return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "info":     return <svg {...c}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>;
    case "tablet":   return <svg {...c}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></svg>;
    case "dot":      return <svg {...c}><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>;
    case "grip":     return <svg {...c}><circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/></svg>;
    case "note":     return <svg {...c}><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z"/><path d="M14 3v7h7"/><path d="M8 14h6M8 17h4"/></svg>;
    case "copy":     return <svg {...c}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    case "save":     return <svg {...c}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>;
    default: return null;
  }
}

// =============== Avatar ===============
function Avatar({ name, initials, size = "md", tone }) {
  const ini = initials || (name ? name.split(" ").map(p => p[0]).slice(0,2).join("") : "?");
  const sz = size === "sm" ? "avatar-sm" : size === "lg" ? "avatar-lg" : size === "xl" ? "avatar-xl" : "avatar-md";
  // tone palette
  const tones = ["indigo", "navy", "azzurro", "oro"];
  const hash = (name || "").split("").reduce((s,c) => s + c.charCodeAt(0), 0);
  const t = tone || tones[hash % tones.length];
  const map = {
    indigo:  { bg: "var(--indigo-100)", fg: "var(--indigo-600)" },
    navy:    { bg: "#E3E8EE",            fg: "var(--navy)" },
    azzurro: { bg: "var(--azzurro-bg)",  fg: "var(--azzurro)" },
    oro:     { bg: "var(--oro-bg)",      fg: "#8A6E1A" }
  };
  const s = map[t];
  return <span className={`avatar ${sz}`} style={{ background: s.bg, color: s.fg }}>{ini}</span>;
}

// =============== Badge ===============
function Badge({ tone = "neutral", children, dot, size }) {
  return <span className={`badge badge-${tone} ${dot ? "badge-dot" : ""} ${size === "lg" ? "badge-lg" : ""}`}>{children}</span>;
}

// =============== Status badge (course health) ===============
function StatusBadge({ status, size }) {
  const map = {
    "in-traiettoria": { tone: "success", label: "In traiettoria", dot: true },
    "monitor":        { tone: "neutral", label: "Da monitorare", dot: true },
    "rischio":        { tone: "warning", label: "A rischio",     dot: true },
    "critico":        { tone: "danger",  label: "Critico",       dot: true }
  };
  const m = map[status];
  if (!m) return null;
  return <Badge tone={m.tone} size={size} dot={m.dot}>{m.label}</Badge>;
}

// =============== KPI ===============
function KPI({ label, value, unit, sub, delta, deltaDir, accent, anim }) {
  return (
    <div className={`kpi ${anim ? "kpi-anim" : ""}`}>
      {accent && <span className={`kpi-accent ${accent}`}></span>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {(delta || sub) && (
        <div>
          {delta && (
            <span className={`kpi-delta ${deltaDir === "up" ? "up" : deltaDir === "dn" ? "dn" : ""}`}>
              {deltaDir === "up" ? <Icon name="arrow-up" size={11}/> : deltaDir === "dn" ? <Icon name="arrow-dn" size={11}/> : null}
              {delta}
            </span>
          )}
          {sub && <div className="kpi-foot">{sub}</div>}
        </div>
      )}
    </div>
  );
}

// =============== Crumbs ===============
function Crumbs({ items }) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span className="sep">/</span>}
          {it.href ? <a href={it.href}>{it.label}</a> : <span className="current">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

// =============== Page header ===============
function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <div className="page-header">
      <div className="page-title-block">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// =============== Routing helpers ===============
function useRoute() {
  const parse = () => {
    const h = (location.hash || "#/dashboard").replace(/^#/, "");
    const [path, queryStr] = h.split("?");
    const parts = path.replace(/^\//, "").split("/").filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryStr || ""));
    return { path: parts, raw: h, query };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

window.V2 = {
  Icon, Avatar, Badge, StatusBadge, KPI, Crumbs, PageHeader, useRoute, useAppState
};

// Re-render quando cambia lo stato globale app (utente, abilitazioni, soglie)
function useAppState() {
  const [, set] = useState(0);
  useEffect(() => {
    const h = () => set(x => x + 1);
    window.addEventListener("ssa-state", h);
    return () => window.removeEventListener("ssa-state", h);
  }, []);
}
