"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatNumberIt } from "@/lib/format";
import type { ProgrammaData, TemplateData } from "@/lib/corsi";
import { LOW_STOCK, SakeProductPicker, type ScCatalogItem } from "@/components/sake/SakeProductPicker";
import { bottlesForStudents, bottleCost, parseVolumeMl } from "@/lib/economics/bottles";
import { fetchSakeCatalog } from "@/lib/integrations/sakecompany/actions";
import { deleteTemplateAction } from "@/lib/data/template-actions";
import { saveCourseProgramAction } from "@/lib/corsi/program-actions";
import type { CourseProgramOverlay } from "@/lib/corsi/program-overlay";
import { validateDays, MAX_COURSE_DAYS } from "@/lib/corsi/program-validate";
import type { SakeState, CostLine } from "./programma-types";
import { SakeRow } from "./programma-rows";
import { EconomiaPanel } from "./EconomiaPanel";
import { TemplateLibraryModal } from "./template-library-modal";

interface DayState {
  id: string;
  day: number;
  name: string;
  sakes: SakeState[];
}

export function ProgrammaEconomiaSection({
  courseId,
  data,
  programOverlay,
  templates: initialTemplates,
  expectedDayCount,
}: {
  courseId: string;
  data: ProgrammaData;
  programOverlay?: CourseProgramOverlay;
  templates: TemplateData[];
  /** Expected day count for this course type+mode (COURSE_PROFILE baseline) —
   *  drives the "days don't match" advisory. Undefined = no baseline. */
  expectedDayCount?: number;
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
  // Which stock-check row (by SKU) has its "sostituisci prodotto" picker open.
  const [replacingSku, setReplacingSku] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateData[]>(initialTemplates);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const dragRef = useRef<{ dayId: string; sakeId: string } | null>(null);
  const handleDragStart = (dayId: string, sakeId: string) => {
    dragRef.current = { dayId, sakeId };
  };
  // Row-level drop indicator (owner: couldn't see WHERE a dragged sake would
  // land) — tracks which row is currently hovered, mirroring the existing
  // day-card dragOverDay pattern one level deeper.
  const [dragOverSake, setDragOverSake] = useState<string | null>(null);
  const handleDragOver = (e: React.DragEvent, sakeId: string) => {
    e.preventDefault();
    setDragOverSake(sakeId);
  };
  const handleDrop = (targetDayId: string, targetSakeId: string) => {
    setDragOverSake(null);
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

  // Replace a product EVERYWHERE it's used (owner: same SKU can appear on
  // several days) — the stock-check list and the day-by-day plan share this
  // one `days` state, so a single update here updates both views at once.
  // Bottle size/qty/note are per-row facts and stay untouched; identity fields
  // (code/name/producer/type/cost) come from the newly picked catalog item.
  const replaceSakeEverywhere = (oldCode: string, item: ScCatalogItem) =>
    setDays((arr) =>
      arr.map((d) => ({
        ...d,
        sakes: d.sakes.map((s) =>
          s.code === oldCode
            ? {
                ...s,
                code: item.sku ?? s.code,
                name: item.name,
                sakagura: item.vendor ?? s.sakagura,
                type: item.productType ?? s.type,
                cost: item.cost || item.price || s.cost,
              }
            : s,
        ),
      })),
    );
  const removeSake = (dayId: string, sakeId: string) =>
    setDays((arr) =>
      arr.map((d) => (d.id === dayId ? { ...d, sakes: d.sakes.filter((s) => s.id !== sakeId) } : d)),
    );

  // A catalog item → a program row. Identity + cost come from the picked product;
  // the bottle size is parsed from its name (fallback 720ml), qty starts at 1.
  const sakeFromCatalog = (item: ScCatalogItem): SakeState => {
    const ml = Number(/(\d{3,4})\s*ml/i.exec(item.name)?.[1]);
    return {
      id: `sake-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: item.sku ?? `SAK${Math.floor(Math.random() * 900) + 100}`,
      name: item.name,
      type: item.productType ?? "—",
      sakagura: item.vendor ?? "—",
      size: Number.isFinite(ml) && ml > 0 ? ml : 720,
      cost: item.cost || item.price || 0,
      qty: 1,
      note: "",
    };
  };
  // Add a REAL sake picked from the catalog to a day (owner/educator: pick from
  // the catalog, not a placeholder — the old dummy path is gone).
  const addSakeFromCatalog = (dayId: string, item: ScCatalogItem) =>
    setDays((arr) =>
      arr.map((d) => (d.id === dayId ? { ...d, sakes: [...d.sakes, sakeFromCatalog(item)] } : d)),
    );
  // Replace a SINGLE program row (by id) with a catalog item — size/qty/note kept,
  // identity + cost swapped. Distinct from replaceSakeEverywhere (by SKU).
  const replaceSake = (dayId: string, sakeId: string, item: ScCatalogItem) =>
    setDays((arr) =>
      arr.map((d) =>
        d.id === dayId
          ? {
              ...d,
              sakes: d.sakes.map((s) =>
                s.id === sakeId
                  ? {
                      ...s,
                      code: item.sku ?? s.code,
                      name: item.name,
                      sakagura: item.vendor ?? s.sakagura,
                      type: item.productType ?? s.type,
                      cost: item.cost || item.price || s.cost,
                    }
                  : s,
              ),
            }
          : d,
      ),
    );

  const addDay = () =>
    setDays((arr) => {
      if (arr.length >= MAX_COURSE_DAYS) return arr; // hard cap 1..9
      const n = arr.length + 1;
      return [...arr, { id: `day-new-${Date.now()}`, day: n, name: format(t.newDayName, { n }), sakes: [] }];
    });
  const removeDay = (dayId: string) =>
    setDays((arr) => (arr.length <= 1 ? arr : arr.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, day: i + 1 }))));
  const renameDay = (dayId: string, name: string) =>
    setDays((arr) => arr.map((d) => (d.id === dayId ? { ...d, name } : d)));

  // Which day is showing the "aggiungi dal catalogo" picker.
  const [addingSakeDay, setAddingSakeDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const handleDayDrop = (targetDayId: string) => {
    setDragOverDay(null);
    setDragOverSake(null);
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
  // Per-SKU bottle need: 48ml/person against the bottle FORMAT (from the
  // catalog name or the SKU suffix; unknown → 720ml = historical behaviour).
  const needFor = (code?: string | null, name?: string | null) =>
    bottlesForStudents(enrolled, parseVolumeMl((code && catBySku.get(code)?.name) || name, code));

  // Legacy line cost (stored cost × qty) — fallback before the catalog loads
  // or when the course has no enrollees yet.
  const legacySakeCost = useMemo(
    () => days.reduce((s, p) => s + p.sakes.reduce((ss, sk) => ss + sk.cost * sk.qty, 0), 0),
    [days],
  );
  const totalSakes = days.reduce((s, p) => s + p.sakes.length, 0);

  // Real bottle cost: per-SKU bottles (format-aware) × live cost per SKU.
  const liveBottleCost = useMemo(
    () => bottleCost(days, catBySku, enrolled),
    [days, catBySku, enrolled],
  );

  // Use the bottle-based cost when we actually know enrollees; else legacy.
  const useBottles = enrolled > 0;
  const sakeCost = useBottles ? liveBottleCost : legacySakeCost;

  // Per-SKU stock check (each program SKU once; need is format-aware).
  const stockCheck = useMemo(() => {
    const seen = new Map<string, SakeState>();
    for (const d of days)
      for (const sk of d.sakes) if (sk.code && !seen.has(sk.code)) seen.set(sk.code, sk);
    const rows = [...seen.values()].map((sake) => {
      const item = catBySku.get(sake.code);
      const need = bottlesForStudents(enrolled, parseVolumeMl(item?.name ?? sake.name, sake.code));
      const stock = item?.stock ?? null;
      const insufficient = stock != null && stock < need;
      const low = stock != null && !insufficient && stock < LOW_STOCK;
      return { sake, need, item, stock, insufficient, low };
    });
    return rows;
     
  }, [days, catBySku, enrolled]);
  const catalogReady = catBySku.size > 0;

  const autoLines: CostLine[] = [
    {
      id: "sake",
      label: t.sakeProgram,
      value: sakeCost,
      source: useBottles
        ? format(t.sakeBottles, { n: totalSakes, s: enrolled })
        : format(t.sakeSource, { n: totalSakes }),
    },
  ];

  const [customLines, setCustomLines] = useState<CostLine[]>(() =>
    // `!= null` so an intentionally-emptied list ([]) is honored instead of
    // reverting to the default cost lines on reload.
    programOverlay?.customLines != null
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

  // Per-course concurrency version (Bug 4): sent with every save so a stale
  // editor gets "Modificato da un altro utente" instead of clobbering; bumped
  // locally after each successful save so consecutive saves keep working.
  const programVersion = useRef(programOverlay?.__pv ?? 0);

  const handleSaveProgram = () => {
    startSave(async () => {
      const overlay: CourseProgramOverlay = { days, customLines };
      const res = await saveCourseProgramAction(courseId, overlay, programVersion.current);
      if (res.ok) {
        if (res.newVersion != null) programVersion.current = res.newVersion;
        setDirty(false);
        showToast(t.programSaved);
      } else {
        showToast(res.error || t.programSaveError);
      }
    });
  };

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

    // Bring the TEMPLATE's costs into the course economics — only the costs the
    // template owns (gestione, educator, diplomi, libri + template extras). The
    // per-course costs (location, food, cocktail, accommodation, transport, ADV)
    // are course-specific and are PRESERVED, not overwritten by the template.
    const m = template.materiali;
    if (m) {
      const enrolled = data.enrolled || 0;
      const days = template.days.length;
      const tplLines: CostLine[] = [
        { id: "ssa_fee", label: t.costGestione, value: Math.round((m.gestionePerDay || 0) * days) },
        { id: "educator", label: "Educator", value: Math.round((m.educatorPerDay || 0) * days), custom: true },
        { id: "diplomi", label: "Diplomi", value: Math.round((m.diplomaPerStudent || 0) * enrolled), custom: true },
        { id: "libri", label: "Libri", value: Math.round((m.libroPerStudent || 0) * enrolled), custom: true },
      ];
      for (const e of m.extra ?? []) {
        const mult = e.per === "iscritto" ? enrolled : 1;
        tplLines.push({ id: `tpl-${e.id}`, label: e.label, value: Math.round((e.value || 0) * mult), custom: true });
      }
      setCustomLines((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        for (const l of tplLines) byId.set(l.id, l); // upsert template lines, keep course lines
        return [...byId.values()];
      });
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

      <EconomiaPanel
        revenue={data.revenue}
        price={data.price}
        enrolled={data.enrolled}
        sakeCost={sakeCost}
        autoLines={autoLines}
        customLines={customLines}
        updateCustom={updateCustom}
        addCustom={addCustom}
        removeCustom={removeCustom}
        stockCheck={stockCheck}
        catalogReady={catalogReady}
        replacingSku={replacingSku}
        setReplacingSku={setReplacingSku}
        replaceSakeEverywhere={replaceSakeEverywhere}
      >
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
                {format(t.totalSakesCost, { n: totalSakes, c: formatNumberIt(sakeCost) })}
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
              <button className="btn btn-sm" onClick={addDay} disabled={days.length >= MAX_COURSE_DAYS} title={days.length >= MAX_COURSE_DAYS ? `Massimo ${MAX_COURSE_DAYS} giorni` : undefined}>
                <Icon name="plus" size={12} />
                {t.addDay}
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleSaveProgram} disabled={saving || !dirty}>
                <Icon name="save" size={12} />
                {saving ? t.programSaving : t.saveProgram}
              </button>
            </div>
          </div>

          {/* Day-count advisory: real program vs the expected baseline for this
              course type + mode (add/remove day is allowed — this only warns). */}
          {validateDays(days.length, expectedDayCount).map((issue, i) => (
            <div
              key={i}
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                lineHeight: 1.4,
                padding: "8px 12px",
                borderRadius: 8,
                marginBottom: 10,
                color: issue.level === "error" ? "var(--danger-fg)" : "var(--warning-fg)",
                background: issue.level === "error" ? "var(--danger-bg)" : "var(--warning-bg)",
                border: `1px solid ${issue.level === "error" ? "var(--danger-fg)" : "var(--warning-fg)"}`,
              }}
            >
              <Icon name="warn" size={14} style={{ flexShrink: 0 }} />
              <span>{issue.message}</span>
            </div>
          ))}

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
                        c: formatNumberIt(sec.sakes.reduce((s, k) => s + k.cost * k.qty, 0)),
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
                      need={needFor(s.code, s.name)}
                      isDropTarget={dragOverSake === s.id}
                      onToggleNote={() => setOpenNote(openNote === s.id ? null : s.id)}
                      onUpdate={(p) => updateSake(sec.id, s.id, p)}
                      onRemove={() => removeSake(sec.id, s.id)}
                      onReplace={(item) => replaceSake(sec.id, s.id, item)}
                      onDragStart={() => handleDragStart(sec.id, s.id)}
                      onDragOver={(e) => handleDragOver(e, s.id)}
                      onDragLeave={() => setDragOverSake((cur) => (cur === s.id ? null : cur))}
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
                  {addingSakeDay === sec.id ? (
                    <SakeProductPicker
                      placeholder="Cerca un sake dal catalogo…"
                      excludeSkus={sec.sakes.map((s) => s.code).filter(Boolean) as string[]}
                      onPick={(item) => {
                        addSakeFromCatalog(sec.id, item);
                        setAddingSakeDay(null);
                      }}
                    />
                  ) : (
                    <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => setAddingSakeDay(sec.id)}>
                      <Icon name="plus" size={12} />
                      {t.addSake}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </EconomiaPanel>

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
