"use server";

// Admin/manager actions for the AI feedback synthesis (see feedback-synthesis.ts).
import { hasRole } from "@/lib/auth/guard";
import {
  generateFeedbackSynthesis,
  loadFeedbackSynthesis,
  type FeedbackSynthesis,
} from "./feedback-synthesis";

export async function loadFeedbackSynthesisAction(
  courseId: number,
): Promise<FeedbackSynthesis | null> {
  if (!(await hasRole(["admin", "manager"]))) return null;
  return loadFeedbackSynthesis(Number(courseId));
}

export async function generateFeedbackSynthesisAction(
  courseId: number,
  family: "nihonshu" | "shochu",
): Promise<{ ok: boolean; error?: string; synthesis?: FeedbackSynthesis }> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  return generateFeedbackSynthesis(Number(courseId), family === "shochu" ? "shochu" : "nihonshu");
}
