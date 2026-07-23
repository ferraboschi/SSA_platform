"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { COUNTRY_CODES } from "@/lib/phone/dial-codes";
import type { Student } from "@/lib/domain";
import {
  completeSeatAction,
  addExtraSeatAction,
  removeSeatAction,
} from "@/lib/corsi/seat-actions";

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
  const router = useRouter();
  const [addingExtra, setAddingExtra] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Placeholder seats (F4) are seats still "da completare": they count toward the
  // headcount but are not paying/free real people, so the money badges exclude
  // them and a separate "da completare" chip surfaces them.
  const real = students.filter((s) => !s.placeholder);
  const pending = students.filter((s) => s.placeholder).length;
  const paying = real.filter((s) => s.amount > 0).length;
  const free = real.filter((s) => s.amount === 0).length;
  const revenue = real.reduce((sum, s) => sum + s.amount, 0);

  const money = (n: number) => formatEuro(n, { decimals: 2 });
  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
  };

  async function addExtra() {
    if (addingExtra) return;
    setAddingExtra(true);
    setAddError(null);
    const res = await addExtraSeatAction(Number(courseId)).catch(
      () => ({ ok: false }) as Awaited<ReturnType<typeof addExtraSeatAction>>,
    );
    setAddingExtra(false);
    if (res.ok) router.refresh();
    else setAddError(res.error || t.seatAddError);
  }

  if (students.length === 0) {
    return (
      <div>
        <div className="card card-pad" style={{ color: "var(--text-2)" }}>
          {t.noStudents}
        </div>
        <ExtraSeatButton onClick={addExtra} busy={addingExtra} label={t.seatAddExtra} />
        {addError && (
          <div style={{ fontSize: 11, color: "var(--danger, #dc2626)", marginTop: 4 }}>{addError}</div>
        )}
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
        {pending > 0 && (
          <Badge tone="warning" size="lg">
            {format(t.seatToComplete, { n: pending })}
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
              if (s.placeholder) {
                return (
                  <PlaceholderRow
                    key={s.iscrizioneId ?? `ph-${i}`}
                    courseId={courseId}
                    student={s}
                    t={t}
                  />
                );
              }
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
                      </div>
                    </div>
                  </td>
                  {/* Telefono */}
                  <td style={{ whiteSpace: "nowrap" }}>
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
                  <td style={{ whiteSpace: "nowrap" }}>
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

      <ExtraSeatButton onClick={addExtra} busy={addingExtra} label={t.seatAddExtra} />
      {addError && (
        <div style={{ fontSize: 11, color: "var(--danger, #dc2626)", marginTop: 4 }}>{addError}</div>
      )}
    </div>
  );
}

// A "+ Aggiungi posto extra (fuori ordine)" course-level action — replaces the
// old generic per-row "+ aggiungi partecipante". Creates a placeholder seat.
function ExtraSeatButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        marginTop: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--indigo, #635BFF)",
        background: "transparent",
        border: "1px dashed var(--indigo, #635BFF)",
        borderRadius: 8,
        padding: "6px 12px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name="plus" size={13} /> {label}
    </button>
  );
}

