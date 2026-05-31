"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { ReportCourse } from "@/lib/dashboard";
import { MonthlyReportModal } from "./MonthlyReportModal";

export function MonthReportButton({ courses }: { courses: ReportCourse[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="calendar" size={13} />
        {t.dashboard.monthReport}
      </button>
      {open && <MonthlyReportModal courses={courses} onClose={() => setOpen(false)} />}
    </>
  );
}
