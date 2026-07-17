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

import { useEffect, useMemo, useRef, useState } from "react";
import { getVerificationStatesAction } from "@/lib/share-links/verification-actions";
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
  const [students, setStudentsRaw] = useState<Student[]>(initialStudents);
  // Timestamp of the last LOCAL patch (send/correct/reset done in THIS tab):
  // a poll snapshot FETCHED before that instant is stale and gets discarded.
  // Both stamps come from the same client clock — no server skew involved.
  const lastLocalPatchRef = useRef(0);
  const setStudents: typeof setStudentsRaw = (next) => {
    lastLocalPatchRef.current = Date.now();
    setStudentsRaw(next);
  };

  // LIVE verification states: poll so the educator SEES the green flip the
  // moment a student completes the confirmation. The server response is
  // AUTHORITATIVE — a "newer wins" merge could never express a CLEARED stamp,
  // so after "Azzera appello e verifiche" every other open tab kept showing
  // "Inviata" forever (owner batch 12). Local optimism is protected by the
  // snapshot-discard above, not by keeping stale values.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      const startedAt = Date.now();
      getVerificationStatesAction(token)
        .then((res) => {
          if (!alive || !res.ok || !res.states) return;
          // A degraded (pre-migration fallback) snapshot lacks fields — its
          // nulls mean UNKNOWN, not cleared: applying it authoritatively
          // would erase every chip. Skip it.
          if (res.degraded) return;
          // A local patch landed while this snapshot was in flight → discard.
          if (startedAt < lastLocalPatchRef.current) return;
          const states = res.states;
          setStudentsRaw((prev) =>
            prev.map((s) => {
              const st = states[subjKey(s)];
              if (!st) return s;
              return {
                ...s,
                email: st.email || s.email,
                phone: st.phone || s.phone,
                confirmSentAt: st.sentAtIso,
                confirmSent: Boolean(st.sentAtIso),
                emailConfirmedAt: st.confirmedAtIso,
                emailConfirmed: Boolean(st.confirmedAtIso),
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
            // The feedback panel sits right under the day-N test panel and the
            // owner mis-sent one for the other TWICE (batches 9 and 12): a
            // heading alone doesn't separate them — the whole block gets its
            // own tinted surface so it reads as a DIFFERENT thing at a glance.
            <div
              style={{
                marginTop: 18,
                padding: "14px 16px 16px",
                background: "var(--warning-bg)",
                border: "1.5px solid var(--warning)",
                borderRadius: 12,
              }}
            >
              <SectionHeading>
                <span style={{ color: "var(--warning-fg)" }}>
                  📋 Feedback — questionario di gradimento (non è un test)
                </span>
              </SectionHeading>
              <ExamSendPanel key="feedback" token={token} test={testByKey("feedback")!} students={students} />
            </div>
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
