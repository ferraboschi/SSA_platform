"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import { resolveAnomalyAction } from "@/lib/data/anomalie-actions";

interface AnomalyItem {
  id: number;
  email: string;
  name: string;
  note: string;
}

export function AnomaliesClient({ items }: { items: AnomalyItem[] }) {
  const t = useT().anomalie;
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const visible = items.filter((it) => !resolved.has(it.id));

  const resolve = (id: number) => {
    setResolved((prev) => new Set(prev).add(id));
    startTransition(() => void resolveAnomalyAction(id));
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 6 }}>
        <h1 className="display" style={{ fontSize: 28 }}>
          {t.title}
        </h1>
        <p className="text-3" style={{ fontSize: 13, marginTop: 6 }}>
          {t.subtitle}
        </p>
      </div>

      <div style={{ margin: "16px 0", fontSize: 13, color: "var(--text-2)" }}>
        {format(t.count, { n: visible.length })}
      </div>

      {visible.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)" }}>
          {t.empty}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.colPerson}</th>
                <th>{t.colNote}</th>
                <th style={{ textAlign: "right" }}>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    <div className="text-4" style={{ fontSize: 11 }}>{it.email}</div>
                  </td>
                  <td className="text-2" style={{ fontSize: 12.5, maxWidth: 460 }}>
                    {it.note}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Link
                      className="btn btn-sm"
                      href={`/corsisti/${encodeURIComponent(it.email)}`}
                      style={{ marginRight: 8 }}
                    >
                      <Icon name="user" size={12} /> {t.openProfile}
                    </Link>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={pending}
                      onClick={() => resolve(it.id)}
                    >
                      <Icon name="check" size={12} /> {t.markOk}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
