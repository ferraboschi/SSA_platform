import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, Badge, Icon, StatusBadge } from "@/components/ui";
import { getTranslations } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/dictionary";
import { formatEuro } from "@/lib/format";
import { getDataSource } from "@/lib/data";
import {
  daysToStart,
  toProgrammaData,
  toTemplateData,
  toEsameData,
} from "@/lib/corsi";
import { expectedDays } from "@/lib/domain";
import { loadCourseEconomics } from "@/lib/economics";
import { EMPTY_ECON } from "@/lib/economics/types";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { shopifyAdminProductsUrl } from "@/lib/integrations/shopify/admin-url";
import { CourseStat } from "@/components/corsi/CourseStat";
import { CourseSections } from "@/components/corsi/CourseSections";
import { countFinalSubmissions } from "@/lib/exam-links/submission-count";
import { ShareEducatorButton } from "@/components/corsi/ShareEducatorButton";
import { ShareEnrolButton } from "@/components/corsi/ShareEnrolButton";
import { IgnoreProductButton } from "@/components/corsi/IgnoreProductButton";
import { CourseExportButtons } from "@/components/corsi/CourseExportButtons";
import { EducatorAssign } from "@/components/corsi/EducatorAssign";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  // The segment is a readable handle (e.g. "cert-vercelli-giugno-2026"); older
  // numeric-id links still resolve as a fallback.
  const courseP = /^\d+$/.test(id)
    ? ds.courses.getById(id)
    : ds.courses.getByHandle(id);
  const [{ t }, course, allTemplates, allEducators] = await Promise.all([
    getTranslations(),
    courseP,
    ds.materialTemplates.list(),
    ds.educators.list(),
  ]);
  // Canonicalize to the readable handle URL: any /corsi/<numeric-id> link
  // (dashboard, educator, planner, anomalie…) 308-redirects to /corsi/<handle>.
  if (course && /^\d+$/.test(id) && course.handle && course.handle !== id) {
    redirect(`/corsi/${course.handle}`);
  }

  const educatorOptions = allEducators.map((e) => ({ id: e.id, name: e.name }));

  const td = t.corsi.detail;

  if (!course) {
    return (
      <div className="page">
        <div className="card card-pad-lg">
          {td.notFound}{" "}
          <Link className="link" href="/corsi">
            {td.backToCatalog}
          </Link>
        </div>
      </div>
    );
  }

  // Ensure the currently-assigned educator is selectable even if inactive
  // (educators.list() may exclude inactive ones), so the picker shows them.
  if (course.educator.id && !educatorOptions.some((o) => o.id === course.educator.id)) {
    educatorOptions.push({ id: course.educator.id, name: course.educator.name });
  }

  // Invoicing status is owned by Accounting (Luigi) on /conto-economico; here we
  // only surface it as a read-only signal.
  const [econMap, programMap] = await Promise.all([
    loadCourseEconomics(),
    loadCourseProgram(),
  ]);
  const econ = econMap.get(course.id) ?? EMPTY_ECON;
  const programOverlay = programMap.get(course.id);

  const daysTo = daysToStart(course);
  const pct = course.capacity ? course.enrolled / course.capacity : 0;
  const costItems = Object.values(course.costs).filter(Boolean).length;
  const marginOnRevenue = course.revenue ? Math.round((course.margin / course.revenue) * 100) : 0;
  // Count sakes from the operator's saved OVERLAY when present (authoritative, same
  // source the section itself uses) — falling back to the base program. Reading only
  // the base showed "0" for every course whose programme was assigned through the UI.
  const programDays = programOverlay?.days?.length ? programOverlay.days : course.program;
  const programSakeCount = programDays.reduce((s, p) => s + p.sakes.length, 0);
  const esame = course.exam ? toEsameData(course) : null;
  // Exam links work off the family template (not course.exam, which the
  // Supabase path doesn't populate), so surface them for every exam-bearing
  // course type even when the rich exam summary isn't available.
  // An exam exists only for a CONFIRMED certificato/shochu course (published or
  // past) — not for drafts (bozza), archived, or cancelled ones.
  const examConfirmed =
    (course.lifecycle === "pubblicato" || course.lifecycle === "passato") &&
    !course.cancelled;
  const examFamily: "nihonshu" | "shochu" | null = !examConfirmed
    ? null
    : course.type === "certificato"
      ? "nihonshu"
      : course.type === "shochu"
        ? "shochu"
        : null;
  const templates = allTemplates.map(toTemplateData);
  // Esiti tab badge: how many FINAL exams have been handed in (grows live as
  // students submit, before staff correct them). Only exam-bearing courses.
  const esitiCount = examFamily ? await countFinalSubmissions(course.id) : 0;

  return (
    <div className="page">
      {/* Hero */}
      <section className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <Badge tone={course.typeColor === "oro" ? "oro" : "azzurro"} size="lg">
              {course.typeLabel}
            </Badge>
            {course.lifecycle === "pubblicato" && (
              <StatusBadge status={course.status} size="lg" label={t.status[course.status]} />
            )}
            {course.lifecycle === "passato" && (
              <Badge tone="success" size="lg">
                {td.concluso}
              </Badge>
            )}
            {course.lifecycle === "bozza" && (
              <Badge tone="neutral" size="lg">
                {td.bozza}
              </Badge>
            )}
            {course.lifecycle === "cancelled" && (
              <Badge tone="danger" size="lg">
                Annullato
              </Badge>
            )}
            <span className="eyebrow">
              {course.mode === "online" ? td.online : td.inPerson}
              {course.days > 1 ? ` · ${format(td.daysSuffix, { n: course.days })}` : ""}
            </span>
          </div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 18 }}>
            {course.shortTitle}
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
              fontSize: 13.5,
              color: "var(--text-2)",
              marginBottom: 20,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="calendar" size={14} className="text-3" />
              <strong>
                {course.day} {course.month} {course.year}
              </strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={14} className="text-3" />
              {course.city}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {course.educator.id && (
                <Avatar name={course.educator.name} initials={course.educator.initials} size="sm" />
              )}
              <EducatorAssign
                courseId={course.id}
                currentId={course.educator.id}
                educators={educatorOptions}
              />
              {course.educator.id && (
                <Link
                  href={`/educator/${course.educator.id}`}
                  className="link"
                  style={{ fontSize: 11 }}
                  title="Apri scheda educator"
                >
                  ↗
                </Link>
              )}
            </span>
            {course.lifecycle === "pubblicato" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: daysTo < 10 ? "var(--danger-fg)" : "var(--text-2)",
                }}
              >
                <Icon name="trending" size={14} />
                {daysTo > 0
                  ? format(td.inDays, { n: daysTo })
                  : daysTo === 0
                    ? td.today
                    : format(td.daysAgo, { n: -daysTo })}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ShareEnrolButton enrolUrl={course.enrolUrl} title={course.shortTitle} />
            <ShareEducatorButton courseId={course.id} />
            <CourseExportButtons
              courseId={course.id}
              title={course.shortTitle}
              students={course.students}
              labelStudents={td.excelStudents}
              labelSake={td.excelSake}
              labelPromossi={td.excelPromossi}
              sakeNoTemplateMsg={td.excelSakeNoTemplate}
              examsDone={
                course.lifecycle === "passato" ||
                Boolean(
                  course.examResults &&
                    course.examResults.passed + course.examResults.retrial + course.examResults.failed > 0,
                )
              }
            />
            {course.enrolled === 0 && <IgnoreProductButton courseId={course.id} />}
            <div style={{ flex: 1 }} />
            <Badge tone={econ.invoiced ? "success" : "neutral"} size="lg" dot>
              {econ.invoiced ? td.invoicedYes : td.invoicedNo}
            </Badge>
          </div>
        </div>

        {/* KPI inline */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)" }}>
          <CourseStat
            label={td.statIscritti}
            value={`${course.enrolled} / ${course.capacity}`}
            sub={`${format(t.corsi.catalog.min, { n: course.minStudents })}${
              course.enrolled >= course.minStudents
                ? ` · ${td.thresholdReached}`
                : ` · ${format(t.corsi.catalog.missing, { n: course.minStudents - course.enrolled })}`
            }`}
            bar={pct}
            barTone={course.enrolled < course.minStudents ? (pct < 0.2 ? "danger" : "warning") : "azzurro"}
          />
          <CourseStat
            label={td.statRicavi}
            value={formatEuro(course.revenue)}
            sub={format(td.listPrice, { n: formatEuro(course.price) })}
          />
          <CourseStat
            label={td.statCosti}
            value={formatEuro(course.totalCost)}
            sub={format(td.costItems, { n: costItems })}
          />
          <CourseStat
            label={td.statMargine}
            value={`${course.margin >= 0 ? "+" : ""}${formatEuro(course.margin)}`}
            sub={format(td.onRevenue, { n: marginOnRevenue })}
            tone={course.margin >= 0 ? "success" : "danger"}
            last
          />
        </div>
      </section>

      {/* Reasoning */}
      <div
        className="card card-pad"
        style={{
          marginBottom: 24,
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          background: "var(--indigo-50)",
          border: "1px solid var(--indigo-100)",
          boxShadow: "none",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "var(--indigo)",
            color: "white",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={15} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="eyebrow">{td.reasoningTitle}</span>
            {course.lifecycle === "pubblicato" && (
              <StatusBadge status={course.status} label={t.status[course.status]} />
            )}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text)", margin: 0 }}>
            {course.notebook.reasoning}
          </p>
          {course.notebook.plannedAction && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-2)" }}>
              <strong>{td.plannedAction}</strong> {course.notebook.plannedAction}
            </div>
          )}
        </div>
      </div>

      <CourseSections
        courseId={course.id}
        courseTitle={course.shortTitle}
        enrolled={course.enrolled}
        capacity={course.capacity}
        programSakeCount={programSakeCount}
        students={course.students}
        whatsappLink={course.whatsappLink}
        programma={toProgrammaData(course)}
        programOverlay={programOverlay}
        templates={templates}
        esame={esame}
        examFamily={examFamily}
        esitiCount={esitiCount}
        expectedDayCount={expectedDays(course.type, course.mode)}
      />

      {/* Danger zone */}
      <section className="card card-pad" style={{ marginTop: 28, border: "1px solid var(--danger)", boxShadow: "none" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "var(--danger-bg)",
              color: "var(--danger-fg)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="warn" size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow" style={{ color: "var(--danger-fg)", marginBottom: 4 }}>
              {td.dangerEyebrow}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{td.dangerTitle}</div>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, margin: 0, maxWidth: 620 }}>
              {td.dangerBody}
            </p>
          </div>
          <a
            className="btn btn-danger"
            href={shopifyAdminProductsUrl(course.shortTitle)}
            target="_blank"
            rel="noopener"
            style={{ alignSelf: "center" }}
          >
            <Icon name="warn" size={13} />
            {td.dangerBtn}
            <Icon name="external" size={11} />
          </a>
        </div>
      </section>
    </div>
  );
}
