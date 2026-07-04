"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon, PageHeader, type AvatarTone } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { COURSE_TYPES, type CourseTypeKey, type RoleKey } from "@/lib/domain";
import {
  buildWindow,
  genDates,
  nextId,
  normalizePlanned,
  parseYmd,
  ymd,
  HUB_CITIES,
  NON_CITIES,
  type PlannedCourse,
  type PlannerEducator,
  type PlannerItem,
  type PlannerSaved,
} from "@/lib/pianificatore";
import { savePlannerStateAction } from "@/lib/pianificatore-actions";
import type { PrevYearItem } from "@/app/(app)/pianificatore/page";
import type { AddAt, AddExtra } from "./types";
import { PL_Views } from "./views";
import { PL_EngagementPanel, PL_SignalsPanel, PL_YoYPanel } from "./panels";
import { PL_ActionModal } from "./PL_ActionModal";
import { PL_AddModal, type AddForm } from "./PL_AddModal";
import { PL_ShareModal } from "./PL_ShareModal";
import { PL_TargetCard, type TargetCardData } from "./PL_TargetCard";

const PL_LS = "ssa_pian_v3";

interface PlTargets {
  intro: number;
  cert: number;
  citta: number;
  pass: number;
  somm: number;
}
const PL_DEFAULT_TARGETS: PlTargets = { intro: 10, cert: 6, citta: 6, pass: 75, somm: 60 };

interface PlThresholds {
  conflictDays: number;
  canniDays: number;
}
const PL_DEFAULT_THRESHOLDS: PlThresholds = { conflictDays: 10, canniDays: 30 };

interface PlSaved {
  view?: string;
  scenario?: boolean;
  targets?: Partial<PlTargets>;
  planned?: PlannedCourse[];
  thresholds?: Partial<PlThresholds>;
}

function plLoad(): PlSaved {
  try {
    return JSON.parse(localStorage.getItem(PL_LS) || "{}") as PlSaved;
  } catch {
    return {};
  }
}
function plSave(patch: PlSaved) {
  const cur = plLoad();
  localStorage.setItem(PL_LS, JSON.stringify({ ...cur, ...patch }));
}

// Reconcile the persisted manual-planning layer against the live Shopify courses.
// Removes (a) the old demo seeds (ids "pl-seed-*") that were never real courses,
// and (b) any manual plan that now exists as a real Shopify course (same type +
// city + month/year) so it doesn't show as a phantom duplicate. Genuine forward
// plans not yet on Shopify are kept. Pure → safe in a useState initializer.
function plReconcile(planned: PlannedCourse[], real: PlannerItem[]): PlannedCourse[] {
  const realKeys = new Set(
    real.map((r) => `${r.type}|${(r.city || "").trim().toLowerCase()}|${r.year}|${r.mIdx}`),
  );
  return planned.filter((p) => {
    if (p.id.startsWith("pl-seed-")) return false; // legacy demo seeds, not real plans
    let year = p.year ?? null;
    let mIdx = p.mIdx ?? null;
    if (p.dates && p.dates.length) {
      // parseYmd builds a LOCAL date — new Date("YYYY-MM-DD") parses as UTC, so
      // getMonth() could be off by one at month boundaries west of UTC and the
      // reconcile key would miss the matching Shopify course.
      const d = parseYmd(p.dates[0]);
      if (d && !Number.isNaN(d.getTime())) {
        year = d.getFullYear();
        mIdx = d.getMonth();
      }
    }
    if (year != null && mIdx != null) {
      const key = `${p.type}|${(p.city || "").trim().toLowerCase()}|${year}|${mIdx}`;
      if (realKeys.has(key)) return false; // already a real Shopify course → drop the dup
    }
    return true;
  });
}

export interface PianificatoreProps {
  realItems: PlannerItem[];
  prevYearItems: PrevYearItem[];
  educators: PlannerEducator[];
  examPassRate: number;
  studentsTotal: number;
  returningCount: number;
  me: {
    first: string;
    name: string;
    initials: string;
    tone: string;
    roleKey: RoleKey;
  };
  adminName: string | null;
  /** Server-persisted planner state (settings_kv); wins over localStorage. */
  initialSaved?: PlannerSaved | null;
}

