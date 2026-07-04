"use client";

import { useState } from "react";
import { Icon, Badge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { ExamQuestion, ExamQuestionType } from "@/lib/domain";
import { QUESTION_EST_SEC } from "@/lib/esami";

// "match" is authorable in theory but the student runner has no match UI (it
// falls through to a blank textarea → unanswerable, silently manual-graded), so
// it must not be selectable here. Existing match data is left untouched: its
// label stays in `esami.qt` for read-only display; it's only dropped from the
// type PICKERS so no new match question can be created. When authoring is
// unblocked in the runner, remove this filter.
const AUTHORABLE_QT = (entries: [string, string][]) =>
  entries.filter(([k]) => k !== "match");

// Short "how this works" tip shown above each question type in the editor.
const TYPE_TIPS: Record<string, string> = {
  single: "Scelta singola: lo studente sceglie UNA risposta. Tocca il cerchio per segnare la corretta. Auto-correzione.",
  multi: "Scelta multipla: lo studente può sceglierne PIÙ di una. Segna TUTTE le corrette. Auto-correzione (devono coincidere esattamente).",
  truefalse: "Vero / Falso: due opzioni, segna quella corretta. Auto-correzione.",
  image: "Identifica immagine: mostra un'immagine (incolla l'URL qui sotto) e lo studente sceglie l'opzione corretta. Segna la corretta. Auto-correzione.",
  fill: "Riempi spazio: lo studente DIGITA la risposta. Elenca le risposte accettate separate da virgola (maiuscole/minuscole e spazi non contano). Auto-correzione.",
  open: "Testo libero: risposta aperta, corretta dall'AI in base alla knowledge base SSA (suggerimento, poi confermi a mano).",
  match: "Abbinamento: lo studente abbina gli elementi di sinistra a quelli di destra. ⚠ Non ancora disponibile nel test studente.",
  order: "Ordina: lo studente mette gli elementi nell'ordine corretto. ⚠ Non ancora disponibile nel test studente.",
  rating: "Valutazione 1–5 stelle (usata nel modulo di feedback di fine corso, non nell'esame).",
};

export function AddQuestionRow({ onAdd }: { onAdd: (type: ExamQuestionType) => void }) {
  const t = useT().esami.editor;
  const qt = useT().esami.qt;
  const [type, setType] = useState<ExamQuestionType>("single");
  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 12px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
      <select
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as ExamQuestionType)}
        style={{ height: 30, fontSize: 11.5, flex: 1 }}
      >
        {AUTHORABLE_QT(Object.entries(qt)).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </select>
      <button className="btn btn-sm btn-primary" onClick={() => onAdd(type)}>
        <Icon name="plus" size={11} />
        {t.addQuestionShort}
      </button>
    </div>
  );
}

