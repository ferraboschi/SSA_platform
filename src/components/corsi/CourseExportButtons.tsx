"use client";

import { Icon } from "@/components/ui";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { Student } from "@/lib/domain";

export function CourseExportButtons({
  courseId,
  title,
  students,
  labelStudents,
  labelSake,
  sakeNoTemplateMsg,
}: {
  courseId: string;
  title: string;
  students: Student[];
  labelStudents: string;
  labelSake: string;
  sakeNoTemplateMsg: string;
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
          "",
        ]),
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
    </>
  );
}
