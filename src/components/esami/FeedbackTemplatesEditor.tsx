"use client";

// Feedback questionnaires editor — redesigned per the owner-approved UX
// (batch 14). Two mental tasks, two tabs:
//   • QUESTIONARI — master-detail: the list on the left, EVERYTHING about the
//     selected questionnaire on the right (inline rename, labeled actions,
//     student-style preview, its questions with the save button attached to
//     them). No window.prompt/confirm: inline flows with explicit two-step
//     confirms.
//   • ASSEGNAZIONI — one row per course type with a SINGLE select while
//     presenza and online coincide (the normal case), split on demand; every
//     change gets a row-level confirmation and a one-click Annulla (undo),
//     because a stray scroll on a dropdown must never silently change what
//     students receive.
// Server actions are unchanged (feedback-templates-actions).

import { useEffect, useState, useTransition } from "react";
import { Icon, Badge } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { plOverlay, plDialog } from "@/components/pianificatore/modal-styles";
import { COURSE_TYPES } from "@/lib/domain/constants";
import type { CourseTypeKey, ExamQuestion, ExamQuestionType } from "@/lib/domain";
import { QuestionDetail, AddQuestionRow } from "@/components/esami/QuestionDetail";
import {
  loadFeedbackAdminAction,
  createFeedbackTemplateAction,
  renameFeedbackTemplateAction,
  duplicateFeedbackTemplateAction,
  deleteFeedbackTemplateAction,
  saveFeedbackTemplateQuestionsAction,
  setFeedbackAssignmentAction,
  type FeedbackAdminData,
  type FeedbackDelivery,
  type FeedbackMutationResult,
  type FeedbackTemplate,
} from "@/lib/esami/feedback-templates-actions";

const genId = () => "fb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function newFeedbackQuestion(type: ExamQuestionType): ExamQuestion {
  const base: ExamQuestion = {
    id: genId(),
    cat: "",
    type,
    lang: "it",
    points: 0, // feedback answers aren't scored
    important: false,
    text: "Nuova domanda di feedback",
  };
  if (type === "single" || type === "multi") {
    base.options = ["Opzione 1", "Opzione 2"];
    base.correct = [];
  }
  return base;
}

type View = "questionari" | "assegnazioni";
type PreviewLang = "it" | "en" | "ja";

const DELIVERY_LABEL: Record<FeedbackDelivery, string> = {
  presenza: "In presenza",
  online: "Online",
};

/** Compact "where is it used" labels for one template id. */
function usedByLabels(
  assignments: FeedbackAdminData["assignments"],
  id: string,
): string[] {
  const out: string[] = [];
  for (const [type, cell] of Object.entries(assignments)) {
    const label = COURSE_TYPES[type as CourseTypeKey]?.label ?? type;
    const both = cell?.presenza === id && cell?.online === id;
    if (both) out.push(label);
    else if (cell?.presenza === id) out.push(`${label} (presenza)`);
    else if (cell?.online === id) out.push(`${label} (online)`);
  }
  return out;
}

