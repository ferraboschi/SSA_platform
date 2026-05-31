"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Badge, Icon } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { NAV_ITEMS, type NavGroup } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { SearchEntry, SearchIndex } from "@/lib/shell";

interface ResultItem {
  id: string;
  title: string;
  sub?: string;
  icon: IconName;
  href: string;
  badge?: string;
  badgeTone?: SearchEntry["badgeTone"];
}

interface ResultGroup {
  key: string;
  label: string;
  items: ResultItem[];
}

export function GlobalSearch({
  index,
  nav,
}: {
  index: SearchIndex;
  nav: NavGroup[];
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prevQ, setPrevQ] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const visiblePageIds = useMemo(
    () => new Set(nav.flatMap((g) => g.items.map((it) => it.id))),
    [nav],
  );

  const groups = useMemo<ResultGroup[]>(() => {
    const lq = q.toLowerCase().trim();
    if (!lq) return [];
    const match = (e: SearchEntry) => e.haystack.includes(lq);
    const toItem = (e: SearchEntry): ResultItem => ({
      id: e.id,
      title: e.title,
      sub: e.sub,
      icon: e.icon as IconName,
      href: e.href,
      badge: e.badge,
      badgeTone: e.badgeTone,
    });

    const pages: ResultItem[] = NAV_ITEMS.filter(
      (it) => visiblePageIds.has(it.id),
    )
      .map((it) => ({
        id: it.id,
        title: itemLabel(t, it.id),
        icon: it.icon,
        href: it.href,
      }))
      .filter((p) => p.title.toLowerCase().includes(lq));

    return [
      { key: "corsi", label: itemLabel(t, "corsi"), items: index.corsi.filter(match).slice(0, 6).map(toItem) },
      { key: "corsisti", label: itemLabel(t, "corsisti"), items: index.corsisti.filter(match).slice(0, 6).map(toItem) },
      { key: "educator", label: itemLabel(t, "educator"), items: index.educator.filter(match).slice(0, 6).map(toItem) },
      { key: "pages", label: t.topbar.pages, items: pages.slice(0, 6) },
    ].filter((g) => g.items.length > 0);
  }, [q, index, t, visiblePageIds]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset highlight when the query changes — derived during render (the
  // React-recommended alternative to a setState-in-effect).
  if (q !== prevQ) {
    setPrevQ(q);
    setActiveIdx(0);
  }

  const go = (item: ResultItem) => {
    router.push(item.href);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="topbar-search" style={{ position: "relative" }}>
      <Icon name="search" size={14} className="topbar-search-icon" />
      <input
        ref={inputRef}
        placeholder={t.topbar.searchPlaceholder}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && flat[activeIdx]) {
            e.preventDefault();
            go(flat[activeIdx]);
          }
        }}
      />
      <span className="topbar-search-kbd">⌘K</span>

      {open && (
        <Dropdown
          q={q}
          groups={groups}
          flat={flat}
          activeIdx={activeIdx}
          setActiveIdx={setActiveIdx}
          onPick={go}
        />
      )}
    </div>
  );
}

function Dropdown({
  q,
  groups,
  flat,
  activeIdx,
  setActiveIdx,
  onPick,
}: {
  q: string;
  groups: ResultGroup[];
  flat: ResultItem[];
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onPick: (r: ResultItem) => void;
}) {
  const t = useT();

  if (q && flat.length === 0) {
    return (
      <div className="topbar-search-pop">
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: "var(--text-3)",
            fontSize: 13,
          }}
        >
          {t.topbar.noResults} «{q}»
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="topbar-search-pop">
        <div
          style={{
            padding: "12px 14px",
            fontSize: 11.5,
            color: "var(--text-3)",
            lineHeight: 1.5,
          }}
        >
          {t.topbar.searchHint}
        </div>
      </div>
    );
  }

  let counter = 0;
  return (
    <div className="topbar-search-pop">
      {groups.map((g) => (
        <Fragment key={g.key}>
          <div className="search-section-label">
            <span>{g.label}</span>
            <span className="num" style={{ color: "var(--text-4)", fontWeight: 500 }}>
              {g.items.length}
            </span>
          </div>
          {g.items.map((r) => {
            const idx = counter++;
            const active = idx === activeIdx;
            return (
              <button
                key={`${g.key}-${r.id}`}
                className={`search-result ${active ? "active" : ""}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => onPick(r)}
              >
                <span className="search-result-icon">
                  <Icon name={r.icon} size={13} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div className="search-result-title">{highlight(r.title, q)}</div>
                  {r.sub && <div className="search-result-sub">{r.sub}</div>}
                </span>
                {r.badge && <Badge tone={r.badgeTone || "neutral"}>{r.badge}</Badge>}
                <span style={{ color: "var(--text-4)" }}>
                  <Icon name="arrow" size={11} />
                </span>
              </button>
            );
          })}
        </Fragment>
      ))}
      <div className="search-foot">
        <span>
          <kbd>↑↓</kbd> {t.common.navigate}
        </span>
        <span>
          <kbd>⏎</kbd> {t.common.open}
        </span>
        <span>
          <kbd>esc</kbd> {t.common.close}
        </span>
        <span style={{ flex: 1 }}></span>
        <span className="num">
          {flat.length} {t.topbar.resultsCount}
        </span>
      </div>
    </div>
  );
}

function highlight(text: string, q: string): ReactNode {
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "var(--indigo-50)",
          color: "var(--indigo-600)",
          padding: "0 1px",
          borderRadius: 2,
          fontWeight: 600,
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

type T = ReturnType<typeof useT>;
function itemLabel(t: T, id: string): string {
  const items = t.nav.items as Record<string, string>;
  return items[id] ?? id;
}
