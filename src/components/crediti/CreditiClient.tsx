"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import { formatEuro } from "@/lib/format";
import { spendCreditOnCourseAction, setCreditoStatoAction } from "@/lib/crediti/actions";

export type CreditoStato = "aperto" | "applicato" | "rimborsato" | "annullato";

export interface CreditoView {
  id: number;
  corsistaId: number;
  corsistaName: string;
  amount: number;
  corsoOrigineId: number | null;
  corsoOrigineTitle: string | null;
  /** Level (`corsi.type`) of the origin course — the destination picker offers
   *  only courses of the SAME level (null = unknown → no filter). */
  origineType: string | null;
  corsoDestinazioneId: number | null;
  corsoDestinazioneTitle: string | null;
  stato: CreditoStato;
  nota: string | null;
  /** One-time redemption code to hand to the credit's owner (null pre-migration). */
  codice: string | null;
  /** Shopify GID of the auto-created discount, or null when the code isn't yet a
   *  live Shopify discount (pre-scope / API error / created manually). */
  shopifyDiscountId: string | null;
}

export interface CourseOption {
  id: number;
  title: string;
  when: string;
  /** Course level (`corsi.type`) — matched against a credit's origin level. */
  type: string | null;
  /** Live occupancy for the capacity counter/block at credit-spend time. */
  enrolled: number;
  /** Shopify-seeded max seats (0 = unknown → no block). */
  capacity: number;
}

const STATE_TONE: Record<CreditoStato, { fg: string; bg: string }> = {
  aperto: { fg: "var(--warning-fg)", bg: "var(--warning-bg)" },
  applicato: { fg: "var(--success-fg)", bg: "var(--success-bg)" },
  rimborsato: { fg: "var(--text-3)", bg: "var(--surface-2)" },
  annullato: { fg: "var(--text-3)", bg: "var(--surface-2)" },
};

function euro(n: number): string {
  return formatEuro(Math.round(n));
}