export function FeedbackTemplatesEditor() {
  const esami = useT().esami;
  const [data, setData] = useState<FeedbackAdminData>({ templates: [], assignments: {}, version: 0 });
  const [view, setView] = useState<View>("questionari");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Unsaved question edits of the ACTIVE template only (list/matrix ops are instant).
  const [draftQs, setDraftQs] = useState<ExamQuestion[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Inline flows (no window.prompt/confirm).
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<PreviewLang>("it");
  // Matrix: which course types show the split (presenza ≠ online) editor, and
  // the last change per row for the one-click undo.
  const [split, setSplit] = useState<Set<CourseTypeKey>>(new Set());
  const [lastChange, setLastChange] = useState<{
    type: CourseTypeKey;
    prev: Partial<Record<FeedbackDelivery, string>>;
  } | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    loadFeedbackAdminAction()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setActiveId(d.templates[0]?.id ?? null);
        // Rows whose two cells already differ start in split mode.
        const s = new Set<CourseTypeKey>();
        for (const [type, cell] of Object.entries(d.assignments)) {
          if ((cell?.presenza ?? "") !== (cell?.online ?? "")) s.add(type as CourseTypeKey);
        }
        setSplit(s);
      })
      // A swallowed load failure must NOT render an empty editor claiming
      // "nessun questionario" — that reads as fact, not as an error.
      .catch(() => {
        if (alive) setLoadError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadTick]);

  const active = data.templates.find((t) => t.id === activeId) ?? null;
  const questions = draftQs ?? active?.questions ?? [];
  const dirty = draftQs != null;

  const confirmDiscard = () =>
    !dirty ||
    window.confirm("Modifiche non salvate alle domande: le perdi continuando. Procedere?");

  const applyResult = (res: FeedbackMutationResult, okMsg: string) => {
    if (res.ok && res.data) {
      setData(res.data);
      setMsg(okMsg);
    } else {
      setMsg(res.error || "Operazione non riuscita.");
    }
  };

  // ── Template CRUD (inline flows) ───────────────────────────────────────────

  /** Every path that changes the active template goes through here so armed
   *  transient states (rename input, two-step delete, open modal, drafts)
   *  can never survive onto a DIFFERENT questionnaire. */
  const activateTemplate = (id: string | null) => {
    setActiveId(id);
    setDraftQs(null);
    setOpenIdx(null);
    setRenaming(false);
    setConfirmDelete(false);
  };

  const selectTemplate = (id: string) => {
    if (id === activeId) return;
    if (!confirmDiscard()) return;
    activateTemplate(id);
    setMsg(null);
  };

  const submitCreate = () => {
    if (busy) return; // double-Enter must not create twice
    const name = createName.trim();
    if (!name) return;
    if (!confirmDiscard()) return;
    startBusy(async () => {
      const res = await createFeedbackTemplateAction(name);
      applyResult(res, "Creato ✓ — ora aggiungi le domande.");
      if (res.ok && res.createdId) {
        activateTemplate(res.createdId);
        setCreating(false);
        setCreateName("");
      }
    });
  };

  const submitRename = () => {
    if (busy || !active) return;
    const name = renameValue.trim();
    if (!name || name === active.name) {
      setRenaming(false);
      return;
    }
    startBusy(async () => {
      applyResult(await renameFeedbackTemplateAction(active.id, name), "Rinominato ✓");
      setRenaming(false);
    });
  };

  const duplicate = () => {
    if (!active || !confirmDiscard()) return;
    startBusy(async () => {
      const res = await duplicateFeedbackTemplateAction(active.id);
      applyResult(res, "Duplicato ✓ — domande e traduzioni copiate.");
      if (res.ok && res.createdId) activateTemplate(res.createdId);
    });
  };

  const remove = () => {
    if (!active) return;
    startBusy(async () => {
      const res = await deleteFeedbackTemplateAction(active.id);
      applyResult(res, "Eliminato ✓");
      setConfirmDelete(false);
      if (res.ok) activateTemplate(res.data?.templates[0]?.id ?? null);
    });
  };

  // ── Matrix ops ─────────────────────────────────────────────────────────────

  const assign = (type: CourseTypeKey, deliveries: FeedbackDelivery[], templateId: string) => {
    const prev = { ...(data.assignments[type] ?? {}) };
    setLastChange({ type, prev });
    startBusy(async () => {
      try {
        let res: FeedbackMutationResult = { ok: true };
        for (const d of deliveries) {
          res = await setFeedbackAssignmentAction(type, d, templateId || null);
          // Every landed write updates the UI at once: on a mid-pair failure
          // the matrix must show the TRUE half-changed server state, never a
          // stale "unified" row — and Annulla (prev covers both cells) stays
          // armed as the one-click repair.
          if (res.ok && res.data) setData(res.data);
          if (!res.ok) break;
        }
        setMsg(
          res.ok
            ? "Assegnazione salvata ✓ — vale per i prossimi link."
            : `${res.error || "Operazione non riuscita."} Usa «Annulla ultima modifica» per ripristinare.`,
        );
      } catch {
        setMsg("Errore di rete: lo stato mostrato può essere indietro — ricarica la pagina.");
      }
    });
  };

  const undoLast = () => {
    if (!lastChange) return;
    const { type, prev } = lastChange;
    startBusy(async () => {
      try {
        let res: FeedbackMutationResult = { ok: true };
        for (const d of ["presenza", "online"] as FeedbackDelivery[]) {
          res = await setFeedbackAssignmentAction(type, d, prev[d] ?? null);
          if (res.ok && res.data) setData(res.data);
          if (!res.ok) break;
        }
        if (res.ok) {
          setMsg("Ripristinato ✓");
          // The undo is spent only when it actually restored: a failed undo
          // keeps the button so it can be retried.
          setLastChange(null);
          if ((prev.presenza ?? "") !== (prev.online ?? "")) {
            setSplit((s) => new Set(s).add(type));
          }
        } else {
          setMsg(`${res.error || "Ripristino non riuscito."} Riprova con «Annulla ultima modifica».`);
        }
      } catch {
        setMsg("Errore di rete durante il ripristino — riprova.");
      }
    });
  };

  const unifyRow = (type: CourseTypeKey) => {
    const cell = data.assignments[type] ?? {};
    setSplit((s) => {
      const n = new Set(s);
      n.delete(type);
      return n;
    });
    // Collapsing means "online follows presenza" — write it only when they differ.
    if ((cell.presenza ?? "") !== (cell.online ?? "")) {
      assign(type, ["online"], cell.presenza ?? "");
    }
  };

  // ── Question editing (unchanged mechanics, better placement) ───────────────

  const setQuestions = (qs: ExamQuestion[]) => {
    setDraftQs(qs);
    setMsg(null);
  };
  const addQuestion = (type: ExamQuestionType) => {
    setQuestions([...questions, newFeedbackQuestion(type)]);
    setOpenIdx(questions.length);
  };
  const updateQuestion = (i: number, patch: Partial<ExamQuestion>) =>
    setQuestions(questions.map((q, x) => (x === i ? { ...q, ...patch } : q)));
  const changeType = (i: number, type: ExamQuestionType) =>
    setQuestions(questions.map((q, x) => (x === i ? { ...newFeedbackQuestion(type), id: q.id, text: q.text } : q)));
  const removeQuestion = (i: number) => {
    setQuestions(questions.filter((_, x) => x !== i));
    setOpenIdx(null);
  };
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const arr = questions.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setQuestions(arr);
  };

  const saveQuestions = () => {
    if (!active || draftQs == null) return;
    setMsg(null);
    startBusy(async () => {
      const res = await saveFeedbackTemplateQuestionsAction(active.id, draftQs, data.version);
      if (res.ok && res.data) {
        setData(res.data);
        setDraftQs(null);
        setMsg("Domande salvate ✓");
      } else setMsg(res.error || "Salvataggio non riuscito");
    });
  };

  const modalQ = openIdx != null ? (questions[openIdx] ?? null) : null;
  const activeUses = active ? usedByLabels(data.assignments, active.id) : [];

  // Escape closes whichever modal is open (the close button even advertises
  // it) — question modal first, then preview.
  useEffect(() => {
    if (openIdx == null && !preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openIdx != null) setOpenIdx(null);
      else setPreview(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openIdx, preview]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Feedback di fine corso</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            Scrivi i questionari nella scheda <strong>Questionari</strong>; decidi chi li riceve
            nella scheda <strong>Assegnazioni</strong>. Sempre facoltativo per lo studente.
          </div>
        </div>
        <span
          role="status"
          style={{ fontSize: 12, fontWeight: 600, color: msg?.includes("✓") ? "var(--success-fg)" : "var(--danger-fg)" }}
        >
          {msg ?? ""}
        </span>
      </div>

      <div className="segmented" style={{ marginBottom: 16, maxWidth: 360 }}>
        <button
          className={view === "questionari" ? "on" : ""}
          onClick={() => setView("questionari")}
        >
          Questionari · {data.templates.length}
        </button>
        <button
          className={view === "assegnazioni" ? "on" : ""}
          onClick={() => {
            // Question drafts survive the tab switch (state is kept) — no
            // scare-dialog needed; the dirty banner flags them on return.
            setView("assegnazioni");
            setMsg(null);
          }}
        >
          Assegnazioni
        </button>
      </div>

      {loading ? (
        <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>Carico…</div>
      ) : loadError ? (
        // A load failure must be VISIBLE + retryable — never an empty editor that
        // reads as "nessun questionario". Retry re-runs the load effect (loadTick).
        <div className="card card-pad" style={{ display: "grid", gap: 10, justifyItems: "start" }}>
          <p className="text-3" style={{ fontSize: 13, margin: 0 }}>
            Non è stato possibile caricare i questionari. Controlla la connessione e riprova.
          </p>
          <button className="btn" onClick={() => setLoadTick((t) => t + 1)}>
            Riprova
          </button>
        </div>
      ) : view === "questionari" ? (
        <div className="fb-master-detail">
          {/* ── Master: template list ── */}
          <div className="card" style={{ overflow: "hidden" }}>
            {data.templates.map((t) => {
              const isActive = t.id === activeId;
              const uses = usedByLabels(data.assignments, t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  aria-current={isActive}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "11px 13px",
                    borderBottom: "1px solid var(--border-2)",
                    borderLeft: isActive ? "3px solid var(--indigo)" : "3px solid transparent",
                    background: isActive ? "var(--indigo-50)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 500, color: "var(--text)", display: "block" }}>
                    {t.name}
                  </span>
                  <span className="text-3" style={{ fontSize: 11.5, display: "block", marginTop: 2 }}>
                    {t.questions.length} domande
                    {t.translations && Object.keys(t.translations).length > 0 ? " · EN/JA" : ""}
                  </span>
                  <span className="text-4" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                    {uses.length === 0
                      ? "non assegnato"
                      : uses.length <= 2
                        ? uses.join(", ")
                        : `${uses.slice(0, 2).join(", ")} +${uses.length - 2}`}
                  </span>
                </button>
              );
            })}
            {/* Inline create — no popup. */}
            {creating ? (
              <div style={{ padding: "10px 12px", display: "flex", gap: 6 }}>
                <input
                  className="input"
                  autoFocus
                  placeholder="Nome del questionario…"
                  value={createName}
                  maxLength={80}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setCreateName("");
                    }
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="btn btn-sm btn-primary" onClick={submitCreate} disabled={busy || !createName.trim()}>
                  Crea
                </button>
                <button className="btn btn-sm" onClick={() => { setCreating(false); setCreateName(""); }}>
                  ✕
                </button>
              </div>
            ) : (
              <button
                className="btn btn-sm btn-ghost"
                style={{ margin: 10, width: "calc(100% - 20px)", justifyContent: "center" }}
                onClick={() => setCreating(true)}
              >
                <Icon name="plus" size={12} />
                Nuovo questionario
              </button>
            )}
          </div>

          {/* ── Detail: everything about the SELECTED questionnaire ── */}
          {active ? (
            <div style={{ minWidth: 0 }}>
              <div className="card card-pad" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    {renaming ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="input"
                          autoFocus
                          value={renameValue}
                          maxLength={80}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename();
                            if (e.key === "Escape") setRenaming(false);
                          }}
                          style={{ fontSize: 15, fontWeight: 600, minWidth: 260 }}
                        />
                        <button className="btn btn-sm btn-primary" onClick={submitRename} disabled={busy}>
                          OK
                        </button>
                        <button className="btn btn-sm" onClick={() => setRenaming(false)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{active.name}</div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                      {active.questions.length} domande
                      {active.translations && Object.keys(active.translations).length > 0
                        ? " · tradotto EN/JA"
                        : " · solo italiano"}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <span className="eyebrow" style={{ fontSize: 10 }}>Usato per</span>
                      {activeUses.length === 0 ? (
                        <button
                          onClick={() => setView("assegnazioni")}
                          className="btn btn-sm btn-ghost"
                          style={{ color: "var(--warning-fg)", fontWeight: 600 }}
                        >
                          nessun corso — assegnalo →
                        </button>
                      ) : (
                        <>
                          {activeUses.map((u) => (
                            <Badge key={u} tone="azzurro">{u}</Badge>
                          ))}
                          <button
                            onClick={() => setView("assegnazioni")}
                            style={{ fontSize: 11.5, color: "var(--indigo)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                          >
                            modifica
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-sm"
                      disabled={busy || renaming}
                      onClick={() => {
                        setRenameValue(active.name);
                        setRenaming(true);
                      }}
                    >
                      <Icon name="edit" size={12} /> Rinomina
                    </button>
                    <button className="btn btn-sm" disabled={busy} onClick={duplicate}>
                      <Icon name="copy" size={12} /> Duplica
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={busy || questions.length === 0}
                      onClick={() => {
                        setPreviewLang("it");
                        setPreview(true);
                      }}
                    >
                      <Icon name="play" size={11} /> Anteprima
                    </button>
                    {confirmDelete ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--danger-fg)", fontWeight: 600 }}>
                          Eliminare «{active.name}»? Le risposte già raccolte restano salvate.
                        </span>
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={remove}>
                          Elimina
                        </button>
                        <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                          Annulla
                        </button>
                      </span>
                    ) : (
                      <button
                        className="btn btn-sm"
                        disabled={busy || activeUses.length > 0}
                        title={activeUses.length > 0 ? "In uso: sostituiscilo nelle Assegnazioni prima di eliminarlo" : "Elimina questionario"}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Icon name="trash" size={12} /> Elimina
                      </button>
                    )}
                  </div>
                </div>
                {activeUses.length > 0 && confirmDelete === false && (
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8 }}>
                    Per eliminarlo, prima sostituiscilo nelle Assegnazioni.
                  </div>
                )}
              </div>

              {/* Questions — save lives HERE, attached to what it saves. */}
              <div className="card" style={{ overflow: "hidden" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border-2)",
                    background: dirty ? "var(--warning-bg)" : "var(--surface-2)",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    Domande
                    {dirty && (
                      <span style={{ color: "var(--warning-fg)", fontWeight: 600, marginLeft: 8, fontSize: 12 }}>
                        ● modifiche non salvate
                      </span>
                    )}
                  </strong>
                  <button className="btn btn-sm btn-primary" onClick={saveQuestions} disabled={busy || !dirty}>
                    <Icon name="save" size={12} />
                    {busy ? "Salvo…" : "Salva domande"}
                  </button>
                </div>
                {questions.length === 0 ? (
                  <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>
                    Nessuna domanda: questo questionario per ora è vuoto. Aggiungi la prima qui sotto.
                  </div>
                ) : (
                  questions.map((qq, qi) => (
                    <div key={qq.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border-2)" }}>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", minWidth: 22 }}>
                        {(qi + 1).toString().padStart(2, "0")}
                      </span>
                      <button
                        onClick={() => setOpenIdx(qi)}
                        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.35 }}>{qq.text || "—"}</span>
                        <span style={{ display: "flex", gap: 6 }}>
                          <Badge tone="neutral">{esami.qt[qq.type]}</Badge>
                        </span>
                      </button>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button className="reorder-btn" disabled={qi === 0} onClick={() => move(qi, -1)}>
                          <Icon name="arrow-up" size={12} />
                        </button>
                        <button className="reorder-btn" disabled={qi === questions.length - 1} onClick={() => move(qi, 1)}>
                          <Icon name="arrow-dn" size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <AddQuestionRow onAdd={addQuestion} />
              </div>
            </div>
          ) : (
            <div className="card card-pad text-3" style={{ fontSize: 12.5 }}>
              Seleziona un questionario a sinistra, o creane uno nuovo.
            </div>
          )}
        </div>
      ) : (
        /* ── ASSEGNAZIONI ── */
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Tipo di corso</th>
                  <th>Questionario</th>
                  <th style={{ width: 200 }} />
                </tr>
              </thead>
              <tbody>
                {(Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((type) => {
                  const cell = data.assignments[type] ?? {};
                  const isSplit = split.has(type);
                  const unified = (cell.presenza ?? "") === (cell.online ?? "");
                  const noneChosen = !cell.presenza && !cell.online;
                  return (
                    <tr key={type}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top", paddingTop: 14 }}>
                        {COURSE_TYPES[type].label}
                      </td>
                      <td>
                        {!isSplit && unified ? (
                          <select
                            className="select"
                            style={{ width: "100%", maxWidth: 320 }}
                            disabled={busy}
                            aria-label={`Questionario per ${COURSE_TYPES[type].label}`}
                            value={cell.presenza ?? ""}
                            onChange={(e) => assign(type, ["presenza", "online"], e.target.value)}
                          >
                            <option value="">— nessuno —</option>
                            {data.templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {(["presenza", "online"] as FeedbackDelivery[]).map((d) => (
                              <label key={d} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className="eyebrow" style={{ width: 84, fontSize: 10 }}>
                                  {DELIVERY_LABEL[d]}
                                </span>
                                <select
                                  className="select"
                                  style={{ flex: 1, maxWidth: 320 }}
                                  disabled={busy}
                                  aria-label={`Questionario per ${COURSE_TYPES[type].label} — ${DELIVERY_LABEL[d]}`}
                                  value={cell[d] ?? ""}
                                  onChange={(e) => assign(type, [d], e.target.value)}
                                >
                                  <option value="">— nessuno —</option>
                                  {data.templates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        )}
                        {noneChosen && (
                          <div style={{ fontSize: 11.5, color: "var(--warning-fg)", fontWeight: 600, marginTop: 6 }}>
                            ⚠ Nessun questionario: i corsi {COURSE_TYPES[type].label} non riceveranno il feedback.
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: "top", paddingTop: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                          {!isSplit && unified ? (
                            <button
                              className="btn btn-sm btn-ghost"
                              disabled={busy}
                              onClick={() => setSplit((s) => new Set(s).add(type))}
                              title="Usa un questionario diverso per online e presenza"
                            >
                              Differenzia per erogazione
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-ghost"
                              disabled={busy}
                              onClick={() => unifyRow(type)}
                              title="Torna a un solo questionario per entrambe (vale la scelta di 'In presenza')"
                            >
                              Unifica (usa «In presenza» per entrambe)
                            </button>
                          )}
                          {lastChange?.type === type && (
                            <button className="btn btn-sm" disabled={busy} onClick={undoLast}>
                              ↩ Annulla ultima modifica
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-2)", fontSize: 11.5, color: "var(--text-4)" }}>
            Le modifiche valgono per i <strong>prossimi</strong> link feedback. Le risposte già
            raccolte non cambiano e restano leggibili nei report dei corsi passati.
          </div>
        </div>
      )}

      {/* ── Student-style PREVIEW ── */}
      {preview && active && (
        <div style={plOverlay} onClick={() => setPreview(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Anteprima studente: ${active.name}`}
            style={{ ...plDialog, maxWidth: 620, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 14 }}>Anteprima studente · {active.name}</strong>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <PreviewLangPicker
                  questions={questions}
                  translations={active.translations}
                  lang={previewLang}
                  onChange={setPreviewLang}
                />
                <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setPreview(false)} title="Chiudi">
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
            <div style={{ padding: 20, overflow: "auto" }}>
              {questions.map((q, i) => (
                <PreviewQuestion key={q.id} q={q} i={i} lang={previewLang} translations={active.translations} />
              ))}
              <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 10 }}>
                Anteprima statica: così vedrà le domande lo studente (una per schermata, nel suo link).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Question edit modal (unchanged) ── */}
      {modalQ && openIdx != null && (
        <div style={plOverlay} onClick={() => setOpenIdx(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Modifica domanda ${openIdx + 1}`}
            style={{ ...plDialog, maxWidth: 860, maxHeight: "92vh", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 14 }}>
                Domanda {openIdx + 1} di {questions.length} · {active?.name ?? ""}
              </strong>
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setOpenIdx(null)} title="Chiudi (Esc)">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div style={{ padding: 22, overflow: "auto" }}>
              <QuestionDetail
                q={modalQ}
                cats={null}
                onChange={(patch) => updateQuestion(openIdx, patch)}
                onChangeType={(type) => changeType(openIdx, type)}
                onDuplicate={() => {
                  setQuestions([...questions.slice(0, openIdx + 1), { ...modalQ, id: genId() }, ...questions.slice(openIdx + 1)]);
                  setOpenIdx(openIdx + 1);
                }}
                onDelete={() => removeQuestion(openIdx)}
                onCommitCategory={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Preview helpers ──────────────────────────────────────────────────────────

/** EN/JA buttons light up only when EVERY question shown is translated (same
 *  all-or-nothing rule as the public runner's language gate). Judges the SAME
 *  question array the preview renders — unsaved drafts included. */
function PreviewLangPicker({
  questions,
  translations,
  lang,
  onChange,
}: {
  questions: ExamQuestion[];
  translations: FeedbackTemplate["translations"];
  lang: PreviewLang;
  onChange: (l: PreviewLang) => void;
}) {
  const fully = (l: "en" | "ja") =>
    questions.length > 0 &&
    questions.every((q) => {
      const tr = translations?.[q.id]?.[l];
      return !!tr?.text && ((q.options?.length ?? 0) === 0 || (tr.options?.length ?? 0) >= (q.options?.length ?? 0));
    });
  return (
    <div className="segmented">
      {(["it", "en", "ja"] as PreviewLang[]).map((l) => {
        const enabled = l === "it" || fully(l);
        return (
          <button
            key={l}
            className={lang === l ? "on" : ""}
            disabled={!enabled}
            title={enabled ? "" : "Traduzione incompleta: si mostra l'italiano"}
            onClick={() => onChange(l)}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function PreviewQuestion({
  q,
  i,
  lang,
  translations,
}: {
  q: ExamQuestion;
  i: number;
  lang: PreviewLang;
  translations: FeedbackTemplate["translations"];
}) {
  const tr = lang === "it" ? undefined : translations?.[q.id]?.[lang];
  const text = tr?.text || q.text;
  const options = tr?.options?.length ? tr.options : (q.options ?? []);
  const untranslated = lang !== "it" && !tr?.text;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-2)" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
        <span className="mono" style={{ color: "var(--text-4)", marginRight: 8, fontSize: 11 }}>
          {i + 1}.
        </span>
        {text}
        {untranslated && (
          <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: 10 }}>
            non tradotta
          </span>
        )}
      </div>
      {q.type === "rating" ? (
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              aria-hidden
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "1.5px solid var(--border)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "var(--text-3)",
              }}
            >
              {n}
            </span>
          ))}
        </div>
      ) : q.type === "single" || q.type === "multi" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((o, x) => (
            <span key={x} style={{ fontSize: 13, color: "var(--text-2)" }}>
              <span aria-hidden style={{ marginRight: 8, color: "var(--text-4)" }}>
                {q.type === "single" ? "○" : "☐"}
              </span>
              {o}
            </span>
          ))}
        </div>
      ) : (
        <div
          style={{
            border: "1.5px dashed var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--text-4)",
          }}
        >
          Risposta libera dello studente…
        </div>
      )}
    </div>
  );
}
