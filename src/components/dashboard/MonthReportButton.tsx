"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { ReportCourse } from "@/lib/dashboard";
import { MonthlyReportModal } from "./MonthlyReportModal";

export function MonthReportButton({ courses }: { courses: ReportCourse[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // No courses → nothing to report. The modal derives a period from the course
  // list and would crash on an empty list, so render a disabled button instead.
  const hasCourses = courses.length > 0;
  return (
    <>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        disabled={!hasCourses}
      >
        <Icon name="calendar" size={13} />
        {t.dashboard.monthReport}
      </button>
      {open && hasCourses && (
        <MonthlyReportModal courses={courses} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
