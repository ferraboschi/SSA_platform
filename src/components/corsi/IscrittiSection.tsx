"use client";

import { useState, useEffect } from "react";
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
  lookupSeatEmailAction,
} from "@/lib/corsi/seat-actions";
import { cancelEnrollmentAction, type CancelEnrollmentResult } from "@/lib/corsi/enrollment-actions";

export function IscrittiSection({
  courseId,
  students,
  whatsappLink,
  capacity,
}: {
  courseId: string;
  students: Student[];
  whatsappLink: string;
  /** Shopify seat capacity — used to show "posti rimasti" (visibility only;
   *  Shopify remains authoritative on capacity). */
  capacity?: number;
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
        {capacity != null && capacity > 0 && (
          <span
            title="Posti totali su Shopify meno gli iscritti attivi. Shopify resta l'autorità sulla capienza."
            style={{ fontSize: 12.5, color: "var(--text-3)" }}
          >
            {Math.max(0, capacity - students.length) === 0
              ? "Al completo"
              : `${Math.max(0, capacity - students.length)} posti rimasti`}{" "}
            <span style={{ color: "var(--text-4)" }}>· {students.length}/{capacity}</span>
          </span>
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
                  {/* Ordine + biglietto + rimozione */}
                  <td>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div>
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
                      </div>
                      {s.iscrizioneId != null && <RemoveStudent courseId={courseId} student={s} />}
                    </div>
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
// Remove a real (paid) student from a LIVE course: refund (money handled in
// Shopify) or credit (a corsi_crediti row, redeemable same-level). The seat is
// marked annullata (kept for audit) and leaves the roster on refresh. The modal
// shows the manual-Shopify reminder + deep-link BEFORE the row disappears.
function RemoveStudent({ courseId, student }: { courseId: string; student: Student }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CancelEnrollmentResult | null>(null);

  const run = async (mode: "credito" | "rimborso") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await cancelEnrollmentAction(Number(courseId), student.iscrizioneId ?? 0, mode).catch(
      () => ({ ok: false, error: "Operazione non riuscita." }) as CancelEnrollmentResult,
    );
    setBusy(false);
    if (res.ok) setDone(res); // show the reminder; refresh only on close
    else setError(res.error || "Operazione non riuscita.");
  };

  const close = () => {
    const wasDone = Boolean(done);
    setOpen(false);
    setDone(null);
    setError(null);
    if (wasDone) router.refresh(); // now drop the annullata row from the roster
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Rimuovi dal corso"
        className="btn btn-icon btn-sm btn-ghost"
        style={{ color: "var(--text-4)", flexShrink: 0 }}
      >
        <Icon name="trash" size={12} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--surface, #fff)", borderRadius: 12, padding: "20px 22px", maxWidth: 440, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}
          >
            {done ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  {done.credited ? "Credito registrato ✓" : "Studente rimosso ✓"}
                </div>
                {done.reminder && (
                  <>
                    <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, margin: "0 0 12px" }}>
                      ⚠️ {done.reminder.text}
                    </p>
                    <a href={done.reminder.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary" style={{ textDecoration: "none" }}>
                      <Icon name="external" size={12} /> {done.reminder.label}
                    </a>
                  </>
                )}
                <div style={{ marginTop: 16, textAlign: "right" }}>
                  <button type="button" className="btn btn-sm" onClick={close}>Chiudi</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                  Rimuovi {student.name} dal corso
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5, margin: "0 0 14px" }}>
                  Lo studente esce dal corso. Scegli come gestire l&apos;importo pagato: un{" "}
                  <strong>rimborso</strong> (denaro reso su Shopify) o un <strong>credito</strong>{" "}
                  riassegnabile a un corso dello stesso livello.
                </p>
                {error && <p style={{ fontSize: 12.5, color: "var(--danger-fg, #b91c1c)", margin: "0 0 10px" }}>{error}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run("credito")}>
                    {busy ? "…" : "Crea credito"}
                  </button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run("rimborso")}>
                    {busy ? "…" : "Rimborso"}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={close}>Annulla</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

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
  // Info hint: is the typed email already in the system? (Debounced; never blocks.)
  const [emailInfo, setEmailInfo] = useState<{ name: string; courses: number } | null>(null);
  // Save-time conflict: the email belongs to a DIFFERENTLY-named person.
  const [conflict, setConflict] = useState<{ corsistaId: number; name: string; phone: string } | null>(null);

  const iscrId = student.iscrizioneId;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // As the educator types a valid email, check (debounced) whether it already
  // belongs to someone, and surface an ℹ️ with their name + participations.
  useEffect(() => {
    if (!open || !emailValid) {
      setEmailInfo(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      lookupSeatEmailAction(email.trim())
        .then((r) => {
          if (!alive) return;
          setEmailInfo(r.ok && r.exists ? { name: r.name ?? "", courses: r.courses ?? 0 } : null);
        })
        .catch(() => {});
    }, 450);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, open, emailValid]);
  const missing: string[] = [];
  if (!firstName.trim()) missing.push("nome");
  if (!lastName.trim()) missing.push("cognome");
  if (!emailValid) missing.push("email");
  if (!phone.trim()) missing.push("telefono");
  const ready = missing.length === 0;

  async function save(linkTo?: number) {
    if (!ready || busy || iscrId == null) return;
    setBusy(true);
    setError(null);
    setOkNote(null);
    setConflict(null);
    const res = await completeSeatAction(
      Number(courseId),
      iscrId,
      {
        name: `${firstName.trim().replace(/\s+/g, " ")} ${lastName.trim().replace(/\s+/g, " ")}`,
        email: email.trim(),
        phone: `${dialCode} ${phone.trim()}`.trim(),
      },
      linkTo,
    ).catch(() => ({ ok: false }) as Awaited<ReturnType<typeof completeSeatAction>>);
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
    } else if (res.conflict) {
      // Email belongs to a differently-named person → inline "same person?" card.
      setConflict(res.conflict);
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
        {/* The table has min-width:640 + horizontal scroll on small screens, so
            this colSpan cell is wider than the viewport. Pin the edit form to the
            left of the scroll area and cap it at viewport width, so its fields
            WRAP and nothing (esp. the phone) is pushed off-screen. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            position: "sticky",
            left: 0,
            width: "min(100%, calc(100vw - 72px))",
          }}
        >
          <Avatar name={String(student.seatIndex ?? 1)} size="md" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{student.name}</span>
              <Badge tone="warning">{t.seatPending}</Badge>
            </div>
            {open ? (
              <>
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
                  <div style={{ position: "relative" }}>
                    <input
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setConflict(null);
                      }}
                      maxLength={200}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") setOpen(false);
                      }}
                      style={{ ...seatInput, paddingRight: emailInfo ? 26 : undefined }}
                    />
                    {emailInfo && (
                      <span
                        title={
                          `Email già a sistema` +
                          (emailInfo.name ? ` — ${emailInfo.name}` : "") +
                          (emailInfo.courses
                            ? ` · ${emailInfo.courses} cors${emailInfo.courses === 1 ? "o" : "i"}`
                            : "")
                        }
                        aria-label="Email già presente a sistema"
                        style={{
                          position: "absolute",
                          right: 7,
                          top: "50%",
                          transform: "translateY(-50%)",
                          cursor: "help",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--indigo-600, #635BFF)",
                          lineHeight: 1,
                        }}
                      >
                        ⓘ
                      </span>
                    )}
                  </div>
                </SeatField>
                <SeatField label={t.seatPhonePh} style={{ flex: "1 1 320px" }}>
                  {/* flex-wrap so on a very narrow field the number drops BELOW the
                      (wide, country-named) prefix instead of being pushed off — the
                      number is always visible at any viewport. */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      disabled={busy}
                      aria-label="Prefisso internazionale"
                      // Flag + code only (compact), fixed width.
                      style={{ ...seatInput, flex: "0 0 auto", width: 190 }}
                    >
                      {COUNTRY_CODES.map((cc) => (
                        <option key={cc.c} value={cc.c}>
                          {cc.f} {cc.n} {cc.c}
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
                      // Min-width 120 (never 0): the number can't collapse; when the
                      // field is too narrow it wraps below the prefix (full width).
                      style={{ ...seatInput, flex: "1 1 120px", minWidth: 120 }}
                    />
                  </div>
                </SeatField>
              </div>
              {/* Actions on their OWN line; the missing/error/success note sits
                  BESIDE the buttons, so the buttons NEVER shift (owner: no jumping). */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => save()}
                  disabled={busy || !ready}
                  title={!ready ? `Compila: ${missing.join(", ")}` : undefined}
                >
                  {t.seatSave}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>
                  {t.seatCancel}
                </button>
                {error ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--danger, #dc2626)" }}>{error}</span>
                ) : okNote ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--success-fg, #15803d)" }}>✓ {okNote}</span>
                ) : !ready && (firstName || lastName || email || phone) ? (
                  <span style={{ fontSize: 12, color: "var(--warning-fg)" }}>Manca: {missing.join(", ")}</span>
                ) : null}
              </div>
              {conflict && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    border: "1px solid #fcd34d",
                    background: "#fffbeb",
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: "#92400e",
                    display: "grid",
                    gap: 8,
                    maxWidth: 520,
                  }}
                >
                  <div>
                    ⚠️ Questa email è già di{" "}
                    <strong>{conflict.name || "un altro nominativo"}</strong>
                    {conflict.phone ? ` · 📞 ${conflict.phone}` : ""}.
                  </div>
                  <div style={{ fontWeight: 600 }}>È la stessa persona?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() => save(conflict.corsistaId)}
                    >
                      Sì, è lui/lei → collega
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setConflict(null);
                        setEmail("");
                      }}
                    >
                      No, altra persona → correggi email
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#a16207" }}>
                    Ogni persona ha un&apos;email unica: se è un&apos;altra persona, inserisci la sua email corretta.
                  </div>
                </div>
              )}
              </>
            ) : (
              <>
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
              {error && <div style={{ fontSize: 12, fontWeight: 500, color: "var(--danger, #dc2626)", marginTop: 5 }}>{error}</div>}
              </>
            )}
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
