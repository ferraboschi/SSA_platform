"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import {
  sortCourses,
  STATUS_RULE_KEYS,
  TAB_LIFECYCLE,
  type CatalogFilterOptions,
  type CatalogTab,
  type CourseListItem,
  type CourseSortKey,
  type SortDir,
} from "@/lib/corsi";
import { GridView, TableView, TimelineView } from "./CatalogViews";

type ViewMode = "timeline" | "grid" | "table";

export function CorsiCatalog({
  items,
  filterOptions,
}: {
  items: CourseListItem[];
  filterOptions: CatalogFilterOptions;
}) {
  const tr = useT();
  const t = tr.corsi.catalog;

  const [tab, setTab] = useState<CatalogTab>("attivi");
  const [view, setView] = useState<ViewMode>("timeline");
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterEdu, setFilterEdu] = useState("");
  const [sortKey, setSortKey] = useState<CourseSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showLegend, setShowLegend] = useState(false);

  const counts: Record<CatalogTab, number> = useMemo(() => {
    const c = { attivi: 0, bozze: 0, archiviati: 0, passati: 0 } as Record<CatalogTab, number>;
    for (const it of items) {
      if (it.lifecycle === "pubblicato") c.attivi++;
      else if (it.lifecycle === "bozza") c.bozze++;
      else if (it.lifecycle === "archiviato") c.archiviati++;
      else if (it.lifecycle === "passato") c.passati++;
    }
    return c;
  }, [items]);

  const list = useMemo(() => {
    let l = items.filter((c) => c.lifecycle === TAB_LIFECYCLE[tab]);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((c) => (c.shortTitle + c.city + c.educatorName).toLowerCase().includes(q));
    }
    if (filterCity) l = l.filter((c) => c.city === filterCity);
    if (filterType) l = l.filter((c) => c.type === filterType);
    if (filterEdu) l = l.filter((c) => c.educatorId === filterEdu);
    return sortCourses(l, sortKey, sortDir);
  }, [items, tab, search, filterCity, filterType, filterEdu, sortKey, sortDir]);

  const toggleSort = (key: CourseSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const tabs: { id: CatalogTab; label: string; n: number }[] = [
    { id: "attivi", label: t.tabPublished, n: counts.attivi },
    { id: "bozze", label: t.tabDrafts, n: counts.bozze },
    { id: "archiviati", label: t.tabArchived, n: counts.archiviati },
    { id: "passati", label: t.tabPast, n: counts.passati },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Icon name="download" size={13} />
            {t.export}
          </button>
          <a
            className="btn btn-primary"
            href="https://admin.shopify.com/store/sakesommelierassociation/products"
            target="_blank"
            rel="noopener"
            title={t.newCourseTip}
          >
            <Icon name="plus" size={13} />
            {t.newCourse}
            <Icon name="external" size={11} />
          </a>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            className={`tab ${tab === tb.id ? "active" : ""}`}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
            <span className="tab-count">{tb.n}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 300px" }}>
          <Icon name="search" size={14} className="topbar-search-icon" />
          <input
            className="input"
            placeholder={t.searchPlaceholder}
            style={{ paddingLeft: 32 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: "auto", minWidth: 130 }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">{t.allTypes}</option>
          {filterOptions.types.map((ty) => (
            <option key={ty.key} value={ty.key}>
              {ty.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto", minWidth: 130 }}
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
        >
          <option value="">{t.allCities}</option>
          {filterOptions.cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto", minWidth: 150 }}
          value={filterEdu}
          onChange={(e) => setFilterEdu(e.target.value)}
        >
          <option value="">{t.allEducators}</option>
          {filterOptions.educators.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto", minWidth: 170 }}
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(":");
            setSortKey(k as CourseSortKey);
            setSortDir(d as SortDir);
          }}
        >
          <option value="date:asc">{t.sortOptions.dateAsc}</option>
          <option value="date:desc">{t.sortOptions.dateDesc}</option>
          <option value="enrolled:desc">{t.sortOptions.enrolledDesc}</option>
          <option value="enrolled:asc">{t.sortOptions.enrolledAsc}</option>
          <option value="status:desc">{t.sortOptions.statusDesc}</option>
          <option value="revenue:desc">{t.sortOptions.revenueDesc}</option>
          <option value="margin:desc">{t.sortOptions.marginDesc}</option>
          <option value="margin:asc">{t.sortOptions.marginAsc}</option>
          <option value="city:asc">{t.sortOptions.cityAsc}</option>
          <option value="educator:asc">{t.sortOptions.educatorAsc}</option>
        </select>
        <button
          className={`btn ${showLegend ? "btn-primary" : ""}`}
          onClick={() => setShowLegend((s) => !s)}
          title={t.statusRuleTip}
        >
          <Icon name="warn" size={12} />
          {t.statusRuleBtn}
        </button>
        <div style={{ flex: 1 }} />
        <div className="segmented">
          <button className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}>
            <Icon name="timeline" size={11} />
            {t.viewTimeline}
          </button>
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
            <Icon name="grid" size={11} />
            {t.viewGrid}
          </button>
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>
            <Icon name="list" size={11} />
            {t.viewTable}
          </button>
        </div>
      </div>

      {showLegend && <StatusRuleLegend onClose={() => setShowLegend(false)} />}

      <div
        style={{
          fontSize: 12,
          color: "var(--text-3)",
          marginBottom: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>{format(list.length === 1 ? t.resultOne : t.resultMany, { n: list.length })}</span>
        <span style={{ color: "var(--text-mute)" }}>·</span>
        <span style={{ color: "var(--text-4)" }}>
          {t.sortedBy} <strong style={{ color: "var(--text-3)" }}>{t.sortFields[sortKey]}</strong>{" "}
          {sortDir === "asc" ? "↑" : "↓"}
        </span>
      </div>

      {view === "timeline" && <TimelineView courses={list} />}
      {view === "grid" && <GridView courses={list} />}
      {view === "table" && (
        <TableView courses={list} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      )}

      {list.length === 0 && (
        <div
          style={{
            padding: 80,
            textAlign: "center",
            color: "var(--text-3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            {t.emptyTitle}
          </div>
          <div style={{ fontSize: 13 }}>{t.emptyHint}</div>
        </div>
      )}
    </div>
  );
}

const LEGEND_TONES: Record<string, { bg: string; fg: string; dot: string }> = {
  "in-traiettoria": { bg: "var(--success-bg)", fg: "var(--success-fg)", dot: "var(--success)" },
  monitor: { bg: "#EEF2F6", fg: "var(--text-2)", dot: "var(--text-mute)" },
  rischio: { bg: "var(--warning-bg)", fg: "var(--warning-fg)", dot: "var(--warning)" },
  critico: { bg: "var(--danger-bg)", fg: "var(--danger-fg)", dot: "var(--danger)" },
};

function StatusRuleLegend({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const t = tr.corsi.catalog;
  const rules = tr.corsi.statusRules;

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-2)",
          background: "var(--indigo-50)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="warn" size={14} className="text-2" />
          <span className="eyebrow">{t.legendTitle}</span>
        </div>
        <button className="btn btn-icon btn-sm btn-ghost" onClick={onClose}>
          <Icon name="x" size={12} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STATUS_RULE_KEYS.map((key, i) => {
          const tone = LEGEND_TONES[key];
          return (
            <div
              key={key}
              style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid var(--border-2)" : "none" }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: tone.bg,
                  color: tone.fg,
                  fontSize: 11,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot }} />
                {tr.status[key]}
              </div>
              <div
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 4, lineHeight: 1.35 }}
              >
                {rules[key].rule}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>
                {rules[key].detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
