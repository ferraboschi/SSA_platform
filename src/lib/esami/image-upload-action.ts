"use server";

// Upload for "identifica immagine" questions (owner batch 8): the editor used
// to accept only a pasted URL — now staff can pick or drag a file, which lands
// in the public `esami-immagini` Supabase Storage bucket and comes back as the
// URL the question stores (the URL path still works as before).

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";

const BUCKET = "esami-immagini";
const MAX_BYTES = 3 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface UploadExamImageResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function uploadExamImageAction(formData: FormData): Promise<UploadExamImageResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Nessun file ricevuto." };
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { ok: false, error: "Formato non supportato: usa PNG, JPG o WebP." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Immagine troppo grande (max 3 MB)." };

  try {
    const svc = getSupabaseServiceClient();
    const name = `q/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await svc.storage
      .from(BUCKET)
      .upload(name, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        cacheControl: "31536000", // immutable name → cache hard
        upsert: false,
      });
    if (error) return { ok: false, error: error.message };
    const { data } = svc.storage.from(BUCKET).getPublicUrl(name);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload non riuscito." };
  }
}
