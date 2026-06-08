import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { renderCertificatePdf } from "@/lib/esami/certificate-pdf";
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
  const result = course?.examResults2?.find((r) => r.email.toLowerCase() === email);
  if (!course || !result) {
    return NextResponse.json({ ok: false, error: "result not found" }, { status: 404 });
  }

  const family: ExamFamily = course.type === "shochu" ? "shochu" : "nihonshu";
  const buf = await renderCertificatePdf({
    name: result.name,
    family,
    status: result.status,
    score: result.score,
    sections: result.sections.map((s) => ({ label: s.label, pct: s.pct })),
    course: {
      day: course.day,
      month: course.month,
      year: course.year,
      city: course.city,
      educatorName: course.educator.name,
    },
    completedAt: result.completedAt,
  });

  const slug = result.name.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="esito-${slug || "esame"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
