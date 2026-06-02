"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { assignEducatorAction } from "@/lib/data/course-educator-actions";

export interface EducatorOption {
  id: string;
  name: string;
}

/**
 * Inline educator picker on the course detail. Lets staff backfill the
 * historical course↔educator links that aren't present in any imported source.
 */
export function EducatorAssign({
  courseId,
  currentId,
  educators,
}: {
  courseId: string;
  currentId: string;
  educators: EducatorOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentId || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: string) {
    const prev = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const r = await assignEducatorAction(courseId, next || null);
      if (r.ok) router.refresh();
      else {
        setValue(prev);
        setError(r.error ?? "Errore");
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon name="user" size={12} style={{ color: "var(--text-3)" }} />
      <select
        className="select"
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        style={{ height: 30, fontSize: 12.5, maxWidth: 220 }}
        title="Assegna educator"
      >
        <option value="">— Nessun educator —</option>
        {educators.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      {error && <span style={{ fontSize: 11, color: "var(--danger-fg)" }}>{error}</span>}
    </span>
  );
}
