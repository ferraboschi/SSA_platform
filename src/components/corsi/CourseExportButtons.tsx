"use client";

import { Icon } from "@/components/ui";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { Student } from "@/lib/domain";

const EXAM_RESULT_LABEL: Record<string, string> = {
  passed: "Promosso",
  retrial: "Da riprovare",
  failed: "Non superato",
};

export function CourseExportButtons({
  courseId,
  title,
  students,
  labelStudents,
  labelSake,
  labelPromossi,
  sakeNoTemplateMsg,
  examsDone,
}: {
  courseId: string;
  title: string;
  students: Student[];
  labelStudents: string;
  labelSake: string;
  labelPromossi: string;
  sakeNoTemplateMsg: string;
  /** Gates "Excel studenti promossi" — visible always, clickable only once the
   *  course's exams are graded (owner: don't offer a promoted-students list
   *  before there's anything to report). */
  examsDone: boolean;
}) {
  const slug = title.replace(/[^\w-]+/g, "-").toLowerCase();

  const exportStudents = () =>
    downloadCsv(
      `iscritti-${slug}`,
      toCsv(
        ["Nome", "Email", "Telefono", "Pagato €", "Codice sconto", "Esito esame"],
        students.map((s) => [
          s.name,
          s.email,
          s.phone,
          Math.round(s.amount),
          s.discountCode ?? "",
          s.examResult ? EXAM_RESULT_LABEL[s.examResult] : "",
        ]),
      ),
    );

  const passed = students.filter((s) => s.examResult === "passed");
  const exportPromossi = () =>
    downloadCsv(
      `promossi-${slug}`,
      toCsv(
        ["Nome", "Email", "Telefono"],
        passed.map((s) => [s.name, s.email, s.phone]),
      ),
    );

  // Real .xlsx (searchable, with AutoFilter) built server-side. If the day's
  // programme/template isn't assigned the route returns 409 and we surface the
  // localized message instead of downloading an empty file.
  const exportSakes = async () => {
    const res = await fetch(`/api/corsi/${courseId}/sake-xlsx`);
    if (res.status === 409) {
      const body = await res.json().catch(() => null);
      if (body?.error === "no-template") {
        alert(sakeNoTemplateMsg);
        return;
      }
    }
    if (!res.ok) {
      alert(sakeNoTemplateMsg);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sake-${slug}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button className="btn" onClick={exportStudents} disabled={students.length === 0}>
        <Icon name="download" size={13} />
        {labelStudents}
      </button>
      <button className="btn" onClick={exportSakes}>
        <Icon name="download" size={13} />
        {labelSake}
      </button>
      <button
        className="btn"
        onClick={exportPromossi}
        disabled={!examsDone || passed.length === 0}
        title={!examsDone ? "Disponibile a esami conclusi" : undefined}
      >
        <Icon name="download" size={13} />
        {labelPromossi}
      </button>
    </>
  );
}