// A multi-ticket seat whose person isn't filled in yet. Shows the "da completare"
// state and an inline form to enter the real attendee (→ they become a corsista
// and get exam links via the normal path). Staff can also drop the seat.
function PlaceholderRow({
  courseId,
  student,
  t,
}: {
  courseId: string;
  student: Student;
  t: ReturnType<typeof useT>["corsi"]["iscritti"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Separate first/last name (owner batch 8): "Gian Paolo" is a first name,
  // not name+surname. Storage stays the composed full name.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dialCode, setDialCode] = useState("+39");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const iscrId = student.iscrizioneId;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const missing: string[] = [];
  if (!firstName.trim()) missing.push("nome");
  if (!lastName.trim()) missing.push("cognome");
  if (!emailValid) missing.push("email");
  if (!phone.trim()) missing.push("telefono");
  const ready = missing.length === 0;

  async function save() {
    if (!ready || busy || iscrId == null) return;
    setBusy(true);
    setError(null);
    setOkNote(null);
    const res = await completeSeatAction(Number(courseId), iscrId, {
      name: `${firstName.trim().replace(/\s+/g, " ")} ${lastName.trim().replace(/\s+/g, " ")}`,
      email: email.trim(),
      phone: `${dialCode} ${phone.trim()}`.trim(),
    }).catch(() => ({ ok: false }) as Awaited<ReturnType<typeof completeSeatAction>>);
    setBusy(false);
    if (res.ok && res.linked) {
      // Repeat attendee: linked to the existing profile — confirm briefly, then refresh.
      setOkNote("Presenza aggiunta a un profilo già esistente.");
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1500);
    } else if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error || t.seatCompleteError);
    }
  }

  async function remove() {
    if (busy || iscrId == null) return;
    setBusy(true);
    setError(null);
    const res = await removeSeatAction(Number(courseId), iscrId).catch(
      () => ({ ok: false }) as Awaited<ReturnType<typeof removeSeatAction>>,
    );
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error || t.seatRemoveError);
  }

  return (
    // The whole "da completare" seat spans the full table width so the edit form
    // (especially the email) has room instead of being crushed into one column.
    <tr style={{ background: "var(--surface-2, #f8f8fb)" }}>
      <td colSpan={7} style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Avatar name={String(student.seatIndex ?? 1)} size="md" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{student.name}</span>
              <Badge tone="warning">{t.seatPending}</Badge>
            </div>
            {open ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "flex-end" }}>
                <SeatField label="Nome" style={{ flex: "1 1 130px" }}>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={60}
                    disabled={busy}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") setOpen(false);
                    }}
                    style={seatInput}
                  />
                </SeatField>
                <SeatField label="Cognome" style={{ flex: "1 1 130px" }}>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={60}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") setOpen(false);
                    }}
                    style={seatInput}
                  />
                </SeatField>
                <SeatField label={t.seatEmailPh} style={{ flex: "2 1 280px" }}>
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={200}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") setOpen(false);
                    }}
                    style={seatInput}
                  />
                </SeatField>
                <SeatField label={t.seatPhonePh} style={{ flex: "1 1 200px" }}>
                  <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      disabled={busy}
                      aria-label="Prefisso internazionale"
                      // Flag + code only (compact) so the number input beside it is
                      // never squeezed off-screen when the row narrows.
                      style={{ ...seatInput, flex: "0 0 auto", width: 92 }}
                    >
                      {COUNTRY_CODES.map((cc) => (
                        <option key={cc.c} value={cc.c}>
                          {cc.f} {cc.c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={40}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") setOpen(false);
                      }}
                      style={{ ...seatInput, flex: "1 1 60px", minWidth: 0 }}
                    />
                  </div>
                </SeatField>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 auto" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={save}
                      disabled={busy || !ready}
                      title={!ready ? `Compila: ${missing.join(", ")}` : undefined}
                    >
                      {t.seatSave}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>
                      {t.seatCancel}
                    </button>
                  </div>
                  {!ready && (firstName || lastName || email || phone) && (
                    <span style={{ fontSize: 11, color: "var(--warning-fg)" }}>Manca: {missing.join(", ")}</span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setError(null); setOpen(true); }}
                  disabled={busy}
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--indigo, #635BFF)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                >
                  ✎ {t.seatComplete}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  title={t.seatRemove}
                  style={{ fontSize: 11.5, color: "var(--danger, #dc2626)", background: "transparent", border: "none", padding: 0, cursor: busy ? "default" : "pointer" }}
                >
                  {t.seatRemove}
                </button>
              </div>
            )}
            {error && <div style={{ fontSize: 12, fontWeight: 500, color: "var(--danger, #dc2626)", marginTop: 5 }}>{error}</div>}
            {okNote && <div style={{ fontSize: 12, fontWeight: 500, color: "var(--success-fg, #15803d)", marginTop: 5 }}>✓ {okNote}</div>}
          </div>
        </div>
      </td>
    </tr>
  );
}

// A labeled full-width field for the seat-completion form. Labels above each
// input remove the ambiguity of three bare, wrapping boxes (a person read the
// email box as "surname") and give the email room to be read.
const seatInput: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  width: "100%",
};

function SeatField({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", minWidth: 0, ...style }}>
      <span
        style={{
          display: "block",
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-3)",
          margin: "0 0 3px",
          textTransform: "uppercase",
          letterSpacing: ".03em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
