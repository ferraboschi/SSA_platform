"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Badge } from "@/components/ui";
import { EducatorSyncButton } from "./EducatorSyncButton";
import { useT, format } from "@/lib/i18n";
import { COURSE_TYPES, COURSE_TYPE_SHORT_LABEL, type CourseTypeKey } from "@/lib/domain";

export interface EducatorListItem {
  id: string;
  name: string;
  initials: string;
  photo?: string;
  role: string;
  city: string;
  bio: string;
  quals: CourseTypeKey[];
  coursesCount: number;
  activeCount: number;
  totalStudents: number;
  passRate: number | null;
}

function SmallNum({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "indigo" | "success" | "";
}) {
  const color =
    accent === "indigo"
      ? "var(--indigo)"
      : accent === "success"
        ? "var(--success-fg)"
        : "var(--text)";
  return (
    <div>
      <div className="num" style={{ fontSize: 16, fontWeight: 600, color }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export function EducatorList({
  items,
  allTypes,
}: {
  items: EducatorListItem[];
  allTypes: CourseTypeKey[];
}) {
  const t = useT().educator.list;
  const [filterType, setFilterType] = useState<CourseTypeKey | "">("");

  const list = filterType ? items.filter((e) => e.quals.includes(filterType)) : items;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-sub">{t.sub}</p>
        </div>
        <div className="page-actions">
          <EducatorSyncButton />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginRight: 2 }}>
          {t.qualifiedTo}
        </span>
        <button className={`pill ${filterType === "" ? "on" : ""}`} onClick={() => setFilterType("")}>
          {t.all}
          <span className="num" style={{ marginLeft: 5, opacity: 0.7 }}>
            {items.length}
          </span>
        </button>
        {allTypes.map((ty) => {
          const n = items.filter((e) => e.quals.includes(ty)).length;
          return (
            <button
              key={ty}
              className={`pill ${filterType === ty ? "on" : ""}`}
              onClick={() => setFilterType(filterType === ty ? "" : ty)}
            >
              {COURSE_TYPES[ty].label}
              <span className="num" style={{ marginLeft: 5, opacity: 0.7 }}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {list.map((e) => (
          <Link
            key={e.id}
            href={`/educator/${e.id}`}
            className="card"
            style={{
              padding: 22,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 18,
              transition: "transform var(--dur-fast), box-shadow var(--dur-fast)",
            }}
            onMouseEnter={(ev) => {
              ev.currentTarget.style.setProperty("transform", "translateY(-1px)");
              ev.currentTarget.style.setProperty("box-shadow", "var(--sh-3)");
            }}
            onMouseLeave={(ev) => {
              ev.currentTarget.style.setProperty("transform", "none");
              ev.currentTarget.style.setProperty("box-shadow", "var(--sh-card)");
            }}
          >
            <Avatar name={e.name} initials={e.initials} src={e.photo} size="xl" />
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {e.role} · {e.city}
              </div>
              <div className="h2" style={{ fontSize: 18 }}>
                {e.name}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "6px 0 12px", lineHeight: 1.5 }}>
                {e.bio}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-4)",
                    fontWeight: 600,
                    letterSpacing: "var(--ls-caps)",
                    textTransform: "uppercase",
                    marginRight: 2,
                  }}
                >
                  {t.enabledTo}
                </span>
                {e.quals.length === 0 && (
                  <span style={{ fontSize: 11.5, color: "var(--text-mute)", fontStyle: "italic" }}>
                    {t.noQuals}
                  </span>
                )}
                {e.quals.map((q) => (
                  <Badge key={q} tone={q === filterType ? "indigo" : "neutral"}>
                    {COURSE_TYPE_SHORT_LABEL[q]}
                  </Badge>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-2)",
                }}
              >
                <SmallNum label={t.statCorsi} value={e.coursesCount} />
                <SmallNum label={t.statActive} value={e.activeCount} accent={e.activeCount > 0 ? "indigo" : ""} />
                <SmallNum label={t.statStudents} value={e.totalStudents} />
                <SmallNum
                  label={t.statPassRate}
                  value={e.passRate !== null ? Math.round(e.passRate * 100) + "%" : "—"}
                  accent={e.passRate !== null && e.passRate >= 0.8 ? "success" : ""}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--text-3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            {format(t.emptyTitle, { type: filterType ? COURSE_TYPES[filterType].label : "" })}
          </div>
          <div style={{ fontSize: 13 }}>{t.emptyBody}</div>
        </div>
      )}
    </div>
  );
}
