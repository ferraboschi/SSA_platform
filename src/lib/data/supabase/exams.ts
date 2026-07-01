import "server-only";

import type {
  ExamRepository,
  ExamTemplateRepository,
} from "../repository";
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
      const prev = (existing?.data ?? {}) as ExamTemplateRow["data"];
      // Merge so we keep non-content metadata (count/source/version) if present.
      const nextData = { ...prev, ...examTemplateToData(template) };
      if (existing?.id) {
        const { error } = await svc
          .from("exam_templates")
          .update({ data: nextData })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await svc
          .from("exam_templates")
          .insert({ family: dbFamily, name: template.label, data: nextData });
        if (error) throw error;
      }
    },
  };

  return examTemplatesRepo;
}