export function CreditiClient({
  credits,
  courseOptions,
}: {
  credits: CreditoView[];
  courseOptions: CourseOption[];
}) {
  const t = useT().crediti;
  const [pending, startTransition] = useTransition();
  // After a successful spend that occupied a new seat: the "close a seat on
  // Shopify" reminder to show (dismissable). Also carries link-time errors.
  const [reminder, setReminder] = useState<{ text: string; url: string; label: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Optimistic overrides keyed by credit id (so a linked/closed credit re-buckets
  // without a full round-trip). null value = revert-on-error handled inside.
  const [override, setOverride] = useState<Map<number, Partial<CreditoView>>>(
    () => new Map(),
  );

  const applied = (c: CreditoView): CreditoView => ({ ...c, ...override.get(c.id) });

  const all = credits.map(applied);
  const open = all.filter((c) => c.stato === "aperto");
  const app = all.filter((c) => c.stato === "applicato");
  const closed = all.filter((c) => c.stato === "rimborsato" || c.stato === "annullato");

  const totalOpen = open.reduce((s, c) => s + c.amount, 0);

  const setOv = (id: number, patch: Partial<CreditoView>) =>
    setOverride((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), ...patch });
      return next;
    });
  const clearOv = (id: number) =>
    setOverride((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

  const link = (credito: CreditoView, corsoId: number, corsoTitle: string) => {
    setLinkError(null);
    setReminder(null);
    setOv(credito.id, {
      stato: "applicato",
      corsoDestinazioneId: corsoId,
      corsoDestinazioneTitle: corsoTitle,
    });
    startTransition(async () => {
      const res = await spendCreditOnCourseAction(credito.id, corsoId).catch(
        () => ({ ok: false, error: "Operazione non riuscita." }) as Awaited<ReturnType<typeof spendCreditOnCourseAction>>,
      );
      if (!res.ok) {
        clearOv(credito.id); // revert the optimistic move
        setLinkError(res.error || "Operazione non riuscita.");
        return;
      }
      if (res.reminder) setReminder(res.reminder);
    });
  };

  const setStato = (credito: CreditoView, stato: "rimborsato" | "annullato" | "aperto") => {
    // Every one of these transitions leaves 'applicato', so the destination is
    // always cleared (mirrors the server action's unlink).
    setOv(credito.id, { stato, corsoDestinazioneId: null, corsoDestinazioneTitle: null });
    startTransition(async () => {
      try {
        await setCreditoStatoAction(credito.id, stato);
      } catch {
        clearOv(credito.id);
      }
    });
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 6 }}>
        <h1 className="display" style={{ fontSize: 28 }}>
          {t.title}
        </h1>
        <p className="text-3" style={{ fontSize: 13, marginTop: 6, maxWidth: 720 }}>
          {t.subtitle}
        </p>
      </div>

      {linkError && (
        <div
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            background: "var(--danger-bg)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger)",
            borderRadius: 10,
            fontSize: 12.5,
          }}
          role="alert"
        >
          {linkError}
        </div>
      )}
      {reminder && (
        <div
          style={{
            margin: "12px 0",
            padding: "12px 14px",
            background: "var(--warning-bg)",
            color: "var(--warning-fg)",
            border: "1px solid var(--warning)",
            borderRadius: 10,
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warn" size={14} /> {reminder.text}
          </span>
          <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link className="btn btn-sm" href={reminder.url} target="_blank" rel="noreferrer">
              {reminder.label}
            </Link>
            <button className="btn btn-sm" onClick={() => setReminder(null)}>
              OK
            </button>
          </span>
        </div>
      )}

      {all.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--text-3)", marginTop: 20 }}
        >
          {t.empty}
        </div>
      ) : (
        <>
          <Section
            title={t.openTitle}
            subtitle={t.openSubtitle}
            count={format(t.openCount, { n: open.length })}
            extra={open.length > 0 ? format(t.totalOpen, { v: formatEuro(Math.round(totalOpen)) }) : undefined}
            emptyLabel={t.empty}
            items={open}
          >
            {open.map((c) => (
              <OpenCard
                key={c.id}
                credito={c}
                t={t}
                pending={pending}
                courseOptions={courseOptions}
                onLink={link}
                onStato={setStato}
              />
            ))}
          </Section>

          <Section
            title={t.appliedTitle}
            subtitle={t.appliedSubtitle}
            count={format(t.appliedCount, { n: app.length })}
            emptyLabel={t.empty}
            items={app}
          >
            {app.map((c) => (
              <ClosedCard key={c.id} credito={c} t={t} pending={pending} onStato={setStato} />
            ))}
          </Section>

          <Section
            title={t.closedTitle}
            subtitle={t.closedSubtitle}
            count={format(t.closedCount, { n: closed.length })}
            emptyLabel={t.empty}
            items={closed}
          >
            {closed.map((c) => (
              <ClosedCard key={c.id} credito={c} t={t} pending={pending} onStato={setStato} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

type TDict = ReturnType<typeof useT>["crediti"];

function Section({
  title,
  subtitle,
  count,
  extra,
  emptyLabel,
  items,
  children,
}: {
  title: string;
  subtitle: string;
  count: string;
  extra?: string;
  emptyLabel: string;
  items: CreditoView[];
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
      <p className="text-3" style={{ fontSize: 12.5, marginTop: 4, maxWidth: 700 }}>
        {subtitle}
      </p>
      <div
        style={{
          margin: "12px 0",
          fontSize: 13,
          color: "var(--text-2)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <span>{count}</span>
        {extra && <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{extra}</span>}
      </div>
      {items.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", color: "var(--text-3)" }}
        >
          {emptyLabel}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      )}
    </div>
  );
}

function StatePill({ stato, t }: { stato: CreditoStato; t: TDict }) {
  const tone = STATE_TONE[stato];
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: tone.fg,
        background: tone.bg,
        padding: "1px 8px",
        borderRadius: 999,
      }}
    >
      {t.states[stato]}
    </span>
  );
}

function CardHead({
  credito,
  t,
  children,
}: {
  credito: CreditoView;
  t: TDict;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{credito.corsistaName}</div>
      <span
        className="num"
        style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}
      >
        {euro(credito.amount)}
      </span>
      <StatePill stato={credito.stato} t={t} />
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

function OriginDest({ credito, t }: { credito: CreditoView; t: TDict }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        color: "var(--text-2)",
      }}
    >
      <span className="text-4" style={{ fontSize: 11 }}>
        {t.from}
      </span>
      {credito.corsoOrigineId != null ? (
        <Link href={`/corsi/${credito.corsoOrigineId}`} className="link">
          {credito.corsoOrigineTitle}
        </Link>
      ) : (
        <span className="text-3">—</span>
      )}
      <span style={{ color: "var(--text-4)" }}>{t.to}</span>
      {credito.corsoDestinazioneId != null ? (
        <Link href={`/corsi/${credito.corsoDestinazioneId}`} className="link">
          {credito.corsoDestinazioneTitle}
        </Link>
      ) : (
        <span className="text-4" style={{ fontStyle: "italic" }}>
          {t.noDestination}
        </span>
      )}
    </div>
  );
}

/** The one-time redemption code for an active credit — copied to the owner, who
 *  enters it as the Shopify discount code; the sync then auto-closes the credit.
 *  When the code has been created as a live Shopify discount we show a success
 *  chip; otherwise a muted hint that it still needs creating on Shopify. */
function CodeRow({
  codice,
  shopifyDiscountId,
  t,
}: {
  codice: string;
  shopifyDiscountId: string | null;
  t: TDict;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codice);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is on screen to copy by hand */
    }
  };
  return (
    <div
      style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}
    >
      <span className="text-4" style={{ fontSize: 11 }}>
        {t.codeLabel}
      </span>
      <code
        className="mono"
        style={{
          fontWeight: 700,
          letterSpacing: ".08em",
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          borderRadius: 6,
          padding: "2px 8px",
        }}
      >
        {codice}
      </code>
      <button className="btn btn-sm" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} size={12} />
        {copied ? t.codeCopied : t.codeCopy}
      </button>
      {shopifyDiscountId ? (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: "var(--success-fg)",
            background: "var(--success-bg)",
            padding: "1px 8px",
            borderRadius: 999,
          }}
        >
          {t.codeLive}
        </span>
      ) : (
        <span className="text-4" style={{ fontSize: 11, fontStyle: "italic" }}>
          {t.codeManual}
        </span>
      )}
      <span className="text-4" style={{ fontSize: 11 }}>
        {t.codeHint}
      </span>
    </div>
  );
}

