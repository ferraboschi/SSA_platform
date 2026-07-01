import "server-only";

import type { MaterialTemplateRepository } from "../repository";
import { materialTemplateRowToDomain } from "./mappers";
import type { MaterialTemplateWithChildren } from "./rows";
import type { RepoContext } from "./context";

export function makeMaterialRepo(
  ctx: RepoContext,
): MaterialTemplateRepository {
  const { sb, svc } = ctx;

  const materialSelect = `
    *,
    days:material_template_days (
      id, day_no, name, position,
      sakes:material_template_sakes (
        id, code, name, type, sakagura, size_ml, cost_cents, qty, note, position
      )
    ),
    extras:material_template_extras (
      id, label, value_cents, per
    )
  `;

  const materialRepo: MaterialTemplateRepository = {
    async list() {
      const { data, error } = await sb
        .from("material_templates")
        .select(materialSelect)
        .order("name");
      if (error) throw error;
      return (data as MaterialTemplateWithChildren[]).map(
        materialTemplateRowToDomain,
      );
    },

    async getById(id) {
      const isDb = id.startsWith("db-");
      const numericId = isDb ? Number(id.slice(3)) : NaN;
      const query = sb.from("material_templates").select(materialSelect);
      const { data, error } = isDb
        ? await query.eq("id", numericId).maybeSingle()
        : await query.eq("external_id", id).maybeSingle();
      if (error) throw error;
      return data
        ? materialTemplateRowToDomain(data as MaterialTemplateWithChildren)
        : null;
    },

    async save(template) {
      const externalId = template.id.startsWith("db-") ? null : template.id;
      const numericId = template.id.startsWith("db-")
        ? Number(template.id.slice(3))
        : null;

      const payload = {
        external_id: externalId,
        name: template.name,
        type: template.type,
        description: template.description,
        costs: {
          educatorPerDay: template.materiali.educatorPerDay,
          gestionePerDay: template.materiali.gestionePerDay,
          diplomaPerStudent: template.materiali.diplomaPerStudent,
          libroPerStudent: template.materiali.libroPerStudent,
          location: template.materiali.location,
          foodPairing: template.materiali.foodPairing,
          cocktailFee: template.materiali.cocktailFee,
          accommodation: template.materiali.accommodation,
          transport: template.materiali.transport,
          adv: template.materiali.adv,
        },
        uses: template.uses,
        // NOTE: `last_used_at` is intentionally NOT written here. The domain
        // `lastUsed` is a humanized display string ("02 giu 2026") that does
        // NOT round-trip into a timestamptz — writing it back would null/shift
        // the column on every edit. Omitting it preserves the DB value on
        // updates; new templates default to null. The "last used" timestamp is
        // owned by the usage path (when a course adopts the template).
      };

      const upsertResult = numericId
        ? await svc
            .from("material_templates")
            .update(payload)
            .eq("id", numericId)
            .select("id")
            .single()
        : await svc
            .from("material_templates")
            .upsert(payload, { onConflict: "external_id" })
            .select("id")
            .single();
      if (upsertResult.error) throw upsertResult.error;
      const templateId = (upsertResult.data as { id: number }).id;

      // Children: replace strategy (simple, correct, robust to renumbering).
      await svc
        .from("material_template_days")
        .delete()
        .eq("template_id", templateId);
      await svc
        .from("material_template_extras")
        .delete()
        .eq("template_id", templateId);

      for (let i = 0; i < template.days.length; i++) {
        const d = template.days[i];
        const { data: dayInsert, error } = await svc
          .from("material_template_days")
          .insert({
            template_id: templateId,
            day_no: d.day,
            name: d.name,
            position: i,
          })
          .select("id")
          .single();
        if (error) throw error;
        const dayId = (dayInsert as { id: number }).id;
        if (d.sakes.length > 0) {
          const sakeRows = d.sakes.map((s, j) => ({
            day_id: dayId,
            code: s.code,
            name: s.name,
            type: s.type,
            sakagura: s.sakagura,
            size_ml: Math.round(Number(s.size)) || 0,
            // NaN-safe: a sake with an undefined/empty cost must not blow up the
            // whole template save (which re-inserts every sake on each edit).
            cost_cents: Math.round((Number(s.cost) || 0) * 100),
            qty: Math.max(1, Math.round(Number(s.qty)) || 1),
            note: s.note ?? null,
            position: j,
          }));
          const { error: sakeErr } = await svc
            .from("material_template_sakes")
            .insert(sakeRows);
          if (sakeErr) throw sakeErr;
        }
      }
      if (template.materiali.extra && template.materiali.extra.length > 0) {
        const extraRows = template.materiali.extra.map((x) => ({
          template_id: templateId,
          label: x.label,
          value_cents: Math.round(x.value * 100),
          per: x.per,
        }));
        const { error: extraErr } = await svc
          .from("material_template_extras")
          .insert(extraRows);
        if (extraErr) throw extraErr;
      }
    },

    async remove(id) {
      const isDb = id.startsWith("db-");
      const numericId = isDb ? Number(id.slice(3)) : NaN;
      const q = svc.from("material_templates").delete();
      const { error } = isDb
        ? await q.eq("id", numericId)
        : await q.eq("external_id", id);
      if (error) throw error;
    },
  };

  return materialRepo;
}
