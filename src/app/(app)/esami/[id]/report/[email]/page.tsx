import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { EsameReport } from "@/components/esami/EsameReport";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; email: string }>;
}) {
  const { id, email } = await params;
  const ds = await getDataSource();
  const [{ t }, course] = await Promise.all([getTranslations(), ds.courses.getById(id)]);
  const rv = t.esami.reportView;

  const results = course?.examResults2 ?? [];
  // Decode defensively (malformed % shouldn't 500) and match EXACTLY — no
  // results[0] fallback, which would show another student's certificate + PII.
  let decoded = email;
  try {
    decoded = decodeURIComponent(email);
  } catch {
    /* keep raw segment */
  }
  const result = results.find((r) => r.email === decoded);

  if (!course || !course.exam || !result) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 14 }}>{rv.unavailable}</div>
          <Link className="btn" href={`/esami/${id}`}>
            {t.esami.detail.backLink}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <EsameReport
      result={result}
      family={course.exam.family}
      course={{
        day: course.day,
        month: course.month,
        year: course.year,
        city: course.city,
        educatorName: course.educator.name,
      }}
    />
  );
}
