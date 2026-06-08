import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { renderCertificatePdf } from "@/lib/esami/certificate-pdf";
import { loadCourseExamResults } from "@/lib/exam-links/results";
import type { ExamFamily } from "@/lib/domain";

// Per-student exam-result PDF (IT+EN), inline so it can be previewed in an iframe
// and downloaded. Admin/manager only.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasRole(["admin", "manager"]).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: false, error: "missing email" }, { status: 400 });

  const ds = await getDataSource();
  const course = /^\d+$/.test(id) ? await ds.courses.getById(id) : await ds.courses.getByHandle(id);
  if (!course) return NextResponse.json({ ok: false, error: "course not found" }, { status: 404 });
  const family: ExamFamily | null =
    course.type === "certificato" ? "nihonshu" : course.type === "shochu" ? "shochu" : null;
  if (!family) return NextResponse.json({ ok: false, error: "no exam" }, { status: 404 });

  // Real confirmed result from the grading flow (not the demo-only examResults2).
  const subs = await loadCourseExamResults(course.id, family);
  const sub = subs.find((s) => s.studentEmail.toLowerCase() === email && s.currentResult);
  if (!sub) return NextResponse.json({ ok: false, error: "result not found" }, { status: 404 });

  const buf = await renderCertificatePdf({
    name: sub.studentName,
    family,
    status: sub.currentResult as "passed" | "retrial" | "failed",
    score: sub.currentScore ?? sub.autoScore,
    sections: [],
    course: {
      day: course.day,
      month: course.month,
      year: course.year,
      city: course.city,
      educatorName: course.educator.name,
    },
    completedAt: sub.submittedAt,
  });

  const slug = sub.studentName.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="esito-${slug || "esame"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
