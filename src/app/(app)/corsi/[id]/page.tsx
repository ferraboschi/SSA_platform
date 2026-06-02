import Link from "next/link";
import { Avatar, Badge, Icon, StatusBadge } from "@/components/ui";
import { getTranslations } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/dictionary";
import { getDataSource } from "@/lib/data";
import {
  daysToStart,
  toProgrammaData,
  toTemplateData,
  toEsameData,
} from "@/lib/corsi";
import { CourseStat } from "@/components/corsi/CourseStat";
import { CourseSections } from "@/components/corsi/CourseSections";
import { ShareEducatorButton } from "@/components/corsi/ShareEducatorButton";
import { EducatorAssign } from "@/components/corsi/EducatorAssign";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  // The segment is a readable handle (e.g. "cert-vercelli-giugno-2026"); older
  // numeric-id links still resolve as a fallback.
  const courseP = /^\d+$/.test(id)
    ? ds.courses.getById(id)
    : ds.courses.getByHandle(id);
  const [{ locale, t }, course, allTemplates, allEducators] = await Promise.all([
    getTranslations(),
    courseP,
    ds.materialTemplates.list(),
    ds.educators.list(),
  ]);
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

  const daysTo = daysToStart(course);
  const pct = course.capacity ? course.enrolled / course.capacity : 0;
  const costItems = Object.values(course.costs).filter(Boolean).length;
  const marginOnRevenue = course.revenue ? Math.round((course.margin / course.revenue) * 100) : 0;
  const programSakeCount = course.program.reduce((s, p) => s + p.sakes.length, 0);
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
            <button className="btn">
              <Icon name="whatsapp" size={13} />
              {td.whatsappGroup}
            </button>
            <ShareEducatorButton courseId={course.id} />
            <button className="btn">
              <Icon name="download" size={13} />
              {td.excelStudents}
            </button>
            <button className="btn">
              <Icon name="download" size={13} />
              {td.excelSake}
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary">
              <Icon name="check" size={13} />
              {td.markInvoiced}
            </button>
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
            value={`${course.revenue.toLocaleString(locale)} €`}
            sub={format(td.listPrice, { n: course.price })}
          />
          <CourseStat
            label={td.statCosti}
            value={`${course.totalCost.toLocaleString(locale)} €`}
            sub={format(td.costItems, { n: costItems })}
          />
          <CourseStat
            label={td.statMargine}
            value={`${course.margin >= 0 ? "+" : ""}${course.margin.toLocaleString(locale)} €`}
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
        enrolled={course.enrolled}
        programSakeCount={programSakeCount}
        students={course.students}
        whatsappLink={course.whatsappLink}
        programma={toProgrammaData(course)}
        templates={templates}
        esame={esame}
        examFamily={examFamily}
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
            href={`https://admin.shopify.com/store/sakesommelierassociation/products?query=${encodeURIComponent(course.shortTitle)}`}
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
