"use client";

// The educator share page — navigation is BY DAY (the owner's flow: each
// program day is Appello → Programma → Test, in that order; the last program
// day also carries Feedback; the exam day is Appello → Esame):
//   • Giorno 1..N — that day's Appello (attendance+verification merged; every
//     row always shows its verification state, chip with server timestamp,
//     and exactly the actions that state allows — green = confirmed, and
//     nothing else), then that day's Programma (sake list, photos + inline
//     details), then that day's mini-test send panel. Giorno N (the last
//     program day) also shows Feedback right after its test.
//   • Giorno esame — Appello for the exam day itself, then the final exam's
//     send panel (ExamSendPanel — live progress bars).

import { useEffect, useMemo, useState } from "react";
import { getVerificationStatesAction } from "@/lib/share-links/verification-actions";
import { newerIso } from "@/lib/share-links/verification-state";
import AppelloTab from "./AppelloTab";
import ExamSendPanel from "./ExamSendPanel";
import ProgrammaTab from "./ProgrammaTab";
import { subjKey, type DayRow, type Student, type TestRow } from "./shared";

export default function EducatorTabs({
  token,
  students: initialStudents,
  dayCount,
  days,
  tests,
}: {
  token: string;
  students: Student[];
  dayCount: number;
  days: DayRow[];
  tests: TestRow[] | null;
}) {
  // Tab ids: "day1".."dayN" (program days) + "examday" (only when there's an
  // exam — `tests` is null otherwise).
  const dayTabIds = useMemo(
    () => Array.from({ length: Math.max(1, dayCount) }, (_, i) => `day${i + 1}`),
    [dayCount],
  );
  const [tab, setTab] = useState<string>(dayTabIds[0] ?? "day1");
  const [students, setStudents] = useState<Student[]>(initialStudents);

  // LIVE verification states: poll so the educator SEES the green flip the
  // moment a student completes the confirmation. Newer-wins merge — a poll
  // computed before a local send can never revert its timestamp.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      getVerificationStatesAction(token)
        .then((res) => {
          if (!alive || !res.ok || !res.states) return;
          const states = res.states;
          setStudents((prev) =>
            prev.map((s) => {
              const st = states[subjKey(s)];
              if (!st) return s;
              const sentAt = newerIso(s.confirmSentAt, st.sentAtIso);
              const confirmedAt = st.confirmedAtIso; // server truth (confirmed is final)
              return {
                ...s,
                email: st.email || s.email,
                phone: st.phone || s.phone,
                confirmSentAt: sentAt,
                confirmSent: Boolean(sentAt),
                emailConfirmedAt: confirmedAt,
                emailConfirmed: Boolean(confirmedAt),
              };
            }),
          );
        })
        .catch(() => {});
    };
    // Immediate first tick: without it a send done on ANOTHER device is
    // invisible for up to 12s, and the appello guard judges stale state
    // (tap flips, server refuses, checkbox reverts — reads as a dead tap).
    tick();
    const id = setInterval(tick, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  const examDayId = "examday";
  const tabs: { id: string; label: string }[] = [
    ...dayTabIds.map((id, i) => ({ id, label: `Giorno ${i + 1}` })),
    ...(tests ? [{ id: examDayId, label: "Giorno esame" }] : []),
  ];
  const activeDayNum = tab.startsWith("day") ? Number(tab.slice(3)) : null;
  const testByKey = (key: string) => tests?.find((t) => t.key === key);

  return (
    <div>
      <div className="edu-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            className={`edu-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeDayNum != null && (
        <div>
          <SectionHeading>Appello</SectionHeading>
          <AppelloTab
            token={token}
            students={students}
            setStudents={setStudents}
            day={activeDayNum}
            maxDay={tests ? dayCount + 1 : dayCount}
          />
          <SectionHeading>Programma</SectionHeading>
          <ProgrammaTab days={days} day={activeDayNum} enrolled={students.length} />
          {testByKey(`day${activeDayNum}`) && (
            <>
              {/* Full label ("Test giorno 3"), NOT a generic "Test": on the last
                  day this panel sits right above the Feedback one and the owner
                  mistook one for the other — each section must name itself. */}
              <SectionHeading>{testByKey(`day${activeDayNum}`)!.label}</SectionHeading>
              <ExamSendPanel
                key={testByKey(`day${activeDayNum}`)!.key}
                token={token}
                test={testByKey(`day${activeDayNum}`)!}
                students={students}
              />
            </>
          )}
          {activeDayNum === dayCount && testByKey("feedback") && (
            <>
              <SectionHeading>Feedback</SectionHeading>
              <ExamSendPanel key="feedback" token={token} test={testByKey("feedback")!} students={students} />
            </>
          )}
        </div>
      )}

      {tab === examDayId && tests && (
        <div>
          <SectionHeading>Appello</SectionHeading>
          <AppelloTab
            token={token}
            students={students}
            setStudents={setStudents}
            day={dayCount + 1}
            maxDay={dayCount + 1}
            isExamDay
          />
          {testByKey("final") && (
            <>
              <SectionHeading>Esame</SectionHeading>
              <ExamSendPanel token={token} test={testByKey("final")!} students={students} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-4)",
        margin: "0 0 8px",
      }}
    >
      {children}
    </h2>
  );
}
