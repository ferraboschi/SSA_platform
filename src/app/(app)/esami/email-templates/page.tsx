import { getSession } from "@/lib/auth/session";
import { loadExamEmailTemplates } from "@/lib/esami/exam-email-store";
import { getUpcomingCourseLines } from "@/lib/esami/upcoming-courses";
import { ExamEmailTemplatesEditor } from "@/components/esami/ExamEmailTemplatesEditor";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return (
      <div className="page">
        <div className="card card-pad">
          <p className="text-3">Sezione riservata ad amministratori e responsabili.</p>
        </div>
      </div>
    );
  }
  const [templates, upcoming] = await Promise.all([
    loadExamEmailTemplates(),
    getUpcomingCourseLines(4),
  ]);
  return (
    <ExamEmailTemplatesEditor
      initial={templates}
      testTo={session.user.email || ""}
      upcoming={upcoming}
    />
  );
}
