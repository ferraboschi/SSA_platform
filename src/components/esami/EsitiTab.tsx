"use client";

// The course "Esiti" tab: live admission control + results (grade / view PDF /
// send) on the REAL grading data. Loads lazily via a server action so it only
// runs when the tab is opened.
import { useEffect, useState } from "react";
import { ExamAdmissionPanel } from "./ExamAdmissionPanel";
import { ExamResultsClient } from "./ExamResultsClient";
import {
  getCourseExamResultsAction,
  type CourseExamResultsData,
} from "@/lib/esami/results-actions";

export function EsitiTab({
  courseId,
  courseTitle,
  family,
}: {
  courseId: string;
  courseTitle: string;
  family: "nihonshu" | "shochu";
}) {
  const [data, setData] = useState<CourseExamResultsData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCourseExamResultsAction(courseId, family)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Errore nel caricamento.");
      });
    return () => {
      alive = false;
    };
  }, [courseId, family]);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <ExamAdmissionPanel courseId={courseId} testKey="final" />
      {err ? (
        <div className="card card-pad text-3">Errore: {err}</div>
      ) : !data ? (
        <div className="card card-pad text-3">Caricamento esiti…</div>
      ) : (
        <ExamResultsClient
          courseId={courseId}
          courseTitle={courseTitle}
          hasExam
          results={data.results}
          feedback={data.feedback}
          adminEmail={data.adminEmail}
          embedded
        />
      )}
    </div>
  );
}
