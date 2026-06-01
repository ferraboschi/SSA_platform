"use client";

import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import type { Student } from "@/lib/domain";

export function IscrittiSection({
  students,
  whatsappLink,
}: {
  students: Student[];
  whatsappLink: string;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;

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
