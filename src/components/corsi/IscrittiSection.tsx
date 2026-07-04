"use client";

import { useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import type { CourseCompanion, Student } from "@/lib/domain";
import {
  addPartecipanteAction,
  removePartecipanteAction,
  setSeatsOverrideAction,
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

  const money = (n: number) => formatEuro(n, { decimals: 2 });
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
                            tickets={s.tickets ?? 1}
                            ticketsInferred={s.ticketsInferred ?? s.tickets ?? 1}
                            amount={s.amount}
                            onChange={(list) =>
                              setCompanionsById((m) => ({ ...m, [s.iscrizioneId as number]: list }))
                            }
                            money={money}
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

// Companions ("doppio" extra attendees) for one enrollment. For a multi-ticket
// buyer it also shows the editable seat count, the per-ticket amount, and one
// explicit "da compilare" slot per unfilled seat — the names get filled at
// check-in. Staff-only actions (role-guarded server-side); the course is
// re-derived from the enrollment, never trusted from the client.
function CompanionManager({
  courseId,
  iscrizioneId,
  buyerName,
  companions,
  tickets,
  ticketsInferred,
  amount,
  onChange,
  money,
  t,
}: {
  courseId: string;
  iscrizioneId: number;
  buyerName: string;
  companions: CourseCompanion[];
  /** Effective seat count (staff override if set, else inferred). */
  tickets: number;
  /** Auto-detected seat count (before override) — for the "auto: N" hint. */
  ticketsInferred: number;
  /** Net paid for the enrollment (for the informational per-ticket figure). */
  amount: number;
  onChange: (list: CourseCompanion[]) => void;
  money: (n: number) => string;
  t: ReturnType<typeof useT>["corsi"]["iscritti"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seat count is optimistic-local so the slots update instantly; the server
  // action revalidates the page too.
  const [seats, setSeats] = useState(tickets);
  const [editingSeats, setEditingSeats] = useState(false);
  const [seatDraft, setSeatDraft] = useState(String(tickets));

  const filled = companions.length;
  // Buyer occupies seat 1; the rest are companion slots.
  const emptySlots = Math.max(0, seats - 1 - filled);
  const overridden = seats !== ticketsInferred;
  const isMulti = seats > 1 || filled > 0;

  async function saveSeats(next: number | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await setSeatsOverrideAction(Number(courseId), iscrizioneId, next).catch(
      () => ({ ok: false }) as Awaited<ReturnType<typeof setSeatsOverrideAction>>,
    );
    setBusy(false);
    if (res.ok) {
      const effective = next ?? ticketsInferred;
      setSeats(effective);
      setSeatDraft(String(effective));
      setEditingSeats(false);
    } else {
      setError(res.error || t.seatsError);
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
      {/* Seat count + per-ticket amount (only when it's a multi-ticket order). */}
      {isMulti && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5, marginBottom: 3 }}>
          {editingSeats ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                min={1}
                max={20}
                value={seatDraft}
                onChange={(e) => setSeatDraft(e.target.value)}
                disabled={busy}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSeats(Math.max(1, Math.trunc(Number(seatDraft)) || 1));
                  if (e.key === "Escape") { setEditingSeats(false); setSeatDraft(String(seats)); }
                }}
                style={{ width: 52, fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
              />
              <button
                type="button"
                className="btn btn-xs btn-primary"
                onClick={() => saveSeats(Math.max(1, Math.trunc(Number(seatDraft)) || 1))}
                disabled={busy}
              >
                {t.seatsSave}
              </button>
              <button type="button" className="btn btn-xs" onClick={() => { setEditingSeats(false); setSeatDraft(String(seats)); }} disabled={busy}>
                {t.companionCancel}
              </button>
            </span>
          ) : (
            <>
              <span style={{ fontWeight: 600, color: "var(--text-2)" }}>
                {format(t.seatsLabel, { n: seats })}
              </span>
              <button
                type="button"
                onClick={() => { setError(null); setSeatDraft(String(seats)); setEditingSeats(true); }}
                style={{ fontSize: 11, fontWeight: 600, color: "var(--indigo, #4f46e5)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
              >
                {t.seatsEdit}
              </button>
              {amount > 0 && (
                <span style={{ color: "var(--text-4)" }}>· {format(t.seatsPerTicket, { v: money(amount / seats) })}</span>
              )}
              {overridden && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-4)" }}>
                  · {format(t.seatsAuto, { n: ticketsInferred })}
                  <button
                    type="button"
                    onClick={() => saveSeats(null)}
                    disabled={busy}
                    style={{ fontSize: 11, color: "var(--indigo, #4f46e5)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    {t.seatsReset}
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Filled companion rows. */}
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
            style={{ marginLeft: 2, background: "transparent", border: "none", color: "var(--danger, #dc2626)", cursor: busy ? "default" : "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Empty "da compilare" slots — one per unfilled seat. */}
      {Array.from({ length: emptySlots }, (_, k) => (
        <SlotRow
          key={`slot-${filled + k}`}
          label={format(t.slotFill, { i: filled + 2 + k, tot: seats })}
          disabledOthers={busy}
          courseId={courseId}
          iscrizioneId={iscrizioneId}
          onAdded={(comp) => onChange([...companions, comp])}
          t={t}
        />
      ))}

      {/* Single-ticket enrollment: keep the plain "+ aggiungi" so staff can still
          add a late walk-in / correct a missing seat. */}
      {!isMulti && (
        <SlotRow
          asLink
          label={t.companionAddParticipant}
          disabledOthers={busy}
          courseId={courseId}
          iscrizioneId={iscrizioneId}
          onAdded={(comp) => onChange([...companions, comp])}
          t={t}
        />
      )}

      {error && <div style={{ fontSize: 11, color: "var(--danger, #dc2626)", marginTop: 3 }}>{error}</div>}
    </div>
  );
}

// One fillable slot: shows a label until tapped, then a name+phone form. On
// success it becomes a real companion row (via the parent's onAdded).
function SlotRow({
  label,
  asLink,
  courseId,
  iscrizioneId,
  onAdded,
  disabledOthers,
  t,
}: {
  label: string;
  /** Render the trigger as a "+ link" (single-ticket case) vs a "da compilare" slot. */
  asLink?: boolean;
  courseId: string;
  iscrizioneId: number;
  onAdded: (c: CourseCompanion) => void;
  disabledOthers: boolean;
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
      onAdded({ id: res.companion.id, name: res.companion.full_name, phone: res.companion.phone });
      setName("");
      setPhone("");
      setOpen(false);
    } else {
      setError(res.error || t.companionAddError);
    }
  }

  if (open) {
    return (
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
        {error && <span style={{ fontSize: 11, color: "var(--danger, #dc2626)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setError(null); setOpen(true); }}
      disabled={disabledOthers}
      style={
        asLink
          ? { marginTop: 2, fontSize: 11.5, fontWeight: 600, color: "var(--indigo, #4f46e5)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }
          : {
              marginTop: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--indigo-600, #4f46e5)",
              background: "var(--indigo-50, #eef2ff)",
              border: "1px dashed var(--indigo, #4f46e5)",
              borderRadius: 6,
              padding: "3px 8px",
              cursor: "pointer",
            }
      }
    >
      {asLink ? `+ ${label}` : <>✎ {label}</>}
    </button>
  );
}