function OpenCard({
  credito,
  t,
  pending,
  courseOptions,
  onLink,
  onStato,
}: {
  credito: CreditoView;
  t: TDict;
  pending: boolean;
  courseOptions: CourseOption[];
  onLink: (c: CreditoView, corsoId: number, title: string) => void;
  onStato: (c: CreditoView, stato: "rimborsato" | "annullato" | "aperto") => void;
}) {
  const [picking, setPicking] = useState(false);
  const [courseId, setCourseId] = useState<number | "">("");

  // A credit is redeemable only on a SAME-LEVEL course (owner). Offer just those;
  // when the origin level is unknown (pre-migration / legacy) fall back to every
  // candidate so nothing becomes un-linkable.
  const sameLevelOptions = useMemo(
    () =>
      credito.origineType
        ? courseOptions.filter((c) => c.type === credito.origineType)
        : courseOptions,
    [courseOptions, credito.origineType],
  );

  const chosen = courseId === "" ? null : courseOptions.find((c) => c.id === courseId) ?? null;
  // Full only when the max is known (capacity > 0) and reached. The person may
  // already occupy a seat there → the server reuses it (no capacity change), so
  // "full" is a soft warning, not a hard client block on that case.
  const isFull = !!chosen && chosen.capacity > 0 && chosen.enrolled >= chosen.capacity;

  const submit = () => {
    if (courseId === "") return;
    const title = courseOptions.find((c) => c.id === courseId)?.title ?? `Corso ${courseId}`;
    onLink(credito, courseId, title);
    setPicking(false);
    setCourseId("");
  };

  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <CardHead credito={credito} t={t}>
        {!picking && (
          <button
            className="btn btn-sm btn-primary"
            disabled={pending}
            onClick={() => setPicking(true)}
          >
            <Icon name="arrow" size={12} /> {t.link}
          </button>
        )}
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => onStato(credito, "rimborsato")}
        >
          {t.markRefunded}
        </button>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => onStato(credito, "annullato")}
        >
          {t.markVoided}
        </button>
      </CardHead>

      <OriginDest credito={credito} t={t} />

      {credito.codice && (
        <CodeRow codice={credito.codice} shopifyDiscountId={credito.shopifyDiscountId} t={t} />
      )}

      {picking && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* Pick ONLY the course — the credit follows its own person: the server
              reuses/revives/creates that person's seat. */}
          <select
            className="select"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ minWidth: 260, height: 26, fontSize: 12 }}
          >
            <option value="">{t.pickCourse}</option>
            {sameLevelOptions.map((c) => {
              const full = c.capacity > 0 && c.enrolled >= c.capacity;
              const occ = c.capacity > 0 ? ` · ${c.enrolled}/${c.capacity}${full ? " pieno" : ""}` : "";
              return (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.when ? ` · ${c.when}` : ""}
                  {occ}
                </option>
              );
            })}
          </select>

          {chosen && chosen.capacity > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isFull ? "var(--danger-fg)" : "var(--text-3)",
              }}
            >
              {chosen.enrolled}/{chosen.capacity} posti{isFull ? " · pieno" : ""}
            </span>
          )}

          <button
            className="btn btn-sm btn-primary"
            disabled={pending || courseId === "" || isFull}
            onClick={submit}
            title={isFull ? "Corso pieno: libera un posto o aumenta la capienza su Shopify." : undefined}
          >
            <Icon name="check" size={12} /> {t.linkCta}
          </button>
          <button className="btn btn-sm" disabled={pending} onClick={() => setPicking(false)}>
            {t.cancel}
          </button>
        </div>
      )}
    </div>
  );
}

