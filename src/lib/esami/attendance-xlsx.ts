import "server-only";

// Builds the official "CSS Attendance List" workbook for a course, pre-filling
// what we have (course/educator/dates/venue + per-student name/email/score/result)
// and leaving the rest blank for manual completion.
import ExcelJS from "exceljs";

export interface AttendanceRow {
  firstName: string;
  lastName: string;
  email: string;
  score?: number | null;
  passFail?: string;
}

export interface AttendanceInput {
  course: string;
  franchise: string;
  educator: string;
  courseDate: string;
  examDate: string;
  venue: string;
  rows: AttendanceRow[];
}

// Column order matches the template (A is intentionally empty).
const HEADERS = [
  "",
  "Course",
  "Franchise Name",
  "Sake Educator\n Name",
  "Course Date \n(e.g. 26 February 2023)",
  "Exam Date\n(e.g. 27 February 2023)",
  "Venue",
  "Gender (M/F/Other)",
  "First Name\n (in CAPITAL)",
  "Last Name\n (in CAPITAL)",
  "Certificate Name\n(If different from first & last name; In CAPITALS)",
  "Sake Sommelier Number",
  "Certification Date (same as Exam Date)",
  "E-Mail",
  "Residency",
  "Occupation",
  "DOB \n(1 January 1980)",
  "Contact Number",
  "Nationality",
  "Exam \nScore",
  "PASS \n/ FAIL",
  "NOTE",
  "Print request\n (YES or NO)",
];

export async function buildAttendanceXlsx(input: AttendanceInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SSA Platform";
  const ws = wb.addWorksheet("CSS_AttendanceList");

  const header = ws.addRow(HEADERS);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 42;

  for (const r of input.rows) {
    ws.addRow([
      "",
      input.course,
      input.franchise,
      input.educator,
      input.courseDate,
      input.examDate,
      input.venue,
      "", // Gender
      r.firstName,
      r.lastName,
      "", // Certificate Name
      "", // Sake Sommelier Number
      "", // Certification Date
      r.email,
      "", // Residency
      "", // Occupation
      "", // DOB
      "", // Contact Number
      "", // Nationality
      r.score ?? "",
      r.passFail ?? "",
      "", // NOTE
      "", // Print request
    ]);
  }

  // Reasonable column widths.
  const widths = [2, 26, 24, 20, 22, 22, 18, 16, 18, 18, 24, 18, 22, 26, 14, 16, 16, 16, 14, 10, 10, 16, 14];
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 16;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