export function Pianificatore({
  realItems,
  prevYearItems,
  educators,
  examPassRate,
  studentsTotal,
  returningCount,
  me,
  adminName,
  initialSaved,
}: PianificatoreProps) {
  const t = useT().pianificatore;
  const router = useRouter();
  // Server state wins over the local cache (so edits sync across devices).
  const saved0: PlSaved = { ...plLoad(), ...(initialSaved ?? {}) };

  const types = useMemo(() => Object.keys(COURSE_TYPES) as CourseTypeKey[], []);
  const typeLabels = useMemo(
    () =>
      types.reduce(
        (acc, k) => {
          acc[k] = COURSE_TYPES[k].label;
          return acc;
        },
        {} as Record<CourseTypeKey, string>,
      ),
    [types],
  );

  const win = useMemo(() => buildWindow(), []);

  const [view, setView] = useState<string>(() => saved0.view || "timeline");
  const [scenario, setScenario] = useState<boolean>(() =>
    saved0.scenario !== undefined ? saved0.scenario : true,
  );
  const [targets, setTargets] = useState<PlTargets>(() => ({
    ...PL_DEFAULT_TARGETS,
    ...(saved0.targets || {}),
  }));
  // Persisted manual plans, reconciled against live Shopify courses so phantom
  // entries (old demo seeds, or plans that are now real Shopify courses) drop out.
  const rawPlanned = saved0.planned ?? [];
  const [planned, setPlanned] = useState<PlannedCourse[]>(() =>
    plReconcile(rawPlanned, realItems),
  );
  // If reconciliation pruned anything, persist the cleaned state once on mount.
  const needsCleanSave = useRef(plReconcile(rawPlanned, realItems).length !== rawPlanned.length);
  const [thresholds, setThresholds] = useState<PlThresholds>(() => ({
    ...PL_DEFAULT_THRESHOLDS,
    ...(saved0.thresholds || {}),
  }));
  const [editTargets, setEditTargets] = useState(false);
  const [addAt, setAddAt] = useState<AddAt | null>(null);
  const [actItem, setActItem] = useState<PlannerItem | null>(null);
  const [share, setShare] = useState(false);

  // Persist on every change: instantly to localStorage (cache) + debounced to
  // the server (settings_kv) so the plan is durable and shared across devices.
  const canPersist = me.roleKey === "admin" || me.roleKey === "manager";
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    plSave({ view, scenario, targets, planned, thresholds });
    if (firstRender.current) {
      firstRender.current = false;
      return; // don't re-save the just-loaded state
    }
    if (!canPersist) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void savePlannerStateAction({ view, scenario, targets, planned, thresholds });
    }, 800);
  }, [view, scenario, targets, planned, thresholds, canPersist]);

  // Persist the reconciled (phantom-free) plan once if the load pruned anything,
  // so the cleanup sticks across sessions without waiting for a manual edit.
  useEffect(() => {
    if (needsCleanSave.current && canPersist) {
      needsCleanSave.current = false;
      void savePlannerStateAction({ view, scenario, targets, planned, thresholds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plannedItems = useMemo(
    () => planned.map((p) => normalizePlanned(p, educators)),
    [planned, educators],
  );
  const combined = useMemo(() => [...realItems, ...plannedItems], [realItems, plannedItems]);

  // ---- KPI ----
  const kpiItems = scenario ? combined : realItems;
  const countType = (ty: CourseTypeKey) => kpiItems.filter((i) => i.type === ty).length;
  const introN = countType("introduttivo");
  const certN = countType("certificato");
  const cittaCovered = new Set(
    kpiItems
      .filter((i) => i.city && !HUB_CITIES.includes(i.city) && !NON_CITIES.includes(i.city))
      .map((i) => i.city as string),
  );
  const cittaN = cittaCovered.size;
  const passRate = Math.round(examPassRate * 100);
  const certSeats = kpiItems
    .filter((i) => i.type === "certificato")
    .reduce((s, i) => s + (i.enrolled > 0 ? i.enrolled : i.capacity), 0);
  const sommN = Math.round(certSeats * examPassRate);
  const returningPct = studentsTotal ? Math.round((returningCount / studentsTotal) * 100) : 0;

  const plannedDelta = {
    intro: plannedItems.filter((i) => i.type === "introduttivo").length,
    cert: plannedItems.filter((i) => i.type === "certificato").length,
    citta: (() => {
      const r = new Set(
        realItems
          .filter((i) => i.city && !HUB_CITIES.includes(i.city) && !NON_CITIES.includes(i.city))
          .map((i) => i.city as string),
      );
      let n = 0;
      cittaCovered.forEach((c) => {
        if (!r.has(c)) n++;
      });
      return scenario ? n : 0;
    })(),
  };

  // ---- Handlers ----
  const requestAdd = (year: number, mIdx: number, extra?: AddExtra) =>
    setAddAt({ year, mIdx, ...(extra || {}) });

  const confirmAdd = (f: AddForm) => {
    setPlanned((arr) => [
      ...arr,
      {
        id: nextId(),
        type: f.type,
        mode: f.mode,
        dates: f.dates,
        city: f.city,
        educatorId: f.educatorId,
        note: f.note,
      },
    ]);
    setAddAt(null);
  };

  const dropMonth = (id: string, year: number | null, mIdx: number, extra: AddExtra) => {
    setPlanned((arr) =>
      arr.map((p) => {
        if (p.id !== id) return p;
        const norm = normalizePlanned(p, educators);
        const day = Math.min(norm.day || 14, 28);
        const yr = year || win.find((w) => w.mIdx === mIdx)?.year || norm.year || win[0].year;
        const start = ymd(new Date(yr, mIdx, day));
        const dates = genDates(start, p.type, p.mode || norm.mode || "presenza");
        return {
          ...p,
          dates,
          mIdx: undefined,
          year: undefined,
          city: extra.city !== undefined ? extra.city : p.city,
          educatorId: extra.educatorId !== undefined ? extra.educatorId : p.educatorId,
        };
      }),
    );
  };

  const patchPlanned = (id: string, patch: Partial<PlannedCourse>) =>
    setPlanned((arr) => arr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePlanned = (id: string) => {
    setPlanned((arr) => arr.filter((p) => p.id !== id));
    setActItem(null);
  };
  const onChipClick = (item: PlannerItem) => {
    if (item.kind === "real") router.push(`/corsi/${item.id}`);
    else setActItem(item);
  };

  const isAdmin = me.roleKey === "admin";
  const placedCount = combined.filter((c) => c.placed && c.mIdx !== null).length;

  const viewProps = {
    win,
    courses: combined,
    educators,
    onDropMonth: dropMonth,
    onRequestAdd: requestAdd,
    onChipClick,
  };

  const targetCards: TargetCardData[] = [
    { key: "intro", label: t.targets.introLabel, cur: introN, tgt: targets.intro, suffix: "", delta: plannedDelta.intro },
    { key: "cert", label: t.targets.certLabel, cur: certN, tgt: targets.cert, suffix: "", delta: plannedDelta.cert },
    { key: "citta", label: t.targets.cittaLabel, cur: cittaN, tgt: targets.citta, suffix: "", hint: t.targets.cittaHint, delta: plannedDelta.citta },
    { key: "pass", label: t.targets.passLabel, cur: passRate, tgt: targets.pass, suffix: "%", hint: t.targets.passHint },
    { key: "somm", label: t.targets.sommLabel, cur: sommN, tgt: targets.somm, suffix: "", hint: t.targets.sommHint },
  ];

  const segViews: { id: string; icon: string; label: string }[] = [
    { id: "heatmap", icon: "grid", label: t.calendar.viewHeatmap },
    { id: "timeline", icon: "calendar", label: t.calendar.viewTimeline },
    { id: "bars", icon: "trending", label: t.calendar.viewBars },
    { id: "city", icon: "pin", label: t.calendar.viewCity },
    { id: "edu", icon: "users", label: t.calendar.viewEdu },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={t.header.eyebrow}
        title={t.header.title}
        sub={t.header.sub}
        actions={
          <>
            <a
              href="/account"
              title={t.header.profileTip}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px 5px 6px",
                border: "1px solid var(--border)",
                borderRadius: 20,
                textDecoration: "none",
                background: "var(--surface)",
              }}
            >
              <Avatar name={me.name} initials={me.initials} tone={me.tone as AvatarTone} size="sm" />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                {me.first} ·{" "}
                <strong style={{ color: isAdmin ? "var(--indigo-600)" : "var(--text-3)" }}>
                  {isAdmin ? t.header.roleAdmin : t.header.roleManager}
                </strong>
              </span>
            </a>
            <button className="btn" onClick={() => setShare(true)}>
              <Icon name="share" size={13} />
              {t.header.share}
            </button>
          </>
        }
      />

      {/* ===== Obiettivi annuali ===== */}
      <section className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
        <div className="card-head" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {t.targets.title}
              {!isAdmin && (
                <span
                  title={t.targets.lockedTip}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "var(--text-3)",
                    fontWeight: 500,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-2)",
                    padding: "2px 7px",
                    borderRadius: 10,
                  }}
                >
                  <Icon name="lock" size={11} />
                  {t.targets.locked}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {t.targets.progressPrefix}
              {scenario ? t.targets.scenarioOn : t.targets.scenarioOff}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={`pill ${scenario ? "on" : ""}`}
              onClick={() => setScenario((s) => !s)}
              title={t.targets.includePlannedTip}
            >
              <Icon name="sparkle" size={11} />
              {t.targets.includePlanned}
            </button>
            {isAdmin ? (
              <button
                className={`btn btn-sm ${editTargets ? "btn-primary" : ""}`}
                onClick={() => setEditTargets((e) => !e)}
              >
                <Icon name={editTargets ? "check" : "edit"} size={12} />
                {editTargets ? t.targets.editDone : t.targets.edit}
              </button>
            ) : (
              <button className="btn btn-sm" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                <Icon name="lock" size={12} />
                {t.targets.lockedBtn}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {targetCards.map((c, i) => (
            <PL_TargetCard
              key={c.key}
              card={c}
              edit={editTargets && isAdmin}
              last={i === 4}
              onChange={(v) => setTargets((prev) => ({ ...prev, [c.key]: v }))}
            />
          ))}
        </div>
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--border-2)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11.5,
            color: "var(--text-3)",
          }}
        >
          <Icon name="info" size={12} />
          {t.targets.communityLabel}{" "}
          <strong className="num" style={{ color: "var(--text-2)" }}>
            {studentsTotal}
          </strong>{" "}
          {t.targets.communityTotal} ·{" "}
          <strong className="num" style={{ color: "var(--text-2)" }}>
            {returningPct}%
          </strong>{" "}
          {t.targets.communityReturning} {format(t.targets.communityPeople, { n: returningCount })}.
        </div>
      </section>

      {/* ===== Calendario multi-vista ===== */}
      <section className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div>
            <div className="h3">{t.calendar.title}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                marginTop: 2,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {t.calendar.hintPre}{" "}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  color: "var(--indigo-600)",
                  fontWeight: 600,
                }}
              >
                <Icon name="plus" size={11} />
                {t.calendar.hintLink}
              </span>{" "}
              {format(t.calendar.hintPost, { n: placedCount })}
            </div>
          </div>
          <div className="segmented">
            {segViews.map((sv) => (
              <button key={sv.id} className={view === sv.id ? "on" : ""} onClick={() => setView(sv.id)}>
                <Icon name={sv.icon as never} size={11} />
                {sv.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-pad" style={{ paddingTop: 18 }}>
          {view === "heatmap" && <PL_Views.Heatmap {...viewProps} />}
          {view === "timeline" && <PL_Views.Timeline {...viewProps} />}
          {view === "bars" && <PL_Views.BarsByType {...viewProps} types={types} typeLabels={typeLabels} />}
          {view === "city" && <PL_Views.CityMonthGrid {...viewProps} />}
          {view === "edu" && <PL_Views.EducatorMonthGrid {...viewProps} />}
        </div>
      </section>

      {/* ===== Segnali ===== */}
      <div style={{ marginBottom: 24 }}>
        <PL_SignalsPanel
          win={win}
          courses={combined}
          conflictDays={thresholds.conflictDays}
          canniDays={thresholds.canniDays}
          onThresholds={(patch) => setThresholds((prev) => ({ ...prev, ...patch }))}
          onAdd={(type, city, mIdx, year) =>
            setAddAt({
              type: type || undefined,
              city: city || undefined,
              mIdx: mIdx === null ? undefined : mIdx,
              year: year || undefined,
            })
          }
        />
      </div>

      {/* ===== Engagement + YoY ===== */}
      <section style={{ display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 24 }}>
        <PL_EngagementPanel courses={combined} educators={educators} />
        <PL_YoYPanel
          win={win}
          courses={combined}
          prevYearItems={prevYearItems}
          types={types}
          typeLabels={typeLabels}
        />
      </section>

      {addAt && (
        <PL_AddModal
          at={addAt}
          win={win}
          types={types}
          typeLabels={typeLabels}
          educators={educators}
          onConfirm={confirmAdd}
          onClose={() => setAddAt(null)}
        />
      )}
      {actItem && (
        <PL_ActionModal
          item={actItem}
          onNote={(note) => patchPlanned(actItem.id, { note })}
          onRemove={() => removePlanned(actItem.id)}
          onClose={() => setActItem(null)}
        />
      )}
      {share && <PL_ShareModal educators={educators} adminName={adminName} onClose={() => setShare(false)} />}
    </div>
  );
}
