"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Icon, KPI, StatusBadge } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { setQualificationsAction } from "@/lib/data/educator-actions";
import { COURSE_TYPES, type CourseStatus, type CourseTypeColor, type CourseTypeKey, type Language } from "@/lib/domain";

interface ActiveCourse {
  id: string;
  typeColor: CourseTypeColor;
  typeShort: string;
  status: CourseStatus;
  shortTitle: string;
  day: number;
  month: string;
  year: number;
  city: string;
  enrolled: number;
  capacity: number;
  minStudents: number;
  revenue: number;
}

interface PastCourse {
  id: string;
  typeColor: CourseTypeColor;
  typeShort: string;
  shortTitle: string;
  city: string;
  month: string;
  year: number;
  enrolled: number;
  capacity: number;
  examResults: { passed: number; retrial: number; failed: number } | null;
  revenue: number;
}

export interface EducatorDetailData {
  educator: {
    id: string;
    name: string;
    initials: string;
    photo?: string;
    role: string;
    city: string;
    bio: string;
    years: number;
    lang: Language[];
  };
  quals: CourseTypeKey[];
  allTypes: CourseTypeKey[];
  stats: {
    coursesCount: number;
    activeCount: number;
    pastCount: number;
    totalStudents: number;
    totalRevenue: number;
    passed: number;
    totalExam: number;
    cities: string[];
  };
  active: ActiveCourse[];
  past: PastCourse[];
}

function EducatorQuals({
  id,
  name,
  quals,
  allTypes,
}: {
  id: string;
  name: string;
  quals: CourseTypeKey[];
  allTypes: CourseTypeKey[];
}) {
  const t = useT().educator.quals;
  const [local, setLocal] = useState<CourseTypeKey[]>(quals);
  const [, start] = useTransition();

  const toggle = (ty: CourseTypeKey) => {
    const next = local.includes(ty) ? local.filter((x) => x !== ty) : [...local, ty];
    setLocal(next);
    start(async () => {
      await setQualificationsAction(id, next);
    });
  };

  const countLabel = format(local.length === 1 ? t.qualOne : t.qualMany, { n: local.length });

  return (
    <section className="card card-pad" style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={12} />
            {t.title}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, maxWidth: 620 }}>
            {format(t.intro, { name })}
          </div>
        </div>
        <Badge tone={local.length ? "indigo" : "warning"} dot>
          {countLabel}
        </Badge>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {allTypes.map((ty) => {
          const on = local.includes(ty);
          return (
            <button
              key={ty}
              onClick={() => toggle(ty)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 13px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                border: `1px solid ${on ? "var(--indigo)" : "var(--border)"}`,
                background: on ? "var(--indigo-50)" : "var(--surface)",
                color: on ? "var(--indigo-600)" : "var(--text-3)",
              }}
            >
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1px solid ${on ? "var(--indigo)" : "var(--border)"}`,
                  background: on ? "var(--indigo)" : "transparent",
                  color: "white",
                }}
              >
                {on && <Icon name="check" size={11} />}
              </span>
              {COURSE_TYPES[ty].label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function EducatorDetail({ data }: { data: EducatorDetailData }) {
  const t = useT().educator.detail;
  const tr = useT().status;
  const router = useRouter();
  const { educator: e, stats, active, past, quals, allTypes } = data;
  const otherCities = stats.cities.filter((c) => c !== e.city);

  return (
    <div className="page">
      <section className="card" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 24,
            padding: "28px 32px",
            alignItems: "center",
          }}
        >
          <Avatar name={e.name} initials={e.initials} src={e.photo} size="xl" />
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {e.role} · {e.years} anni · {e.lang.join(" / ")}
            </div>
            <h1 className="display" style={{ fontSize: 32 }}>
              {e.name}
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-2)", margin: "12px 0", lineHeight: 1.55, maxWidth: 640 }}>
              {e.bio}
            </p>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
              <span>
                <Icon name="pin" size={12} className="text-3" /> {t.base}: <strong>{e.city}</strong>
              </span>
              {otherCities.length > 0 && (
                <span>
                  <Icon name="globe" size={12} className="text-3" />{" "}
                  {format(t.teachesAlsoIn, { cities: otherCities.join(", ") })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <EducatorQuals id={e.id} name={e.name} quals={quals} allTypes={allTypes} />

      <div className="kpi-grid cols-5" style={{ marginBottom: 24 }}>
        <KPI
          anim
          label={t.kpiCorsi}
          value={stats.coursesCount}
          sub={format(t.kpiCorsiSub, { a: stats.activeCount, p: stats.pastCount })}
        />
        <KPI anim label={t.kpiStudents} value={stats.totalStudents} sub={t.lifetime} />
        <KPI
          anim
          label={t.kpiRevenue}
          value={Math.round(stats.totalRevenue / 1000)}
          unit="k €"
          sub={t.lifetime}
          accent="indigo"
        />
        <KPI
          anim
          label={t.kpiPassRate}
          value={stats.totalExam ? Math.round((stats.passed / stats.totalExam) * 100) : "—"}
          unit={stats.totalExam ? "%" : ""}
          sub={format(t.kpiPassRateSub, { p: stats.passed, t: stats.totalExam })}
          accent="green"
        />
        <KPI anim label={t.kpiCities} value={stats.cities.length} sub={stats.cities.slice(0, 3).join(", ")} accent="oro" />
      </div>

      {active.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 className="h2" style={{ marginBottom: 14 }}>
            {t.upcoming}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {active.map((c) => (
              <Link key={c.id} href={`/corsi/${c.id}`} className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
                  <StatusBadge status={c.status} label={tr[c.status]} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.shortTitle}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                  {c.day} {c.month} {c.year} · {c.city}
                </div>
                <div className={`bar ${c.enrolled < c.minStudents ? "warning" : "azzurro"}`} style={{ marginTop: 12 }}>
                  <i style={{ width: (c.capacity ? (c.enrolled / c.capacity) * 100 : 0) + "%" }} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: 11.5,
                    color: "var(--text-3)",
                  }}
                >
                  <span>
                    {c.enrolled}/{c.capacity}
                  </span>
                  <span className="num">{(c.revenue / 1000).toFixed(1)}k€</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="h2" style={{ marginBottom: 14 }}>
            {t.history}
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.colData}</th>
                  <th>{t.colCorso}</th>
                  <th>{t.colCitta}</th>
                  <th>{t.colIscritti}</th>
                  <th>{t.colEsami}</th>
                  <th style={{ textAlign: "right" }}>{t.colRicavi}</th>
                </tr>
              </thead>
              <tbody>
                {past.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => router.push(`/corsi/${c.id}`)}>
                    <td className="num">
                      {c.month.slice(0, 3)} {c.year}
                    </td>
                    <td>
                      <Badge tone={c.typeColor === "oro" ? "oro" : "azzurro"}>{c.typeShort}</Badge>
                      <span style={{ marginLeft: 8, fontWeight: 500 }}>{c.shortTitle}</span>
                    </td>
                    <td className="text-3">{c.city}</td>
                    <td className="num">
                      {c.enrolled}/{c.capacity}
                    </td>
                    <td>
                      {c.examResults ? (
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          <span style={{ color: "var(--success-fg)" }}>{c.examResults.passed}P</span> ·{" "}
                          {c.examResults.retrial}R ·{" "}
                          <span style={{ color: "var(--danger-fg)" }}>{c.examResults.failed}B</span>
                        </span>
                      ) : (
                        <span className="text-mute">—</span>
                      )}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatEuro(c.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
