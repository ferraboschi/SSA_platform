"use client";

import { useRef, useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { useT, format } from "@/lib/i18n";
import { buildIscrittiModel, type Attendee, type IscrittoModel } from "@/lib/corsi";
import type { Student } from "@/lib/domain";

type StatusFilter = "confermati" | "raccogliere" | "correggere" | null;

export function IscrittiSection({
  students,
  whatsappLink,
}: {
  students: Student[];
  whatsappLink: string;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [iscritti, setIscritti] = useState<IscrittoModel[]>(() => buildIscrittiModel(students));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<IscrittoModel>) =>
    setIscritti((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const updateBuyer = (id: string, patch: Partial<IscrittoModel["buyer"]>) =>
    setIscritti((arr) =>
      arr.map((i) => (i.id === id ? { ...i, buyer: { ...i.buyer, ...patch } } : i)),
    );
  const updateAttendee = (id: string, attId: string, patch: Partial<Attendee>) =>
    setIscritti((arr) =>
      arr.map((i) =>
        i.id === id
          ? { ...i, attendees: i.attendees.map((a) => (a.id === attId ? { ...a, ...patch } : a)) }
          : i,
      ),
    );
  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const matchStatus = (i: IscrittoModel, f: StatusFilter) => {
    if (!f) return true;
    if (f === "confermati") return i.attendees.length > 0 && i.attendees.every((a) => a.confirmed);
    if (f === "raccogliere") return i.attendees.some((a) => a.pending);
    if (f === "correggere") return i.flags.typoName || i.flags.typoEmail;
    return true;
  };

  const list = iscritti.filter((i) => {
    if (!matchStatus(i, statusFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.buyer.name.toLowerCase().includes(q) ||
      i.buyer.email.toLowerCase().includes(q) ||
      i.attendees.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  const totalSeats = iscritti.reduce((s, i) => s + i.seats, 0);
  const confermatiCount = iscritti.filter(
    (i) => i.attendees.length > 0 && i.attendees.every((a) => a.confirmed),
  ).length;
  const raccogliereCount = iscritti.filter((i) => i.attendees.some((a) => a.pending)).length;
  const correggereCount = iscritti.filter((i) => i.flags.typoName || i.flags.typoEmail).length;
  const conWA = iscritti.filter((i) => i.buyer.hasWA).length;

  const statusFilterLabel =
    statusFilter === "confermati"
      ? t.filterConfirmed
      : statusFilter === "raccogliere"
        ? t.filterToCollect
        : statusFilter === "correggere"
          ? t.filterToCorrect
          : null;

  return (
    <div>
      <WhatsAppGroupBar whatsappLink={whatsappLink} totalIscritti={iscritti.length} conWA={conWA} />

      {/* Stats strip — clickable filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          marginBottom: 16,
          background: "var(--surface)",
          borderRadius: "var(--r-3)",
          boxShadow: "var(--sh-card)",
          overflow: "hidden",
        }}
      >
        <MiniStat label={t.totalSeats} value={totalSeats} sub={format(t.ordersCount, { n: iscritti.length })} />
        <MiniStat
          label={t.confirmed}
          value={confermatiCount}
          sub={format(t.ofOrders, { n: iscritti.length })}
          tone="success"
          active={statusFilter === "confermati"}
          onClick={() => setStatusFilter(statusFilter === "confermati" ? null : "confermati")}
        />
        <MiniStat
          label={t.toCollect}
          value={raccogliereCount}
          sub={t.missingNames}
          tone={raccogliereCount > 0 ? "warning" : null}
          active={statusFilter === "raccogliere"}
          onClick={() => setStatusFilter(statusFilter === "raccogliere" ? null : "raccogliere")}
        />
        <MiniStat
          label={t.toCorrect}
          value={correggereCount}
          sub={t.nameEmailErrors}
          tone={correggereCount > 0 ? "danger" : null}
          active={statusFilter === "correggere"}
          onClick={() => setStatusFilter(statusFilter === "correggere" ? null : "correggere")}
          last
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 360px" }}>
          <Icon name="search" size={14} className="topbar-search-icon" />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {statusFilter && (
          <span className="pill on" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {statusFilterLabel}
            <button
              onClick={() => setStatusFilter(null)}
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 14,
                height: 14,
                borderRadius: 3,
                background: "rgba(255,255,255,0.18)",
                color: "white",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <Icon name="x" size={9} />
            </button>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm">
          <Icon name="mail" size={12} />
          {t.emailAll}
        </button>
        <button className="btn btn-sm">
          <Icon name="download" size={12} />
          {t.exportCsv}
        </button>
      </div>

      {/* List */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th>{t.thBuyer}</th>
              <th>{t.thParticipants}</th>
              <th>{t.thStatus}</th>
              <th>{t.thOrder}</th>
              <th style={{ textAlign: "right" }}>{t.thPaid}</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {list.flatMap((i) => {
              const rows = [
                <IscrittoRow
                  key={i.id}
                  iscritto={i}
                  expanded={expanded.has(i.id)}
                  onToggle={() => toggleExpand(i.id)}
                />,
              ];
              if (expanded.has(i.id)) {
                rows.push(
                  <IscrittoDetail
                    key={`${i.id}-detail`}
                    iscritto={i}
                    onUpdateBuyer={(p) => updateBuyer(i.id, p)}
                    onUpdateAttendee={(aid, p) => updateAttendee(i.id, aid, p)}
                    onAddAttendee={() =>
                      update(i.id, {
                        seats: i.seats + 1,
                        attendees: [
                          ...i.attendees,
                          {
                            id: `att-${i.id}-${i.attendees.length + 1}`,
                            name: "",
                            email: "",
                            phone: "",
                            isBuyer: false,
                            isGift: false,
                            confirmed: false,
                            pending: true,
                          },
                        ],
                      })
                    }
                    onRemoveAttendee={(aid) =>
                      update(i.id, {
                        seats: Math.max(1, i.seats - 1),
                        attendees: i.attendees.filter((a) => a.id !== aid),
                      })
                    }
                  />,
                );
              }
              return rows;
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  {t.noMatch}
                  {statusFilter && (
                    <>
                      {" "}
                      <button className="link" onClick={() => setStatusFilter(null)}>
                        {t.removeFilter}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
  last,
  onClick,
  active,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "success" | "warning" | "danger" | null;
  last?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const color =
    tone === "success"
      ? "var(--success-fg)"
      : tone === "warning"
        ? "var(--warning-fg)"
        : tone === "danger"
          ? "var(--danger-fg)"
          : "var(--text)";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{
        padding: "14px 20px",
        borderRight: last ? "none" : "1px solid var(--border-2)",
        textAlign: "left",
        background: active ? "var(--indigo-50)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        border: "none",
        borderRadius: 0,
        position: "relative",
        transition: "background var(--dur-fast)",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        if (onClick && !active) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (onClick && !active) e.currentTarget.style.background = "transparent";
      }}
    >
      {active && (
        <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--indigo)" }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            fontWeight: 600,
            letterSpacing: "var(--ls-caps)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {onClick && (
          <Icon
            name="filter"
            size={10}
            className={active ? "" : "text-mute"}
            style={active ? { color: "var(--indigo)" } : undefined}
          />
        )}
      </div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>{sub}</div>}
    </Tag>
  );
}

function WhatsAppGroupBar({
  whatsappLink,
  totalIscritti,
  conWA,
}: {
  whatsappLink: string;
  totalIscritti: number;
  conWA: number;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  const [created, setCreated] = useState(false);
  const stale = totalIscritti - conWA > 0;
  return (
    <div
      className="card card-pad"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
        background: created ? "linear-gradient(135deg, #E8FCEC, var(--surface))" : "var(--surface)",
        border: `1px solid ${created ? "rgba(0, 135, 90, 0.25)" : "var(--border)"}`,
        boxShadow: "var(--sh-card)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: created ? "var(--success)" : "var(--surface-2)",
          color: created ? "white" : "var(--text-3)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          transition: "all var(--dur)",
        }}
      >
        <Icon name="whatsapp" size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{created ? t.groupActive : t.groupTitle}</div>
          {created ? (
            <Badge tone="success" dot>
              {t.updatedAgo}
            </Badge>
          ) : (
            stale && (
              <Badge tone="warning" dot>
                {format(t.withoutNumber, { n: totalIscritti - conWA })}
              </Badge>
            )
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
          {created ? (
            <>
              {format(t.members, { a: conWA, b: totalIscritti })} · <span className="mono">{whatsappLink}</span>
            </>
          ) : (
            format(t.hasWA, { a: conWA, b: totalIscritti })
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {created ? (
          <>
            <button className="btn btn-sm">
              <Icon name="refresh" size={11} />
              {t.refresh}
            </button>
            <a className="btn btn-sm" href={whatsappLink} target="_blank" rel="noopener">
              <Icon name="external" size={11} />
              {t.openGroup}
            </a>
          </>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => setCreated(true)}>
            <Icon name="whatsapp" size={11} />
            {t.createGroup}
          </button>
        )}
      </div>
    </div>
  );
}

function IscrittoRow({
  iscritto: i,
  expanded,
  onToggle,
}: {
  iscritto: IscrittoModel;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  const hasIssue = i.flags.typoName || i.flags.typoEmail;
  const pendingAtt = i.attendees.filter((a) => a.pending).length;
  const confirmedAtt = i.attendees.filter((a) => a.confirmed).length;

  let statusBadge;
  if (pendingAtt > 0)
    statusBadge = (
      <Badge tone="warning" dot>
        {format(t.badgeToCollect, { n: pendingAtt })}
      </Badge>
    );
  else if (hasIssue)
    statusBadge = (
      <Badge tone="danger" dot>
        {t.badgeToCorrect}
      </Badge>
    );
  else
    statusBadge = (
      <Badge tone="success" dot>
        {t.badgeAllConfirmed}
      </Badge>
    );

  return (
    <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "var(--indigo-50)" : undefined }}>
      <td>
        <button
          className="btn btn-icon btn-sm btn-ghost"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform var(--dur-fast)" }}
        >
          <Icon name="chevron" size={13} />
        </button>
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Avatar name={i.buyer.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {i.buyer.name}
              {i.flags.typoName && (
                <span title={t.typoNameTip} style={{ fontSize: 11, color: "var(--danger-fg)" }}>
                  ⚠
                </span>
              )}
              {i.isGift && <Badge tone="indigo">{t.gift}</Badge>}
              {i.isMulti && <Badge tone="neutral">{format(t.seats, { n: i.seats })}</Badge>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
              <a
                href={`mailto:${i.buyer.email}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "var(--font-mono)",
                  maxWidth: "100%",
                }}
                title={format(t.emailTip, { email: i.buyer.email })}
              >
                <Icon name="mail" size={11} className="text-4" />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.buyer.email}
                </span>
                {i.flags.typoEmail && (
                  <span title={t.typoEmailTip} style={{ color: "var(--danger-fg)" }}>
                    ⚠
                  </span>
                )}
              </a>
              <a
                href={`tel:${(i.buyer.phone || "").replace(/\s/g, "")}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "var(--font-mono)",
                }}
                title={format(t.callTip, { phone: i.buyer.phone })}
              >
                <Icon name="phone" size={11} className="text-4" />
                {i.buyer.phone}
                {i.buyer.hasWA && (
                  <span
                    title={t.hasWAShort}
                    style={{
                      color: "var(--success-fg)",
                      fontSize: 10,
                      marginLeft: 2,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Icon name="whatsapp" size={10} />
                    WA
                  </span>
                )}
              </a>
            </div>
          </div>
        </div>
      </td>
      <td>
        {i.isGift && i.attendees[0]?.pending ? (
          <span className="text-3" style={{ fontSize: 12.5, fontStyle: "italic" }}>
            {t.giftNamePending}
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 500 }}>
              {i.attendees
                .filter((a) => a.name)
                .map((a) => a.name)
                .join(" · ") || "—"}
            </span>
            {confirmedAtt > 0 && confirmedAtt === i.attendees.length && (
              <span title={t.allConfirmedTip} style={{ color: "var(--success-fg)" }}>
                <Icon name="check" size={12} />
              </span>
            )}
          </div>
        )}
      </td>
      <td>{statusBadge}</td>
      <td className="num text-3">{i.buyer.orderNumber}</td>
      <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
        {i.totalAmount.toLocaleString("it-IT")} €
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-icon btn-sm btn-ghost">
          <Icon name="more" size={13} />
        </button>
      </td>
    </tr>
  );
}

function IscrittoDetail({
  iscritto: i,
  onUpdateBuyer,
  onUpdateAttendee,
  onAddAttendee,
  onRemoveAttendee,
}: {
  iscritto: IscrittoModel;
  onUpdateBuyer: (patch: Partial<IscrittoModel["buyer"]>) => void;
  onUpdateAttendee: (attId: string, patch: Partial<Attendee>) => void;
  onAddAttendee: () => void;
  onRemoveAttendee: (attId: string) => void;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  return (
    <tr style={{ background: "var(--surface-2)" }}>
      <td colSpan={7} style={{ padding: 0 }}>
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Buyer block */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {format(t.buyerOrder, { n: i.buyer.orderNumber })}
            </div>
            <div className="card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
              <PersonForm
                person={i.buyer}
                onChange={onUpdateBuyer}
                typoName={i.flags.typoName}
                typoEmail={i.flags.typoEmail}
                showWA
              />
              {i.isGift && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "var(--indigo-50)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--indigo-600)",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <Icon name="tag" size={13} />
                  <span>{t.giftNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Attendees block */}
          <div>
            <div
              className="eyebrow"
              style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}
            >
              <span>
                {i.attendees.length > 1 ? t.participantMany : t.participantOne} · {i.seats}{" "}
                {i.seats === 1 ? t.seatOne : t.seatMany}
              </span>
              <button
                className="link"
                onClick={onAddAttendee}
                style={{ fontSize: 11, background: "none", border: "none", padding: 0 }}
              >
                {t.addSeat}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {i.attendees.map((a) => (
                <AttendeeCard
                  key={a.id}
                  attendee={a}
                  onChange={(p) => onUpdateAttendee(a.id, p)}
                  onRemove={i.attendees.length > 1 ? () => onRemoveAttendee(a.id) : null}
                />
              ))}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function PersonForm({
  person,
  onChange,
  typoName,
  typoEmail,
  showWA,
}: {
  person: { name: string; email: string; phone: string; hasWA?: boolean };
  onChange: (patch: { name?: string; email?: string }) => void;
  typoName?: boolean;
  typoEmail?: boolean;
  showWA?: boolean;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <EditableField
        label={t.fieldName}
        value={person.name}
        editing={editingName}
        onEdit={() => setEditingName(true)}
        onSave={(v) => {
          onChange({ name: v });
          setEditingName(false);
        }}
        onCancel={() => setEditingName(false)}
        warn={typoName && !editingName ? t.typoNameWarn : null}
      />
      <EditableField
        label={t.fieldEmail}
        value={person.email}
        editing={editingEmail}
        type="email"
        mono
        onEdit={() => setEditingEmail(true)}
        onSave={(v) => {
          onChange({ email: v });
          setEditingEmail(false);
        }}
        onCancel={() => setEditingEmail(false)}
        warn={typoEmail && !editingEmail ? t.typoEmailWarn : null}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{t.tel}</span>
        <span className="mono">{person.phone}</span>
        {showWA && person.hasWA && (
          <Badge tone="success" dot>
            {t.whatsapp}
          </Badge>
        )}
        {showWA && !person.hasWA && <Badge tone="neutral">{t.noWhatsapp}</Badge>}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
  warn,
  type,
  mono,
}: {
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  warn?: string | null;
  type?: string;
  mono?: boolean;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            ref={inputRef}
            className="input"
            type={type || "text"}
            defaultValue={value}
            autoFocus
            style={{ fontFamily: mono ? "var(--font-mono)" : undefined }}
          />
          <button className="btn btn-sm btn-primary" onClick={() => onSave(inputRef.current?.value ?? "")}>
            <Icon name="check" size={11} />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>
            <Icon name="x" size={11} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : undefined }}>
            {value || (
              <span className="text-mute" style={{ fontWeight: 400 }}>
                {t.empty}
              </span>
            )}
          </span>
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onEdit}>
            <Icon name="edit" size={11} />
          </button>
          {warn && <span style={{ fontSize: 11, color: "var(--danger-fg)", marginLeft: 4 }}>⚠ {warn}</span>}
        </div>
      )}
    </div>
  );
}

function AttendeeCard({
  attendee: a,
  onChange,
  onRemove,
}: {
  attendee: Attendee;
  onChange: (patch: Partial<Attendee>) => void;
  onRemove: (() => void) | null;
}) {
  const tr = useT();
  const t = tr.corsi.iscritti;
  if (a.pending && !a.name) {
    return (
      <div
        className="card"
        style={{ padding: 12, boxShadow: "none", border: "1px dashed var(--warning)", background: "var(--warning-bg)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--warning-fg)" }}>{t.collectTitle}</span>
          {onRemove && (
            <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove}>
              <Icon name="trash" size={11} />
            </button>
          )}
        </div>
        <input
          className="input"
          placeholder={t.namePlaceholder}
          value={a.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ marginBottom: 6 }}
        />
        <input
          className="input"
          type="email"
          placeholder={t.emailPlaceholder}
          value={a.email}
          onChange={(e) => onChange({ email: e.target.value })}
          style={{ marginBottom: 6 }}
        />
        <input
          className="input"
          placeholder={t.phonePlaceholder}
          value={a.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onChange({ pending: false, confirmed: true })}
            disabled={!a.name}
          >
            <Icon name="check" size={11} />
            {t.confirmParticipant}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="card"
      style={{ padding: 12, boxShadow: "none", border: `1px solid ${a.confirmed ? "var(--border)" : "var(--warning)"}` }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {a.isBuyer ? <Badge tone="indigo">{t.theBuyer}</Badge> : <Badge tone="neutral">{t.participant}</Badge>}
          {a.confirmed ? (
            <Badge tone="success" dot>
              {t.confirmedTag}
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              {t.toConfirm}
            </Badge>
          )}
        </div>
        {onRemove && !a.isBuyer && (
          <button className="btn btn-icon btn-sm btn-ghost" onClick={onRemove}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
      <PersonForm
        person={{ name: a.name, email: a.email, phone: a.phone, hasWA: a.hasWA }}
        onChange={onChange}
        typoName={a.typoName}
        typoEmail={a.typoEmail}
      />
      {!a.confirmed && a.name && (
        <button
          className="btn btn-sm btn-primary"
          style={{ marginTop: 10, width: "100%" }}
          onClick={() => onChange({ confirmed: true })}
        >
          <Icon name="check" size={11} />
          {t.markConfirmed}
        </button>
      )}
    </div>
  );
}
