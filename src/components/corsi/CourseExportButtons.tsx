"use client";

import { Icon } from "@/components/ui";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { ProgramDay, Student } from "@/lib/domain";

export function CourseExportButtons({
  title,
  students,
  program,
  labelStudents,
  labelSake,
}: {
  title: string;
  students: Student[];
  program: ProgramDay[];
  labelStudents: string;
  labelSake: string;
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

  const exportSakes = () => {
    const rows = program.flatMap((d) =>
      d.sakes.map((sk) => [`Giorno ${d.day}`, sk.code, sk.name, sk.type, sk.qty, sk.cost]),
    );
    downloadCsv(
      `sake-${slug}`,
      toCsv(["Giorno", "Codice", "Nome", "Tipo", "Qtà", "Costo €"], rows),
    );
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
