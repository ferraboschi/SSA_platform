"use client";

// The course "Esiti" tab: results (grade / view PDF / send) on the REAL grading
// data. Loads lazily via a server action so it only runs when the tab is opened.
// (The old live-admission "waiting room" was retired when exam entry moved to
// email-verified personal links — see ExamGate.)
import { useCallback, useEffect, useState } from "react";
import { ExamResultsClient } from "./ExamResultsClient";
import { LiveExamProgress } from "./LiveExamProgress";
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

  // Re-fetch the real grading data. Embedded in a tab, a router.refresh() does
  // NOT re-run this client action, so confirming an outcome would otherwise
  // leave the table stale — the grading flow calls this to pull fresh data.
  const reload = useCallback(() => {
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

  useEffect(() => reload(), [reload]);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {err ? (
        <div className="card card-pad text-3">Errore: {err}</div>
      ) : !data ? (
        <div className="card card-pad text-3">Caricamento esiti…</div>
      ) : (
        <>
          <LiveExamProgress courseId={courseId} />
          <ExamResultsClient
            courseId={courseId}
            courseTitle={courseTitle}
            hasExam
            results={data.results}
            feedback={data.feedback}
            adminEmail={data.adminEmail}
            emailsLive={data.emailsLive}
            embedded
            onChanged={reload}
          />
        </>
      )}
    </div>
  );
}
