import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { courseRosterStudents } from "@/lib/esami";
import { buildAttendanceXlsx, type AttendanceRow } from "@/lib/esami/attendance-xlsx";

// CSS Attendance List (.xlsx) for a course, pre-filled with what we have. The
// franchise is fixed; columns we don't track stay blank. Admin/manager only.
export const dynamic = "force-dynamic";

const FRANCHISE = "Sake Sommelier Association Italia";

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0].toUpperCase(), last: parts.slice(1).join(" ").toUpperCase() };
}
function passFail(status: string): string {
  return status === "passed" ? "PASS" : status === "failed" ? "FAIL" : status === "retrial" ? "RETRIAL" : "";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasRole(["admin", "manager"]).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ds = await getDataSource();
  const course = /^\d+$/.test(id) ? await ds.courses.getById(id) : await ds.courses.getByHandle(id);
  if (!course) return NextResponse.json({ ok: false, error: "course not found" }, { status: 404 });

  const roster = courseRosterStudents(course).students;
  const results = course.examResults2 ?? [];
  const byEmail = new Map(results.map((r) => [r.email.toLowerCase(), r]));

  // Union: every enrolled student + anyone with a result not on the roster.
  const emails = new Set<string>();
  const rows: AttendanceRow[] = [];
  const push = (name: string, email: string) => {
    const key = email.toLowerCase();
    if (key && emails.has(key)) return;
    if (key) emails.add(key);
    const { first, last } = splitName(name);
    const res = key ? byEmail.get(key) : undefined;
    rows.push({
      firstName: first,
      lastName: last,
      email,
      score: res?.score ?? null,
      passFail: res ? passFail(res.status) : "",
    });
  };
  for (const s of roster) push(s.name, s.email);
  for (const r of results) push(r.name, r.email);

  const buf = await buildAttendanceXlsx({
    course: course.shortTitle || "Corso SSA",
    franchise: FRANCHISE,
    educator: course.educator?.name || "",
    courseDate: `${course.day} ${course.month} ${course.year}`,
    examDate: "",
    venue: course.city || "",
    rows,
  });

  const slug = (course.shortTitle || "corso").normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
