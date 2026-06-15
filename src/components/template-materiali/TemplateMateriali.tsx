"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { saveTemplateAction, deleteTemplateAction } from "@/lib/data/template-actions";
import {
  defaultMaterialCosts,
  type CourseTypeKey,
  type MaterialTemplate,
} from "@/lib/domain";
import { TemplateEditor } from "./template-editor";
import { TemplateLibrary } from "./template-library";

function tmDeepClone(t: MaterialTemplate): MaterialTemplate {
  return {
    ...t,
    materiali: { ...t.materiali, extra: (t.materiali.extra || []).map((c) => ({ ...c })) },
    days: t.days.map((d) => ({ ...d, sakes: d.sakes.map((s) => ({ ...s })) })),
  };
}

export function TemplateMateriali({
  initialTemplates,
  authorName,
}: {
  initialTemplates: MaterialTemplate[];
  authorName: string;
}) {
  const tm = useT().templateMateriali;
  const [templates, setTemplates] = useState<MaterialTemplate[]>(() => initialTemplates.map(tmDeepClone));
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CourseTypeKey | "">("");
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Templates auto-save on every change; flash a confirmation so it's visible.
  // Errors are caught so a transient save failure shows a toast instead of
  // bubbling to the route error boundary ("Pagina non caricata").
  const persist = (t: MaterialTemplate) =>
    startSave(async () => {
      try {
        await saveTemplateAction(t);
        flash(tm.toast.saved);
      } catch {
        flash("Salvataggio non riuscito — riprova");
      }
    });

  const open = openId ? templates.find((t) => t.id === openId) ?? null : null;

  const updateTemplate = (id: string, next: MaterialTemplate) => {
    setTemplates((arr) => arr.map((t) => (t.id === id ? next : t)));
    persist(next);
  };
  const addTemplate = () => {
    const id = "mtpl-" + Date.now();
    const t: MaterialTemplate = {
      id,
      name: tm.newTemplateName,
      type: "certificato",
      days: [{ day: 1, name: format(tm.newDayName, { n: 1 }), sakes: [] }],
      materiali: defaultMaterialCosts("certificato"),
      description: "",
      lastUsed: "—",
      uses: 0,
      createdBy: authorName,
    };
    setTemplates((arr) => [t, ...arr]);
    setOpenId(id);
    persist(t);
  };
  const duplicateTemplate = (t: MaterialTemplate) => {
    const id = "mtpl-" + Date.now();
    const copy: MaterialTemplate = {
      ...tmDeepClone(t),
      id,
      name: t.name + tm.duplicateSuffix,
      lastUsed: "—",
      uses: 0,
      createdBy: authorName,
    };
    setTemplates((arr) => [copy, ...arr]);
    persist(copy);
    flash(format(tm.toast.duplicated, { name: copy.name }));
  };
  const deleteTemplate = (t: MaterialTemplate) => {
    if (!confirm(format(tm.confirmDelete, { name: t.name }))) return;
    const prev = templates;
    setTemplates((arr) => arr.filter((x) => x.id !== t.id));
    if (openId === t.id) setOpenId(null);
    startSave(async () => {
      try {
        await deleteTemplateAction(t.id);
        flash(format(tm.toast.deleted, { name: t.name }));
      } catch {
        setTemplates(prev); // roll back so the UI matches the DB
        flash(tm.toast.deleteError ?? "Eliminazione non riuscita");
      }
    });
  };

  return (
    <div className="page">
      {(toast || isSaving) && (
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
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name={isSaving ? "refresh" : "check"} size={13} className={isSaving ? "is-spinning" : undefined} />
          {isSaving ? tm.toast.saving : toast}
        </div>
      )}

      {open ? (
        <TemplateEditor
          template={open}
          onChange={(next) => updateTemplate(open.id, next)}
          onBack={() => setOpenId(null)}
          onFlash={flash}
        />
      ) : (
        <TemplateLibrary
          templates={templates}
          filter={filter}
          setFilter={setFilter}
          onOpen={setOpenId}
          onCreate={addTemplate}
          onDuplicate={duplicateTemplate}
          onDelete={deleteTemplate}
        />
      )}
    </div>
  );
}
