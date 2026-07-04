// The FIXED test structure per exam family + which tests are actually
// configured (have questions) in the latest template. Server-only.
//
// The educator page shows ALL structural sub-tabs (Giorno 1..N, Feedback,
// Esame finale) even when a test has no questions yet — an unconfigured test is
// visibly "da configurare" and cannot be sent. One reader shared by the share
// loader and the send actions so UI and server enforcement can't drift.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { expectedDays } from "@/lib/domain";
import type { ExamTestKey } from "./token";

export interface TemplateTest {
  key: ExamTestKey;
  /** Human label ("Test giorno 1" / "Feedback" / "Esame finale"). */
  label: string;
  isFinal: boolean;
  /** Whether the latest family template actually has questions for this test. */
  configured: boolean;
}

/** Baseline day-test count per exam family, from the course profile (presenza
 *  baseline: certificato = 3, shochu = 2). The actual tabs shown also grow to
 *  cover any extra mini-tests stored in the template (see loadTemplateTests). */
export function familyDayCount(family: "nihonshu" | "shochu"): number {
  return expectedDays(family === "shochu" ? "shochu" : "certificato", "presenza");
}

export async function loadTemplateTests(
  family: "nihonshu" | "shochu",
): Promise<TemplateTest[]> {
  const sb = getSupabaseServiceClient();
  const dbFamily = family === "shochu" ? "shochu" : "certificato";
  const { data: tpl } = await sb
    .from("exam_templates")
    .select("data")
    .eq("family", dbFamily)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tplData = (tpl?.data ?? {}) as {
    questions?: unknown[];
    miniTests?: { day: number; questions?: unknown[] }[];
    feedback?: { questions?: unknown[] };
  };

  const miniByDay = new Map<number, number>();
  for (const mt of tplData.miniTests ?? []) {
    miniByDay.set(mt.day, mt.questions?.length ?? 0);
  }

  const tests: TemplateTest[] = [];
  // Show the baseline days, and grow to cover any extra mini-tests the operator
  // added to the template (so a longer online course's day-tests all appear).
  const dayCount = Math.max(familyDayCount(family), tplData.miniTests?.length ?? 0);
  for (let day = 1; day <= dayCount; day++) {
    tests.push({
      key: `day${day}`,
      label: `Test giorno ${day}`,
      isFinal: false,
      configured: (miniByDay.get(day) ?? 0) > 0,
    });
  }
  tests.push({
    key: "feedback",
    label: "Feedback",
    isFinal: false,
    configured: (tplData.feedback?.questions?.length ?? 0) > 0,
  });
  tests.push({
    key: "final",
    label: "Esame finale",
    isFinal: true,
    configured: (tplData.questions?.length ?? 0) > 0,
  });
  return tests;
}
