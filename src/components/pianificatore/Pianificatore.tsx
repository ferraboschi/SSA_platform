"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon, PageHeader, type AvatarTone } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { COURSE_TYPES, type CourseTypeKey, type RoleKey } from "@/lib/domain";
import {
  buildWindow,
  genDates,
  nextId,
  normalizePlanned,
  ymd,
  HUB_CITIES,
  NON_CITIES,
  type PlannedCourse,
  type PlannerEducator,
  type PlannerItem,
} from "@/lib/pianificatore";
import type { PrevYearItem } from "@/app/(app)/pianificatore/page";
import type { AddAt, AddExtra } from "./types";
import { PL_Views } from "./views";
import { PL_EngagementPanel, PL_SignalsPanel, PL_YoYPanel } from "./panels";
import {
  PL_ActionModal,
  PL_AddModal,
  PL_ShareModal,
  PL_TargetCard,
  type AddForm,
  type TargetCardData,
} from "./modals";

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

// Two example planned courses seeded so the feature is visible on first load.
// Deterministic ids keep this pure (safe to call from a useState initializer).
function plSeedPlanned(): PlannedCourse[] {
  return [
    {
      id: "pl-seed-intro",
      type: "introduttivo",
      mode: "online",
      city: "Bologna",
      educatorId: "e7",
      dates: genDates("2027-01-13", "introduttivo", "online"),
    },
    {
      id: "pl-seed-cert",
      type: "certificato",
      mode: "presenza",
      city: "Torino",
      educatorId: "e6",
      dates: genDates("2027-02-10", "certificato", "presenza"),
    },
  ];
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
}: PianificatoreProps) {
  const t = useT().pianificatore;
  const router = useRouter();

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

  const [view, setView] = useState<string>(() => plLoad().view || "timeline");
  const [scenario, setScenario] = useState<boolean>(() => {
    const s = plLoad().scenario;
    return s !== undefined ? s : true;
  });
  const [targets, setTargets] = useState<PlTargets>(() => ({
    ...PL_DEFAULT_TARGETS,
    ...(plLoad().targets || {}),
  }));
  const [planned, setPlanned] = useState<PlannedCourse[]>(
    () => plLoad().planned || plSeedPlanned(),
  );
  const [thresholds, setThresholds] = useState<PlThresholds>(() => ({
    ...PL_DEFAULT_THRESHOLDS,
    ...(plLoad().thresholds || {}),
  }));
  const [editTargets, setEditTargets] = useState(false);
  const [addAt, setAddAt] = useState<AddAt | null>(null);
  const [actItem, setActItem] = useState<PlannerItem | null>(null);
  const [share, setShare] = useState(false);

  // Persist state to localStorage on every change (client-only external sync).
  useEffect(() => {
    plSave({ view, scenario, targets, planned, thresholds });
  }, [view, scenario, targets, planned, thresholds]);

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
