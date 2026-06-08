"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { CourseStat } from "./CourseStat";
import { IscrittiSection } from "./IscrittiSection";
import { ProgrammaEconomiaSection } from "./ProgrammaEconomiaSection";
import { ExamLinkPanel } from "./ExamLinkPanel";
import { EsitiTab } from "@/components/esami/EsitiTab";
import type { EsameData, ProgrammaData, TemplateData } from "@/lib/corsi";
import type { CourseProgramOverlay } from "@/lib/corsi/program-overlay";
import type { Student } from "@/lib/domain";

type SectionId = "iscritti" | "programma" | "esame" | "esiti";

export function CourseSections({
  courseId,
  courseTitle = "",
  enrolled,
  programSakeCount,
  students,
  whatsappLink,
  programma,
  programOverlay,
  templates,
  esame,
  examFamily = null,
}: {
  courseId: string;
  courseTitle?: string;
  enrolled: number;
  programSakeCount: number;
  students: Student[];
  whatsappLink: string;
  programma: ProgrammaData;
  programOverlay?: CourseProgramOverlay;
  templates: TemplateData[];
  esame: EsameData | null;
  examFamily?: "nihonshu" | "shochu" | null;
}) {
  const tr = useT();
  const t = tr.corsi.detail;
  const hasExam = Boolean(esame) || Boolean(examFamily);
  const requestedTab = useSearchParams().get("tab");
  const initialSection: SectionId =
    (requestedTab === "esame" || requestedTab === "esiti") && hasExam
      ? (requestedTab as SectionId)
      : requestedTab === "programma"
        ? "programma"
        : "iscritti";
  const [section, setSection] = useState<SectionId>(initialSection);

  const tabs: { id: SectionId; label: string; n: number; accent?: boolean }[] = [
    { id: "iscritti", label: t.tabIscritti, n: enrolled },
    { id: "programma", label: t.tabProgramma, n: programSakeCount },
    ...(hasExam
      ? [
          { id: "esame" as const, label: t.tabEsame, n: esame?.totalQuestions ?? 0, accent: true },
          { id: "esiti" as const, label: "Esiti", n: 0 },
        ]
      : []),
  ];

  return (
    <>
      <div className="tabs">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            className={`tab ${section === tb.id ? "active" : ""}`}
            onClick={() => setSection(tb.id)}
          >
            {tb.label}
            <span className="tab-count">{tb.n}</span>
          </button>
        ))}
      </div>

      {section === "iscritti" && <IscrittiSection students={students} whatsappLink={whatsappLink} />}
      {section === "programma" && (
        <ProgrammaEconomiaSection
          courseId={courseId}
          data={programma}
          programOverlay={programOverlay}
          templates={templates}
        />
      )}
      {section === "esame" && (
        <div style={{ display: "grid", gap: 18 }}>
          {esame && <EsameTabSummary courseId={courseId} esame={esame} />}
          {examFamily && <ExamLinkPanel courseId={courseId} family={examFamily} />}
        </div>
      )}
      {section === "esiti" && examFamily && (
        <EsitiTab courseId={courseId} courseTitle={courseTitle} family={examFamily} />
      )}
    </>
  );
}

function EsameTabSummary({ courseId, esame }: { courseId: string; esame: EsameData }) {
  const tr = useT();
  const t = tr.corsi.examSummary;
  const isShochu = esame.type === "shochu";
  const famLabel = isShochu ? t.famShochu : t.famNihonshu;

  return (
    <div>
      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 14,
          alignItems: "center",
          background: "var(--indigo-50)",
          border: "1px solid var(--indigo-100)",
          boxShadow: "none",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "var(--indigo)",
            color: "white",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="exam" size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
            {format(t.sub, { fam: famLabel })}
          </div>
        </div>
        <Link className="btn btn-primary" href={`/esami/${courseId}`}>
          <Icon name="arrow" size={13} />
          {t.openExam}
        </Link>
      </div>

      <div className="kpi-grid cols-4">
        <CourseStat
          label={t.family}
          value={isShochu ? t.shochu : t.nihonshu}
          sub={isShochu ? t.certShochu : t.certNihonshu}
        />
        <CourseStat
          label={t.finalExam}
          value={esame.examDayNo ? format(t.dayN, { n: esame.examDayNo }) : "—"}
          sub={esame.examDateLabel ?? ""}
        />
        <CourseStat label={t.miniTest} value={`${esame.miniDone}/${esame.miniTotal}`} sub={t.perDay} />
        <CourseStat
          label={esame.done ? t.promossi : t.stato}
          value={esame.done ? `${esame.passed}/${esame.resultsTotal}` : esame.live ? t.inProgress : t.toDo}
          sub={
            esame.done
              ? `${esame.resultsTotal ? Math.round((esame.passed / esame.resultsTotal) * 100) : 0}%`
              : format(t.questions, { n: esame.totalQuestions })
          }
          last
        />
      </div>
    </div>
  );
}
