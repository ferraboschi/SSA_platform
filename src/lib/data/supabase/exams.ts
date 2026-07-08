import "server-only";

import type {
  ExamRepository,
  ExamTemplateRepository,
} from "../repository";
import { CONFLICT_MSG } from "../kv-cas";
import { examTemplateRowToDomain, examTemplateToData } from "./mappers";
import type { ExamTemplateRow } from "./rows";
import type { RepoContext } from "./context";

export function makeExamsRepo(_ctx: RepoContext): ExamRepository {
  const examsRepo: ExamRepository = {
    async getByCourseId() {
      return null;
    },
    async resultsByCourseId() {
      return [];
    },
    async liveByCourseId() {
      return [];
    },
  };

  return examsRepo;
}

export function makeExamTemplatesRepo(
  ctx: RepoContext,
): ExamTemplateRepository {
  const { sb, svc } = ctx;

  const examTemplatesRepo: ExamTemplateRepository = {
    async list() {
      const { data, error } = await sb
        .from("exam_templates")
        .select("id,family,name,data")
        .order("id");
      if (error) throw error;
      return (data as ExamTemplateRow[]).map(examTemplateRowToDomain);
    },
    async getByFamily(family) {
      // DB family is 'certificato'|'shochu'; domain is 'nihonshu'|'shochu'.
      const dbFamily = family === "shochu" ? "shochu" : "certificato";
      const { data, error } = await sb
        .from("exam_templates")
        .select("id,family,name,data")
        .eq("family", dbFamily)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? examTemplateRowToDomain(data as ExamTemplateRow) : null;
    },
    async save(template) {
      const dbFamily = template.family === "shochu" ? "shochu" : "certificato";
      // Locate the existing row for this family (service client bypasses RLS).
      const { data: existing } = await svc
        .from("exam_templates")
        .select("id,data")
        .eq("family", dbFamily)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prev = (existing?.data ?? {}) as ExamTemplateRow["data"] & { __v?: number };
      // Merge so we keep non-content metadata (translations/count/source) — the
      // FRESH copy of it, so e.g. a translation finished after this editor
      // loaded is preserved, not reverted.
      const expected = typeof template.version === "number" ? template.version : 0;
      const nextData = { ...prev, ...examTemplateToData(template), __v: expected + 1 };
      if (existing?.id) {
        // Compare-and-swap on data.__v: a stale editor matches ZERO rows and
        // gets a conflict instead of silently clobbering the other user's save
        // (Bug 4). Legacy rows without __v count as version 0.
        let q = svc.from("exam_templates").update({ data: nextData }).eq("id", existing.id);
        q =
          expected === 0
            ? q.or("data->>__v.is.null,data->>__v.eq.0")
            : q.eq("data->>__v", String(expected));
        const { data: updated, error } = await q.select("id");
        if (error) throw error;
        if ((updated ?? []).length === 0) throw new Error(CONFLICT_MSG);
      } else {
        const { error } = await svc
          .from("exam_templates")
          .insert({ family: dbFamily, name: template.label, data: nextData });
        if (error) throw error;
      }
      return expected + 1;
    },
  };

  return examTemplatesRepo;
}
