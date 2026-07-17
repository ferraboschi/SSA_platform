"use client";

// Feedback questionnaires as NAMED entities (owner batch 13): create with a
// free name, rename, duplicate (structure + translations), delete (refused
// while assigned), plus the course-type × delivery ASSIGNMENT MATRIX that
// replaces the old hard-coded short/long variants. Question editing reuses
// the same QuestionDetail modal as the exam editor.

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

const DELIVERIES: { key: FeedbackDelivery; label: string }[] = [
  { key: "presenza", label: "In presenza" },
  { key: "online", label: "Online" },
];

export function FeedbackTemplatesEditor() {
  const esami = useT().esami;
  const [data, setData] = useState<FeedbackAdminData>({
    templates: [],
    assignments: {},
    version: 0,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Unsaved question edits of the ACTIVE template only (list ops are instant).
  const [draftQs, setDraftQs] = useState<ExamQuestion[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadFeedbackAdminAction()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setActiveId(d.templates[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = data.templates.find((t) => t.id === activeId) ?? null;
  const questions = draftQs ?? active?.questions ?? [];
  const dirty = draftQs != null;

  /** Where a template is assigned, as compact labels for the list badges. */
  const usedBy = (id: string): string[] => {
    const out: string[] = [];
    for (const [type, cell] of Object.entries(data.assignments)) {
      const label = COURSE_TYPES[type as CourseTypeKey]?.label ?? type;
      const both = cell?.presenza === id && cell?.online === id;
      if (both) out.push(label);
      else if (cell?.presenza === id) out.push(`${label} (presenza)`);
      else if (cell?.online === id) out.push(`${label} (online)`);
    }
    return out;
  };

  const applyResult = (res: FeedbackMutationResult, okMsg: string) => {
    if (res.ok && res.data) {
      setData(res.data);
      setMsg(okMsg);
    } else {
      setMsg(res.error || "Operazione non riuscita.");
    }
  };

  const create = () => {
    if (dirty && !window.confirm("Modifiche non salvate alle domande: le perdi continuando. Procedere?"))
      return;
    const name = window.prompt("Nome del nuovo questionario:", "");
    if (name == null || !name.trim()) return;
    startBusy(async () => {
      const res = await createFeedbackTemplateAction(name);
      applyResult(res, "Creato ✓");
      if (res.ok && res.createdId) {
        setActiveId(res.createdId);
        setDraftQs(null);
      }
    });
  };

  const rename = (id: string, current: string) => {
    const name = window.prompt("Nuovo nome:", current);
    if (name == null || !name.trim() || name.trim() === current) return;
    startBusy(async () => applyResult(await renameFeedbackTemplateAction(id, name), "Rinominato ✓"));
  };

  const duplicate = (id: string) => {
    if (dirty && !window.confirm("Modifiche non salvate alle domande: le perdi continuando. Procedere?"))
      return;
    startBusy(async () => {
      const res = await duplicateFeedbackTemplateAction(id);
      applyResult(res, "Duplicato ✓ (domande e traduzioni copiate)");
      if (res.ok && res.createdId) {
        setActiveId(res.createdId);
        setDraftQs(null);
      }
    });
  };

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Eliminare definitivamente «${name}»? Le risposte già raccolte restano salvate.`)) return;
    startBusy(async () => {
      const res = await deleteFeedbackTemplateAction(id);
      applyResult(res, "Eliminato ✓");
      if (res.ok && activeId === id) {
        setActiveId(res.data?.templates[0]?.id ?? null);
        setDraftQs(null);
      }
    });
  };

  const assign = (type: CourseTypeKey, delivery: FeedbackDelivery, templateId: string) => {
    startBusy(async () =>
      applyResult(
        await setFeedbackAssignmentAction(type, delivery, templateId || null),
        "Assegnazione salvata ✓",
      ),
    );
  };

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
        setMsg("Salvato ✓");
      } else setMsg(res.error || "Salvataggio non riuscito");
    });
  };

  const modalQ = openIdx != null ? (questions[openIdx] ?? null) : null;

  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Feedback di fine corso</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            Questionari con nome libero: crea, duplica, rinomina, elimina — poi assegnali per{" "}
            <strong>tipo di corso ed erogazione</strong> nella matrice. Sempre facoltativo per lo studente.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {msg && (
            <span style={{ fontSize: 12, color: msg.includes("✓") ? "var(--success-fg)" : "var(--danger-fg)" }}>{msg}</span>
          )}
          <button className="btn btn-sm" onClick={create} disabled={busy}>
            <Icon name="plus" size={12} />
            Nuovo questionario
          </button>
          <button className="btn btn-sm btn-primary" onClick={saveQuestions} disabled={busy || !dirty}>
            <Icon name="save" size={12} />
            {busy ? "Salvo…" : "Salva domande"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>Carico…</div>
      ) : (
        <>
          {/* ── Questionnaire list ── */}
          <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
            {data.templates.map((t) => {
              const uses = usedBy(t.id);
              const isActive = t.id === activeId;
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--border-2)",
                    background: isActive ? "var(--indigo-50)" : undefined,
                  }}
                >
                  <button
                    onClick={() => {
                      if (dirty && !window.confirm("Modifiche non salvate alle domande: le perdi cambiando questionario. Continuare?")) return;
                      setActiveId(t.id);
                      setDraftQs(null);
                      setOpenIdx(null);
                    }}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 500, color: "var(--text)" }}>
                      {t.name}
                    </span>{" "}
                    <span className="text-3" style={{ fontSize: 11.5 }}>
                      · {t.questions.length} domande
                      {t.translations && Object.keys(t.translations).length > 0 ? " · EN/JA" : ""}
                    </span>
                    <span style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      {uses.length === 0 ? (
                        <Badge tone="neutral">non assegnato</Badge>
                      ) : (
                        uses.map((u) => (
                          <Badge key={u} tone="azzurro">
                            {u}
                          </Badge>
                        ))
                      )}
                    </span>
                  </button>
                  <button className="btn btn-sm btn-ghost" title="Rinomina" disabled={busy} onClick={() => rename(t.id, t.name)}>
                    <Icon name="edit" size={12} />
                  </button>
                  <button className="btn btn-sm btn-ghost" title="Duplica (domande e traduzioni)" disabled={busy} onClick={() => duplicate(t.id)}>
                    <Icon name="copy" size={12} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    title={uses.length > 0 ? "In uso nella matrice: sostituiscilo prima di eliminarlo" : "Elimina"}
                    disabled={busy || uses.length > 0}
                    onClick={() => remove(t.id, t.name)}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              );
            })}
            {data.templates.length === 0 && (
              <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>
                Nessun questionario. Creane uno.
              </div>
            )}
          </div>

          {/* ── Assignment matrix ── */}
          <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-2)" }}>
              <strong style={{ fontSize: 13 }}>Chi usa cosa</strong>{" "}
              <span className="text-3" style={{ fontSize: 11.5 }}>
                — il corso pesca il questionario dalla sua cella (tipo × erogazione).
              </span>
            </div>
            <div className="table-wrap" style={{ boxShadow: "none", borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo di corso</th>
                    {DELIVERIES.map((d) => (
                      <th key={d.key}>{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(COURSE_TYPES) as CourseTypeKey[]).map((type) => (
                    <tr key={type}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{COURSE_TYPES[type].label}</td>
                      {DELIVERIES.map((d) => (
                        <td key={d.key}>
                          <select
                            className="select"
                            style={{ width: "100%", maxWidth: 280 }}
                            disabled={busy}
                            value={data.assignments[type]?.[d.key] ?? ""}
                            onChange={(e) => assign(type, d.key, e.target.value)}
                          >
                            <option value="">— nessuno —</option>
                            {data.templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Question editor for the ACTIVE questionnaire ── */}
          {active && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-2)" }}>
                <strong style={{ fontSize: 13 }}>Domande di «{active.name}»</strong>
                {dirty && (
                  <span style={{ fontSize: 11.5, color: "var(--warning-fg)", marginLeft: 8 }}>
                    modifiche non salvate
                  </span>
                )}
              </div>
              {questions.length === 0 ? (
                <div className="text-3" style={{ padding: 18, fontSize: 12.5 }}>
                  Nessuna domanda. Aggiungine una.
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
          )}
        </>
      )}

      {modalQ && openIdx != null && (
        <div style={plOverlay} onClick={() => setOpenIdx(null)}>
          <div style={{ ...plDialog, maxWidth: 860, maxHeight: "92vh", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
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