/** Card for a non-open credit (applicato / rimborsato / annullato). The single
 *  action reopens it (→ 'aperto'): for an applied credit that unlinks the
 *  destination (revenue stops being recognised there); for a closed one it
 *  returns the credit to the pool. */
function ClosedCard({
  credito,
  t,
  pending,
  onStato,
}: {
  credito: CreditoView;
  t: TDict;
  pending: boolean;
  onStato: (c: CreditoView, stato: "rimborsato" | "annullato" | "aperto") => void;
}) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <CardHead credito={credito} t={t}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => onStato(credito, "aperto")}
        >
          {t.unlink}
        </button>
      </CardHead>
      <OriginDest credito={credito} t={t} />
      {credito.codice && (
        // Traceability: keep the ISSUED code visible on a used/closed credit so a
        // staff member can tie a Shopify redemption (code) back to its destination
        // course (the → link in OriginDest above). Read-only here — already spent.
        <div
          style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}
        >
          <span className="text-4" style={{ fontSize: 11 }}>
            {t.codeLabel}
          </span>
          <code
            className="mono"
            style={{
              fontWeight: 600,
              letterSpacing: ".06em",
              background: "var(--surface-2)",
              border: "1px solid var(--border-2)",
              borderRadius: 5,
              padding: "1px 6px",
            }}
          >
            {credito.codice}
          </code>
        </div>
      )}
    </div>
  );
}
