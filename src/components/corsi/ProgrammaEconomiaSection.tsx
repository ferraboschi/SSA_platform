"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge, Icon, KPI } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { ProgrammaData, TemplateData } from "@/lib/corsi";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey, Sake } from "@/lib/domain";
import {
  StockBadge,
  LOW_STOCK,
  type ScCatalogItem,
} from "@/components/sake/SakeProductPicker";
import { fetchSakeCatalog } from "@/lib/integrations/sakecompany/actions";
import { deleteTemplateAction } from "@/lib/data/template-actions";
import { saveCourseProgramAction } from "@/lib/corsi/program-actions";
import type { CourseProgramOverlay } from "@/lib/corsi/program-overlay";

/** Bottles needed per SKU: one bottle covers ~15 students. */
export function bottlesForStudents(enrolled: number): number {
  const n = Math.max(0, enrolled);
  return Math.ceil(n / 15) || (n > 0 ? 1 : 0);
}

const TEMPLATE_TYPE_KEYS = (Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((key) => ({
  key,
  label: COURSE_TYPES[key].label,
}));

interface SakeState extends Sake {
  id: string;
}
interface DayState {
  id: string;
  day: number;
  name: string;
  sakes: SakeState[];
}
interface CostLine {
  id: string;
  label: string;
  value: number;
  source?: string;
  custom?: boolean;
}

const fmtIt = (n: number) => n.toLocaleString("it-IT");

export function ProgrammaEconomiaSection({
  courseId,
  data,
  programOverlay,
  templates: initialTemplates,
}: {
  courseId: string;
  data: ProgrammaData;
  programOverlay?: CourseProgramOverlay;
  templates: TemplateData[];
}) {
  const tr = useT();
  const t = tr.corsi.programma;

  const [days, setDays] = useState<DayState[]>(() =>
    // A saved overlay (operator edits) wins over the base program from the DB.
    programOverlay?.days
      ? programOverlay.days.map((d) => ({
          id: d.id,
          day: d.day,
          name: d.name,
          sakes: d.sakes.map((sk) => ({ ...sk })),
        }))
      : data.program.map((sec, di) => ({
          id: `day-${di + 1}`,
          day: sec.day,
          name: sec.name,
          sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-${di + 1}-${si}`, note: "" })),
        })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>(initialTemplates);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const dragRef = useRef<{ dayId: string; sakeId: string } | null>(null);
  const handleDragStart = (dayId: string, sakeId: string) => {
    dragRef.current = { dayId, sakeId };
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (targetDayId: string, targetSakeId: string) => {
    if (!dragRef.current) return;
    const { dayId: srcDay, sakeId: srcSake } = dragRef.current;
    if (srcDay === targetDayId && srcSake === targetSakeId) return;
    setDays((arr) => {
      const next = arr.map((d) => ({ ...d, sakes: [...d.sakes] }));
      const srcDayObj = next.find((d) => d.id === srcDay);
      const tgtDayObj = next.find((d) => d.id === targetDayId);
      if (!srcDayObj || !tgtDayObj) return arr;
      const srcIdx = srcDayObj.sakes.findIndex((s) => s.id === srcSake);
      const [moved] = srcDayObj.sakes.splice(srcIdx, 1);
      const tgtIdx = tgtDayObj.sakes.findIndex((s) => s.id === targetSakeId);
      tgtDayObj.sakes.splice(tgtIdx === -1 ? tgtDayObj.sakes.length : tgtIdx, 0, moved);
      return next;
    });
    dragRef.current = null;
  };

  const updateSake = (dayId: string, sakeId: string, patch: Partial<SakeState>) =>
    setDays((arr) =>
      arr.map((d) =>
        d.id === dayId ? { ...d, sakes: d.sakes.map((s) => (s.id === sakeId ? { ...s, ...patch } : s)) } : d,
      ),
    );
  const removeSake = (dayId: string, sakeId: string) =>
    setDays((arr) =>
      arr.map((d) => (d.id === dayId ? { ...d, sakes: d.sakes.filter((s) => s.id !== sakeId) } : d)),
    );

  const newSake = (): SakeState => {
    const k = Math.floor(Math.random() * 900) + 100;
    return {
      id: `sake-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: `SAK${k}`,
      name: t.newSakeName,
      type: "Junmai",
      sakagura: "—",
      size: 720,
      cost: 35,
      qty: 1,
      note: "",
    };
  };
  const addSakeToDay = (dayId: string) =>
    setDays((arr) => arr.map((d) => (d.id === dayId ? { ...d, sakes: [...d.sakes, newSake()] } : d)));
  const addDay = () =>
    setDays((arr) => {
      const n = arr.length + 1;
      return [...arr, { id: `day-new-${Date.now()}`, day: n, name: format(t.newDayName, { n }), sakes: [] }];
    });
  const removeDay = (dayId: string) =>
    setDays((arr) => arr.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, day: i + 1 })));
  const renameDay = (dayId: string, name: string) =>
    setDays((arr) => arr.map((d) => (d.id === dayId ? { ...d, name } : d)));

  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const handleDayDrop = (targetDayId: string) => {
    setDragOverDay(null);
    if (!dragRef.current) return;
    const { dayId: srcDay, sakeId: srcSake } = dragRef.current;
    setDays((arr) => {
      const next = arr.map((d) => ({ ...d, sakes: [...d.sakes] }));
      const srcDayObj = next.find((d) => d.id === srcDay);
      const tgtDayObj = next.find((d) => d.id === targetDayId);
      if (!srcDayObj || !tgtDayObj) return arr;
      const srcIdx = srcDayObj.sakes.findIndex((s) => s.id === srcSake);
      if (srcIdx === -1) return arr;
      const [moved] = srcDayObj.sakes.splice(srcIdx, 1);
      tgtDayObj.sakes.push(moved);
      return next;
    });
    dragRef.current = null;
  };

  // Live Sake Company catalog (stock + cost), keyed by SKU. Drives the stock
  // check and the bottle-based cost in the conto economico.
  const [catBySku, setCatBySku] = useState<Map<string, ScCatalogItem>>(new Map());
  useEffect(() => {
    let alive = true;
    fetchSakeCatalog()
      .then((c) => {
        if (!alive) return;
        const m = new Map<string, ScCatalogItem>();
        for (const it of c) if (it.sku) m.set(it.sku, it);
        setCatBySku(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const enrolled = data.enrolled || 0;
  const bottlesPerSku = bottlesForStudents(enrolled);

  // Legacy line cost (stored cost × qty) — fallback before the catalog loads
  // or when the course has no enrollees yet.
  const legacySakeCost = useMemo(
    () => days.reduce((s, p) => s + p.sakes.reduce((ss, sk) => ss + sk.cost * sk.qty, 0), 0),
    [days],
  );
  const totalSakes = days.reduce((s, p) => s + p.sakes.length, 0);

  // Real bottle cost: bottlesPerSku × live cost (fallback to stored cost) per SKU.
  const liveBottleCost = useMemo(
    () =>
      days.reduce(
        (s, p) =>
          s +
          p.sakes.reduce((ss, sk) => {
            const live = (sk.code && catBySku.get(sk.code)?.cost) || sk.cost;
            return ss + bottlesPerSku * live;
          }, 0),
        0,
      ),
    [days, catBySku, bottlesPerSku],
  );

  // Use the bottle-based cost when we actually know enrollees; else legacy.
  const useBottles = enrolled > 0;
  const sakeCost = useBottles ? liveBottleCost : legacySakeCost;

  // Per-SKU stock check (each program SKU once; need = bottlesPerSku).
  const stockCheck = useMemo(() => {
    const seen = new Map<string, { sake: SakeState; need: number }>();
    for (const d of days)
      for (const sk of d.sakes)
        if (sk.code && !seen.has(sk.code)) seen.set(sk.code, { sake: sk, need: bottlesPerSku });
    const rows = [...seen.values()].map(({ sake, need }) => {
      const item = catBySku.get(sake.code);
      const stock = item?.stock ?? null;
      const insufficient = stock != null && stock < need;
      const low = stock != null && !insufficient && stock < LOW_STOCK;
      return { sake, need, item, stock, insufficient, low };
    });
    return rows;
  }, [days, catBySku, bottlesPerSku]);
  const insufficientCount = stockCheck.filter((r) => r.insufficient).length;
  const catalogReady = catBySku.size > 0;

  const autoLines: CostLine[] = [
    {
      id: "sake",
      label: t.sakeProgram,
      value: sakeCost,
      source: useBottles
        ? format(t.sakeBottles, { n: totalSakes, b: bottlesPerSku, s: enrolled })
        : format(t.sakeSource, { n: totalSakes }),
    },
  ];

  const [customLines, setCustomLines] = useState<CostLine[]>(() =>
    programOverlay?.customLines && programOverlay.customLines.length
      ? programOverlay.customLines.map((l) => ({ ...l }))
      : [
          { id: "ssa_fee", label: t.costGestione, value: data.costGestione || 900 },
          { id: "location", label: t.costLocation, value: data.costLocation || 0 },
          { id: "food", label: t.costFood, value: data.costFood || 0 },
          { id: "adv", label: t.costAdv, value: data.costAdv || 0 },
        ],
  );

  // Mark unsaved once the operator changes anything (skip the initial render).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) setDirty(true);
    else mounted.current = true;
  }, [days, customLines]);

  const handleSaveProgram = () => {
    startSave(async () => {
      const overlay: CourseProgramOverlay = { days, customLines };
      const res = await saveCourseProgramAction(courseId, overlay);
      if (res.ok) {
        setDirty(false);
        showToast(t.programSaved);
      } else {
        showToast(res.error || t.programSaveError);
      }
    });
  };

  const totalAuto = autoLines.reduce((s, l) => s + l.value, 0);
  const totalCustom = customLines.reduce((s, l) => s + l.value, 0);
  const totalCost = totalAuto + totalCustom;
  const margin = data.revenue - totalCost;
  const marginPct = data.revenue ? Math.round((margin / data.revenue) * 100) : 0;
  const marginPerIscritto = data.enrolled ? Math.round(margin / data.enrolled) : 0;

  const updateCustom = (id: string, patch: Partial<CostLine>) =>
    setCustomLines((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addCustom = () =>
    setCustomLines((arr) => [...arr, { id: `custom-${Date.now()}`, label: t.customLineLabel, value: 0, custom: true }]);
  const removeCustom = (id: string) => setCustomLines((arr) => arr.filter((l) => l.id !== id));

  const showToast = (msg: string) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(null), 3500);
  };

  const applyTemplate = (template: TemplateData) => {
    const tplDays = template.days.length;
    setDays((prev) => {
      const courseDays = prev.length;
      if (tplDays > courseDays) {
        const extend = window.confirm(
          format(t.confirmExtend, { name: template.name, tpl: tplDays, course: courseDays }),
        );
        if (!extend) return prev;
        const built: DayState[] = template.days.map((sec, di) => ({
          id: `day-tpl-${di + 1}-${Date.now()}`,
          day: di + 1,
          name: sec.name,
          sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-t-${di + 1}-${si}-${Date.now()}` })),
        }));
        setTemplateModal(false);
        showToast(format(t.toastExtended, { n: tplDays, name: template.name }));
        return built;
      }
      const next: DayState[] = prev.map((d, di) => {
        if (di < tplDays) {
          const sec = template.days[di];
          return {
            id: d.id,
            day: di + 1,
            name: sec.name,
            sakes: sec.sakes.map((sk, si) => ({ ...sk, id: `sake-t-${di + 1}-${si}-${Date.now()}` })),
          };
        }
        return { ...d, day: di + 1 };
      });
      setTemplateModal(false);
      const extra = courseDays - tplDays;
      showToast(
        extra > 0
          ? format(extra === 1 ? t.toastAppliedFirstOne : t.toastAppliedFirstMany, {
              name: template.name,
              n: tplDays,
              x: extra,
            })
          : format(t.toastApplied, { name: template.name }),
      );
      return next;
    });

    // #10: bring the template's COSTS into the course economics (materialized
    // for the current enrolled count) so they're really present after applying.
    const m = template.materiali;
    if (m) {
      const enrolled = data.enrolled || 0;
      const days = template.days.length;
      const lines: CostLine[] = [
        { id: "ssa_fee", label: t.costGestione, value: Math.round((m.gestionePerDay || 0) * days) },
        { id: "educator", label: "Educator", value: Math.round((m.educatorPerDay || 0) * days), custom: true },
        { id: "diplomi", label: "Diplomi", value: Math.round((m.diplomaPerStudent || 0) * enrolled), custom: true },
        { id: "libri", label: "Libri", value: Math.round((m.libroPerStudent || 0) * enrolled), custom: true },
        { id: "location", label: t.costLocation, value: m.location || 0 },
        { id: "food", label: t.costFood, value: m.foodPairing || 0 },
        { id: "adv", label: t.costAdv, value: m.adv || 0 },
      ];
      if (m.cocktailFee) lines.push({ id: "cocktail", label: "Cocktail", value: m.cocktailFee, custom: true });
      if (m.accommodation) lines.push({ id: "accommodation", label: "Alloggio", value: m.accommodation, custom: true });
      if (m.transport) lines.push({ id: "transport", label: "Trasporto", value: m.transport, custom: true });
      for (const e of m.extra ?? []) {
        const mult = e.per === "iscritto" ? enrolled : 1;
        lines.push({ id: `tpl-${e.id}`, label: e.label, value: Math.round((e.value || 0) * mult), custom: true });
      }
      setCustomLines(lines);
    }
  };

  return (
    <div>
      {savedToast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--navy)",
            color: "white",
            padding: "10px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "var(--sh-3)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="check" size={13} />
          {savedToast}
        </div>
      )}

      {/* Financial KPI strip */}
      <div className="kpi-grid cols-4" style={{ marginBottom: 20 }}>
        <KPI
          label={t.kpiRevenue}
          value={fmtIt(data.revenue)}
          unit="€"
          sub={format(t.kpiAvgPrice, { n: data.enrolled, p: data.price })}
          accent="indigo"
        />
        <KPI
          label={t.kpiTotalCosts}
          value={fmtIt(totalCost)}
          unit="€"
          sub={format(t.kpiSakeVariable, { s: fmtIt(sakeCost), v: fmtIt(totalCustom) })}
        />
        <KPI
          label={t.kpiNetMargin}
          value={`${margin >= 0 ? "+" : ""}${fmtIt(margin)}`}
          unit="€"
          sub={format(t.kpiOnRevenue, { n: marginPct })}
          accent={margin >= 0 ? "green" : "danger"}
        />
        <KPI
          label={t.kpiMarginPerStudent}
          value={`${marginPerIscritto >= 0 ? "+" : ""}${marginPerIscritto}`}
          unit="€"
          sub={format(t.kpiBreakeven, { n: Math.ceil(totalCost / data.price) })}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        {/* LEFT: program */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="eyebrow">{t.programSake}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                {format(t.totalSakesCost, { n: totalSakes, c: fmtIt(sakeCost) })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {dirty && (
                <span className="text-3" style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--warning-fg)" }}>
                  <Icon name="edit" size={11} />
                  {t.programUnsaved}
                </span>
              )}
              <button className="btn btn-sm" onClick={() => setTemplateModal(true)}>
                <Icon name="copy" size={12} />
                {t.templateBtn}
              </button>
              <button className="btn btn-sm" onClick={addDay}>
                <Icon name="plus" size={12} />
                {t.addDay}
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleSaveProgram} disabled={saving || !dirty}>
                <Icon name="save" size={12} />
                {saving ? t.programSaving : t.saveProgram}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {days.map((sec) => (
              <div
                key={sec.id}
                className="card"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDay(sec.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOverDay(null);
                }}
                onDrop={() => handleDayDrop(sec.id)}
                style={{
                  outline: dragOverDay === sec.id ? "2px solid var(--indigo)" : "none",
                  outlineOffset: -1,
                  transition: "outline-color var(--dur-fast)",
                }}
              >
                <div className="card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 7,
                        background: "var(--indigo-50)",
                        color: "var(--indigo-600)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 600,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      G{sec.day}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span className="eyebrow">{format(t.dayN, { n: sec.day })}</span>
                      <input
                        value={sec.name}
                        onChange={(e) => renameDay(sec.id, e.target.value)}
                        className="h3"
                        style={{
                          marginTop: 1,
                          border: "1px solid transparent",
                          background: "transparent",
                          borderRadius: 4,
                          padding: "1px 4px",
                          marginLeft: -4,
                          width: "100%",
                          fontFamily: "inherit",
                        }}
                        onFocus={(e) => {
                          e.target.style.border = "1px solid var(--border)";
                          e.target.style.background = "var(--surface)";
                        }}
                        onBlur={(e) => {
                          e.target.style.border = "1px solid transparent";
                          e.target.style.background = "transparent";
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      {format(t.sakesCost, {
                        n: sec.sakes.length,
                        c: fmtIt(sec.sakes.reduce((s, k) => s + k.cost * k.qty, 0)),
                      })}
                    </span>
                    {days.length > 1 && (
                      <button
                        className="btn btn-icon btn-sm btn-ghost"
                        title={t.removeDayTip}
                        onClick={() => {
                          if (
                            sec.sakes.length === 0 ||
                            window.confirm(format(t.removeDayConfirm, { name: sec.name, n: sec.sakes.length }))
                          )
                            removeDay(sec.id);
                        }}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  {sec.sakes.map((s, i) => (
                    <SakeRow
                      key={s.id}
                      sake={s}
                      dayNo={sec.day}
                      isLast={i === sec.sakes.length - 1}
                      noteOpen={openNote === s.id}
                      catItem={s.code ? catBySku.get(s.code) : undefined}
                      need={bottlesPerSku}
                      onToggleNote={() => setOpenNote(openNote === s.id ? null : s.id)}
                      onUpdate={(p) => updateSake(sec.id, s.id, p)}
                      onRemove={() => removeSake(sec.id, s.id)}
                      onDragStart={() => handleDragStart(sec.id, s.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(sec.id, s.id)}
                    />
                  ))}
                  {sec.sakes.length === 0 && (
                    <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
                      {t.emptyDay}
                    </div>
                  )}
                </div>
                <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
                  <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => addSakeToDay(sec.id)}>
                    <Icon name="plus" size={12} />
                    {t.addSake}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: economics */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="eyebrow">{t.econTitle}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{t.econSub}</div>
            </div>
            <button className="btn btn-sm" onClick={addCustom}>
              <Icon name="plus" size={12} />
              {t.customLine}
            </button>
          </div>

          <div className="card">
            <div
              style={{
                padding: "10px 16px",
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "var(--ls-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-4)",
                }}
              >
                {t.automatic}
              </div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {fmtIt(totalAuto)} €
              </span>
            </div>
            {autoLines.map((line) => (
              <CostLineRow key={line.id} line={line} locked />
            ))}

            <div
              style={{
                padding: "10px 16px",
                background: "var(--surface-2)",
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "var(--ls-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-4)",
                }}
              >
                {t.editable}
              </div>
              <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {fmtIt(totalCustom)} €
              </span>
            </div>
            {customLines.map((line) => (
              <CostLineRow
                key={line.id}
                line={line}
                onChange={(p) => updateCustom(line.id, p)}
                onRemove={() => removeCustom(line.id)}
              />
            ))}

            <div
              style={{
                padding: "14px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                background: "var(--surface-2)",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.totalCosts}</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.01em" }}>
                {fmtIt(totalCost)} €
              </span>
            </div>
          </div>

          <div
            className="card card-pad"
            style={{
              marginTop: 12,
              background: margin >= 0 ? "var(--success-bg)" : "var(--danger-bg)",
              border: `1px solid ${margin >= 0 ? "var(--success)" : "var(--danger)"}`,
              boxShadow: "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
              <div>
                <div
                  className="eyebrow"
                  style={{ marginBottom: 6, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  {t.netMargin}
                </div>
                <div
                  className="num"
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)",
                    lineHeight: 1,
                  }}
                >
                  {margin >= 0 ? "+" : ""}
                  {fmtIt(margin)} €
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="eyebrow"
                  style={{ marginBottom: 4, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  %
                </div>
                <div
                  className="num"
                  style={{ fontSize: 22, fontWeight: 600, color: margin >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}
                >
                  {marginPct}%
                </div>
              </div>
            </div>
          </div>

          {/* Sake Company live stock check */}
          <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
            <div
              style={{
                padding: "11px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background:
                  insufficientCount > 0 ? "var(--danger-bg)" : "var(--surface-2)",
              }}
            >
              <Icon
                name={insufficientCount > 0 ? "warn" : "tag"}
                size={13}
                style={{
                  color:
                    insufficientCount > 0 ? "var(--danger-fg)" : "var(--text-3)",
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.stockTitle}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>
                  {format(t.stockSub, { b: bottlesPerSku, s: enrolled })}
                </div>
              </div>
              {insufficientCount > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--danger-fg)",
                    background: "var(--surface)",
                    padding: "2px 8px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {format(t.stockInsufficient, { n: insufficientCount })}
                </span>
              )}
            </div>

            {!catalogReady && (
              <div style={{ padding: "12px 16px", fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
                {t.stockNoCatalog}
              </div>
            )}
            {catalogReady && stockCheck.length === 0 && (
              <div style={{ padding: "12px 16px", fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
                {t.stockAllOk}
              </div>
            )}
            {catalogReady &&
              stockCheck.map((r) => (
                <div
                  key={r.sake.code}
                  style={{
                    padding: "9px 16px",
                    borderTop: "1px solid var(--border-2)",
                    borderLeft: `3px solid ${
                      r.insufficient ? "var(--danger)" : r.low ? "var(--warning)" : "transparent"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.item?.name ?? r.sake.name}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>
                      {r.sake.code} · {t.stockNeed} {r.need} {t.stockBottles}
                      {r.insufficient && (
                        <span style={{ color: "var(--danger-fg)", fontWeight: 600 }}>
                          {" "}· {t.stockSubstitute}
                        </span>
                      )}
                    </div>
                  </div>
                  <StockBadge stock={r.stock} />
                </div>
              ))}
          </div>
        </div>
      </div>

      {templateModal && (
        <TemplateLibraryModal
          templates={templates}
          courseType={data.type}
          onClose={() => setTemplateModal(false)}
          onApply={applyTemplate}
          onDelete={async (id) => {
            setTemplates((ts) => ts.filter((x) => x.id !== id)); // optimistic
            try {
              await deleteTemplateAction(id);
            } catch {
              /* keep optimistic removal; a refresh will reconcile */
            }
          }}
        />
      )}
    </div>
  );
}

function SakeRow({
  sake: s,
  dayNo,
  isLast,
  noteOpen,
  catItem,
  need,
  onToggleNote,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  sake: SakeState;
  dayNo: number;
  isLast: boolean;
  noteOpen: boolean;
  catItem?: ScCatalogItem;
  need?: number;
  onToggleNote: () => void;
  onUpdate: (patch: Partial<SakeState>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.programma;
  const [dragging, setDragging] = useState(false);
  const schedaUrl = `https://www.sakecompany.com/sake/${s.code.toLowerCase()}`;
  const hasNote = !!s.note && s.note.trim().length > 0;
  // `||` (not `??`): a null/0 catalog cost must fall back to the stored cost.
  const liveCost = catItem?.cost || s.cost;
  const stock = catItem?.stock ?? null;
  // Behaviour A: a product below the stock-alert limit, used in this course,
  // gets a red outline (a "to-watch" signal — no email is sent here).
  const lowStock = stock != null && stock < LOW_STOCK;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={lowStock ? `${t.stockKo} · ${stock} pz` : undefined}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-2)",
        borderLeft: lowStock ? "3px solid var(--danger-fg, #b42318)" : "3px solid transparent",
        opacity: dragging ? 0.4 : 1,
        background: dragging
          ? "var(--indigo-50)"
          : lowStock
            ? "var(--danger-bg, #fde8e6)"
            : "transparent",
        transition: "background var(--dur-fast)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "22px 40px 1fr auto auto", gap: 10, alignItems: "center", padding: "10px 16px" }}>
        <div
          draggable
          onDragStart={(e) => {
            setDragging(true);
            onDragStart();
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDragging(false)}
          title={t.dragTip}
          style={{
            cursor: "grab",
            color: "var(--text-mute)",
            display: "grid",
            placeItems: "center",
            width: 22,
            height: 28,
            borderRadius: 4,
            transition: "all var(--dur-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-2)";
            e.currentTarget.style.color = "var(--text-3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-mute)";
          }}
        >
          <Icon name="grip" size={14} />
        </div>

        <div className="ph-img" style={{ width: 40, height: 50, borderRadius: 3, fontSize: 9 }}>
          {s.code}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
            <a
              href={schedaUrl}
              target="_blank"
              rel="noopener"
              title={t.schedaTip}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10.5,
                color: "var(--indigo)",
                background: "var(--indigo-50)",
                fontWeight: 500,
              }}
            >
              <Icon name="external" size={9} />
              {t.sakeCompany}
            </a>
            {catItem && <StockBadge stock={stock} />}
            {catItem && need != null && stock != null && stock < need && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--danger-fg)",
                  background: "var(--danger-bg)",
                  padding: "1px 6px",
                  borderRadius: 999,
                }}
                title={t.stockSubstitute}
              >
                {t.stockKo}
              </span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
            {s.code} · {s.size}ML{dayNo ? ` · ${format(t.dayN, { n: dayNo })}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
            {s.type} · {s.sakagura}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 56 }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>
            {liveCost}€
          </div>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>
            ×{need != null && need > 0 ? need : s.qty}
          </div>
        </div>

        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-icon btn-sm btn-ghost"
            onClick={onToggleNote}
            title={hasNote ? t.editNote : t.addNote}
            style={{
              color: hasNote ? "var(--indigo)" : undefined,
              background: hasNote ? "var(--indigo-50)" : undefined,
              position: "relative",
            }}
          >
            <Icon name="note" size={13} />
            {hasNote && (
              <span
                style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--indigo)" }}
              />
            )}
          </button>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title={t.removeSakeTip}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {noteOpen && (
        <div style={{ padding: "0 16px 14px 60px" }}>
          <textarea
            className="textarea"
            placeholder={t.notePlaceholder}
            value={s.note || ""}
            onChange={(e) => onUpdate({ note: e.target.value })}
            autoFocus
            rows={2}
            style={{ width: "100%", fontSize: 12.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, gap: 6 }}>
            {s.note && (
              <button className="btn btn-sm btn-ghost" onClick={() => onUpdate({ note: "" })}>
                {t.noteClear}
              </button>
            )}
            <button className="btn btn-sm" onClick={onToggleNote}>
              {t.noteClose}
            </button>
          </div>
        </div>
      )}
      {!noteOpen && hasNote && (
        <div
          onClick={onToggleNote}
          style={{
            margin: "0 16px 12px 60px",
            padding: "8px 10px",
            background: "var(--indigo-50)",
            border: "1px solid var(--indigo-100)",
            borderRadius: 4,
            fontSize: 11.5,
            color: "var(--text-2)",
            cursor: "pointer",
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            lineHeight: 1.4,
          }}
        >
          <Icon name="note" size={11} className="text-3" />
          <span style={{ flex: 1 }}>{s.note}</span>
          <Icon name="edit" size={11} className="text-4" />
        </div>
      )}
    </div>
  );
}

function CostLineRow({
  line,
  locked,
  onChange,
  onRemove,
}: {
  line: CostLine;
  locked?: boolean;
  onChange?: (patch: Partial<CostLine>) => void;
  onRemove?: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.programma;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 110px 28px",
        gap: 10,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-2)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {locked ? (
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{line.label}</div>
        ) : (
          <input
            className="input"
            value={line.label}
            onChange={(e) => onChange?.({ label: e.target.value })}
            style={{
              height: 26,
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid transparent",
              background: "transparent",
              padding: "0 6px",
              marginLeft: -6,
            }}
            onFocus={(e) => {
              e.target.style.border = "1px solid var(--border)";
              e.target.style.background = "var(--surface)";
            }}
            onBlur={(e) => {
              e.target.style.border = "1px solid transparent";
              e.target.style.background = "transparent";
            }}
          />
        )}
        {line.source && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{line.source}</div>}
      </div>
      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-4)",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          €
        </span>
        <input
          type="number"
          className="input"
          style={{
            paddingLeft: 22,
            height: 28,
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            textAlign: "right",
            background: locked ? "var(--surface-2)" : "var(--surface)",
            cursor: locked ? "default" : "text",
            fontWeight: 600,
          }}
          value={line.value}
          readOnly={locked}
          onChange={(e) => onChange?.({ value: Number(e.target.value) || 0 })}
        />
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        {locked ? (
          <span title={t.calcAuto} style={{ color: "var(--text-mute)", display: "grid", placeItems: "center", width: 18, height: 18 }}>
            <Icon name="check" size={11} />
          </span>
        ) : (
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove} title={t.removeTip}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateLibraryModal({
  templates,
  courseType,
  onClose,
  onApply,
  onDelete,
}: {
  templates: TemplateData[];
  courseType: string;
  onClose: () => void;
  onApply: (t: TemplateData) => void;
  onDelete: (id: string) => void;
}) {
  const tr = useT();
  const t = tr.corsi.templateModal;
  const [filter, setFilter] = useState<string>(courseType || "");
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = filter ? templates.filter((tp) => tp.type === filter) : templates;

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(10, 37, 64, 0.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-dialog"
        style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "var(--sh-popover)", width: "100%", maxWidth: 920, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {t.eyebrow}
            </div>
            <h2 className="h1" style={{ fontSize: 20 }}>
              {t.title}
            </h2>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span className="eyebrow">{t.filterByType}</span>
            <button className={`pill ${!filter ? "on" : ""}`} onClick={() => setFilter("")}>
              {t.all}
            </button>
            {TEMPLATE_TYPE_KEYS.map((ty) => (
              <button key={ty.key} className={`pill ${filter === ty.key ? "on" : ""}`} onClick={() => setFilter(ty.key)}>
                {ty.key === courseType && "● "}
                {ty.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-3)" }}>
              {t.emptyForType}{" "}
              <a className="link" href="/template-materiali">
                {t.createIn}
              </a>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {filtered.map((tp) => (
              <TemplateCard
                key={tp.id}
                template={tp}
                matchType={tp.type === courseType}
                expanded={editing === tp.id}
                onToggle={() => setEditing(editing === tp.id ? null : tp.id)}
                onApply={() => onApply(tp)}
                onDelete={() => {
                  if (window.confirm(format(t.deleteConfirm, { name: tp.name }))) onDelete(tp.id);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template: tp,
  matchType,
  expanded,
  onToggle,
  onApply,
  onDelete,
}: {
  template: TemplateData;
  matchType: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApply: () => void;
  onDelete: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.templateModal;
  const totalSakes = tp.days.reduce((s, d) => s + d.sakes.length, 0);
  const totalCost = tp.days.reduce((s, d) => s + d.sakes.reduce((ss, sk) => ss + sk.cost * sk.qty, 0), 0);
  return (
    <div
      className="card"
      style={{
        border: matchType ? "1px solid var(--indigo)" : "1px solid var(--border)",
        boxShadow: matchType ? "var(--sh-2)" : "var(--sh-card)",
      }}
    >
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Badge tone={tp.typeColor === "oro" ? "oro" : "azzurro"}>{tp.typeLabel}</Badge>
              {matchType && (
                <Badge tone="indigo" dot>
                  {t.recommended}
                </Badge>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{tp.name}</div>
            {tp.description && (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>{tp.description}</div>
            )}
          </div>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onDelete} title={t.deleteTip}>
            <Icon name="trash" size={12} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {tp.days.length}
            </strong>{" "}
            {tp.days.length === 1 ? t.dayOne : t.dayMany}
          </span>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {totalSakes}
            </strong>{" "}
            {t.sake}
          </span>
          <span>
            <strong className="num" style={{ color: "var(--text)" }}>
              {fmtIt(totalCost)}
            </strong>
            € {t.cost}
          </span>
        </div>

        {tp.lastUsed && (
          <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 8 }}>
            {format(t.lastUsed, { date: tp.lastUsed, n: tp.uses, by: tp.createdBy })}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface-2)", display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onToggle} style={{ flex: 1 }}>
          {expanded ? t.hide : t.preview}
        </button>
        <button className="btn btn-sm btn-primary" onClick={onApply} style={{ flex: 1 }}>
          {t.apply}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border-2)", background: "var(--surface)" }}>
          {tp.days.map((d, di) => (
            <div key={di} style={{ marginBottom: di < tp.days.length - 1 ? 10 : 0 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {format(t.dayName, { n: d.day, name: d.name })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {d.sakes.map((s, si) => (
                  <div key={si} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-2)", padding: "3px 0" }}>
                    <span>
                      {s.name}{" "}
                      <span className="text-4 mono" style={{ fontSize: 10 }}>
                        · {s.code}
                      </span>
                    </span>
                    <span className="num" style={{ color: "var(--text-3)" }}>
                      {s.cost}€×{s.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