export function QuestionDetail({
  q,
  cats,
  onChange,
  onChangeType,
  onDuplicate,
  onDelete,
  onCommitCategory,
}: {
  q: ExamQuestion;
  /** Known category labels for this family/section; null where categorization
   *  doesn't apply (feedback). */
  cats: string[] | null;
  onChange: (patch: Partial<ExamQuestion>) => void;
  onChangeType: (type: ExamQuestionType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Persist a newly-typed category so it's reusable everywhere from now on. */
  onCommitCategory: (label: string) => void;
}) {
  const t = useT().esami.qEditor;
  const te = useT().esami.editor;
  const qt = useT().esami.qt;
  const est = QUESTION_EST_SEC[q.type] || 10;
  const correctNums = ((q.correct ?? []) as Array<number | string>).filter(
    (c): c is number => typeof c === "number",
  );
  const correctSet = new Set(correctNums);

  const setOption = (i: number, val: string) => {
    const options = (q.options ?? []).map((o, x) => (x === i ? val : o));
    onChange({ options });
  };
  const addOption = () => onChange({ options: [...(q.options ?? []), "Nuova opzione"] });
  const removeOption = (i: number) => {
    const options = (q.options ?? []).filter((_, x) => x !== i);
    const correct = correctNums.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    onChange({ options, correct });
  };
  const toggleCorrect = (i: number) => {
    if (q.type === "multi") {
      const next = correctSet.has(i) ? correctNums.filter((c) => c !== i) : [...correctNums, i];
      onChange({ correct: next.sort((a, b) => a - b) });
    } else {
      onChange({ correct: [i] });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            className="select"
            value={q.type}
            onChange={(e) => onChangeType(e.target.value as ExamQuestionType)}
            style={{ height: 30, width: "auto", fontSize: 12.5, fontWeight: 600 }}
          >
            {/* Keep the current type selectable even if it's filtered out
                (e.g. a legacy "match" question) so the dropdown still shows
                its own value; new selection of "match" stays impossible. */}
            {AUTHORABLE_QT(Object.entries(qt))
              .concat(q.type === "match" ? [["match", qt.match]] : [])
              .map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
          </select>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={11} />
            {format(t.stima, { s: est })}
          </span>
          {q.important && <Badge tone="oro">{t.importante}</Badge>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm" title={te.duplicateQuestion} onClick={onDuplicate}>
            <Icon name="copy" size={12} />
          </button>
          <button className="btn btn-sm btn-ghost" title={te.deleteQuestion} onClick={onDelete}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {/* How this question type works (for the operator building the exam). */}
      {TYPE_TIPS[q.type] && (
        <div
          style={{
            display: "flex",
            gap: 7,
            alignItems: "flex-start",
            fontSize: 12,
            color: "var(--text-3)",
            background: "var(--indigo-50)",
            border: "1px solid var(--indigo-100)",
            borderRadius: 7,
            padding: "8px 10px",
            marginBottom: 14,
            lineHeight: 1.45,
          }}
        >
          <Icon name="info" size={13} className="text-2" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{TYPE_TIPS[q.type]}</span>
        </div>
      )}

      <div className="field">
        <div className="field-label">{t.qText}</div>
        <textarea
          className="textarea"
          value={q.text}
          rows={3}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
        {["it", "en", "ja"].map((l) => (
          <button
            key={l}
            className={`pill ${q.lang === l ? "on" : ""}`}
            onClick={() => onChange({ lang: l })}
          >
            {l.toUpperCase()}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{t.translations}</span>
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div className="field">
        <div className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {q.type === "open" ? t.labelOpen : q.type === "match" ? t.labelMatch : q.type === "order" ? t.labelOrder : t.labelOptions}
          </span>
          {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
            <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400 }}>{te.markCorrectHint}</span>
          )}
        </div>

        {(q.type === "single" || q.type === "multi" || q.type === "truefalse" || q.type === "image") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.type === "image" && (
              <div style={{ marginBottom: 8 }}>
                <input
                  className="input"
                  placeholder="URL immagine (es. https://…/etichetta.jpg)"
                  value={q.imageId ?? ""}
                  onChange={(e) => onChange({ imageId: e.target.value })}
                  style={{ marginBottom: 8 }}
                />
                {q.imageId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.imageId}
                    alt=""
                    style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "contain", border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div className="ph-img" style={{ height: 120 }}>{t.imgPlaceholder}</div>
                )}
              </div>
            )}
            {(q.options ?? []).map((opt, i) => {
              const isC = correctSet.has(i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: isC ? "var(--success-bg)" : "var(--surface)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCorrect(i)}
                    title="Segna corretta"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: q.type === "multi" ? 3 : "50%",
                      border: "1.5px solid " + (isC ? "var(--success)" : "var(--border-strong)"),
                      display: "grid",
                      placeItems: "center",
                      background: isC ? "var(--success)" : "transparent",
                      color: "white",
                      flexShrink: 0,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isC && <Icon name="check" size={10} />}
                  </button>
                  <input
                    className="input"
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent" }}
                  />
                  {q.type !== "truefalse" && (
                    <button className="btn btn-icon btn-sm btn-ghost" onClick={() => removeOption(i)}>
                      <Icon name="trash" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
            {q.type !== "truefalse" && (
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={addOption}>
                <Icon name="plus" size={11} />
                {t.addOption}
              </button>
            )}
          </div>
        )}

        {q.type === "open" && (
          <div className="card card-pad" style={{ background: "var(--indigo-50)", border: "1px solid var(--indigo-100)", boxShadow: "none" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Icon name="sparkle" size={14} className="text-3" />
              <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                {format(t.aiNotePre, { points: q.points })}
                <strong>{t.aiNoteStrong}</strong>
                {t.aiNotePost}
              </div>
            </div>
          </div>
        )}

        {q.type === "fill" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>{t.fillHint}</div>
            <input
              className="input"
              value={((q.correct ?? []) as Array<number | string>).join(", ")}
              onChange={(e) => onChange({ correct: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        )}

        {q.type === "match" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.pairs ?? []).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr 28px", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  value={p.l}
                  onChange={(e) => onChange({ pairs: (q.pairs ?? []).map((x, xi) => (xi === i ? { ...x, l: e.target.value } : x)) })}
                />
                <div style={{ textAlign: "center", color: "var(--text-4)" }}>↔</div>
                <input
                  className="input"
                  value={p.r}
                  onChange={(e) => onChange({ pairs: (q.pairs ?? []).map((x, xi) => (xi === i ? { ...x, r: e.target.value } : x)) })}
                />
                <button className="btn btn-icon btn-sm btn-ghost" onClick={() => onChange({ pairs: (q.pairs ?? []).filter((_, xi) => xi !== i) })}>
                  <Icon name="trash" size={11} />
                </button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onChange({ pairs: [...(q.pairs ?? []), { l: "", r: "" }] })}>
              <Icon name="plus" size={11} />
              {t.addOption}
            </button>
          </div>
        )}

        {q.type === "order" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.items ?? []).map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-4)", minWidth: 22 }}>{i + 1}</span>
                <input
                  className="input"
                  value={it}
                  onChange={(e) => onChange({ items: (q.items ?? []).map((x, xi) => (xi === i ? e.target.value : x)) })}
                  style={{ flex: 1, border: "none", height: "auto", padding: 0, background: "transparent" }}
                />
                <button className="btn btn-icon btn-sm btn-ghost" onClick={() => onChange({ items: (q.items ?? []).filter((_, xi) => xi !== i) })}>
                  <Icon name="trash" size={11} />
                </button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => onChange({ items: [...(q.items ?? []), ""] })}>
              <Icon name="plus" size={11} />
              {t.addOption}
            </button>
          </div>
        )}
      </div>

      <div className="divider" style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field">
          <div className="field-label">{t.categoria}</div>
          {/* Pick-or-type combobox: a native datalist offers every known
              category for this family, but the field stays free text so a
              brand-new one can be typed — committed to the shared list on
              blur (owner: avoid duplicate/typo'd categories across sections). */}
          <input
            className="input"
            list="exam-cat-options"
            value={q.cat}
            onChange={(e) => onChange({ cat: e.target.value })}
            onBlur={(e) => onCommitCategory(e.target.value)}
            placeholder="Scegli o scrivi una categoria…"
          />
          {cats && (
            <datalist id="exam-cat-options">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
        </div>
        <div className="field">
          <div className="field-label">{t.puntiField}</div>
          <input
            className="input"
            type="number"
            value={q.points}
            onChange={(e) => onChange({ points: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div className="field">
          <div className="field-label">{t.importanteField}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={!!q.important}
              onChange={(e) => onChange({ important: e.target.checked })}
            />
            {t.importanteCheck}
          </label>
        </div>
      </div>
    </div>
  );
}
