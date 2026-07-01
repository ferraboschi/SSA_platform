"use client";

import { useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { CourseCompanion, Student } from "@/lib/domain";
import {
  addPartecipanteAction,
  removePartecipanteAction,
} from "@/lib/corsi/partecipanti-actions";

export function IscrittiSection({
  courseId,
  students,
  whatsappLink,
}: {
  courseId: string;
  students: Student[];
  whatsappLink: string;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  // Local overlay of companions so add/remove reflect immediately without a full
  // page reload (the server action revalidates too, but this keeps the UI snappy).
  const [companionsById, setCompanionsById] = useState<Record<number, CourseCompanion[]>>(() => {
    const seed: Record<number, CourseCompanion[]> = {};
    for (const s of students) if (s.iscrizioneId != null) seed[s.iscrizioneId] = s.companions ?? [];
    return seed;
  });
  const companionsFor = (s: Student): CourseCompanion[] =>
    s.iscrizioneId != null ? (companionsById[s.iscrizioneId] ?? s.companions ?? []) : [];

  const paying = students.filter((s) => s.amount > 0).length;
  const free = students.filter((s) => s.amount === 0).length;
  const revenue = students.reduce((sum, s) => sum + s.amount, 0);

  const money = (n: number) =>
    `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
  };

  if (students.length === 0) {
    return (
      <div className="card card-pad" style={{ color: "var(--text-2)" }}>
        {t.noStudents}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Badge tone="neutral" size="lg">
          {students.length} {tr.corsi.detail.tabIscritti}
        </Badge>
        <Badge tone="success" size="lg">
          {paying} {t.payPaid.toLowerCase()}
        </Badge>
        {free > 0 && (
          <Badge tone="warning" size="lg">
            {free} {t.free.toLowerCase()}
          </Badge>
        )}
        <span style={{ fontSize: 13, color: "var(--text-2)" }}>{money(revenue)}</span>
        {whatsappLink && (
          <a
            className="btn btn-sm"
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="whatsapp" size={13} />
            {t.openGroup}
          </a>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colCorsista}</th>
              <th>{t.colPhone}</th>
              <th style={{ textAlign: "center" }}>{t.colTicket}</th>
              <th>{t.colAmount}</th>
              <th>{t.colOrderDate}</th>
              <th>{t.colPayment}</th>
              <th>{t.colOrder}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const paid = s.paymentStatus === "paid";
              return (
                <tr key={s.ticketCode ?? `${s.email}-${i}`}>
                  {/* Corsista */}
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={s.name} size="md" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          {s.isDuplicate && (
                            <span title={t.doppioTip}>
                              <Badge tone="warning">
                                <Icon name="warn" size={10} /> {t.doppio}
                              </Badge>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{s.email}</div>
                        {s.nameMismatch && s.buyerName && (
                          <div style={{ fontSize: 11, color: "var(--warning)" }}>
                            {format(t.buyerDiff, { name: s.buyerName })}
                          </div>
                        )}
                        {s.iscrizioneId != null && (
                          <CompanionManager
                            courseId={courseId}
                            iscrizioneId={s.iscrizioneId}
                            buyerName={s.name}
                            companions={companionsFor(s)}
                            onChange={(list) =>
                              setCompanionsById((m) => ({ ...m, [s.iscrizioneId as number]: list }))
                            }
                            t={t}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Telefono */}
                  <td>
                    {s.phone ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {s.hasWhatsApp && (
                          <Icon name="whatsapp" size={13} className="text-3" />
                        )}
                        {s.phone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* Ticket count */}
                  <td style={{ textAlign: "center" }}>{s.tickets ?? 1}</td>
                  {/* Importo + sconto */}
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {s.amount === 0 ? t.free : money(s.amount)}
                    </div>
                    {s.discountCode && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          marginTop: 2,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--oro, #8A6E1A)",
                        }}
                      >
                        <Icon name="tag" size={10} />
                        {s.discountCode}
                        {s.discountValue ? ` −${money(s.discountValue)}` : ""}
                      </span>
                    )}
                  </td>
                  {/* Data ordine */}
                  <td>{fmtDate(s.orderDate)}</td>
                  {/* Pagamento */}
                  <td>
                    {s.paymentStatus ? (
                      <Badge tone={paid ? "success" : "warning"}>
                        {paid ? t.payPaid : t.payPending}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* Ordine + biglietto */}
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.orderNumber || "—"}</div>
                    {s.ticketCode && (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--text-4)",
                          fontFamily: "monospace",
                        }}
                      >
                        {t.ticketRef} {s.ticketCode}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Existing companions ("doppio" extra attendees) for one enrollment + an inline
// add form. Staff may add for ANY enrollment (not only doubles) — the server
// action is role-guarded and re-derives the course from the enrollment.
function CompanionManager({
  courseId,
  iscrizioneId,
  buyerName,
  companions,
  onChange,
  t,
}: {
  courseId: string;
  iscrizioneId: number;
  buyerName: string;
  companions: CourseCompanion[];
  onChange: (list: CourseCompanion[]) => void;
  t: ReturnType<typeof useT>["corsi"]["iscritti"];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await addPartecipanteAction(Number(courseId), iscrizioneId, trimmed, phone.trim()).catch(
      () => ({ ok: false }) as Awaited<ReturnType<typeof addPartecipanteAction>>,
    );
    setBusy(false);
    if (res.ok && res.companion) {
      onChange([...companions, { id: res.companion.id, name: res.companion.full_name, phone: res.companion.phone }]);
      setName("");
      setPhone("");
      setOpen(false);
    } else {
      setError(res.error || t.companionAddError);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await removePartecipanteAction(id).catch(
      () => ({ ok: false }) as Awaited<ReturnType<typeof removePartecipanteAction>>,
    );
    setBusy(false);
    if (res.ok) onChange(companions.filter((c) => c.id !== id));
    else setError(res.error || t.companionRemoveError);
  }

  return (
    <div style={{ marginTop: 6 }}>
      {companions.map((c) => (
        <div
          key={c.id}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", marginTop: 2 }}
        >
          <Icon name="user" size={11} className="text-3" />
          <span style={{ fontWeight: 500 }}>{c.name}</span>
          {c.phone && <span style={{ color: "var(--text-3)" }}>· {c.phone}</span>}
          <span style={{ fontSize: 10.5, color: "var(--text-4)", fontStyle: "italic" }}>
            {format(t.companionGuestOf, { name: buyerName })}
          </span>
          <button
            type="button"
            onClick={() => remove(c.id)}
            disabled={busy}
            title={t.companionRemove}
            style={{
              marginLeft: 2,
              background: "transparent",
              border: "none",
              color: "var(--danger, #dc2626)",
              cursor: busy ? "default" : "pointer",
              fontSize: 11,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}
      {open ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.companionName}
            maxLength={120}
            disabled={busy}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ fontSize: 12, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border)", width: 130 }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.companionPhone}
            maxLength={40}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ fontSize: 12, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border)", width: 110 }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={add} disabled={busy || !name.trim()}>
            {t.companionAdd}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>
            {t.companionCancel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          style={{
            marginTop: 2,
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--indigo, #4f46e5)",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          + {t.companionAddParticipant}
        </button>
      )}
      {error && <div style={{ fontSize: 11, color: "var(--danger, #dc2626)", marginTop: 3 }}>{error}</div>}
    </div>
  );
}
