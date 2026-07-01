"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { format, useT } from "@/lib/i18n";
import { linkCreditoAction, setCreditoStatoAction } from "@/lib/crediti/actions";

export type CreditoStato = "aperto" | "applicato" | "rimborsato" | "annullato";

export interface CreditoView {
  id: number;
  corsistaId: number;
  corsistaName: string;
  amount: number;
  corsoOrigineId: number | null;
  corsoOrigineTitle: string | null;
  corsoDestinazioneId: number | null;
  corsoDestinazioneTitle: string | null;
  stato: CreditoStato;
  nota: string | null;
}

export interface CourseOption {
  id: number;
  title: string;
  when: string;
}

export interface EnrollmentOption {
  id: number;
  corsistaId: number;
  name: string;
  net: number;
}

const STATE_TONE: Record<CreditoStato, { fg: string; bg: string }> = {
  aperto: { fg: "var(--warning-fg)", bg: "var(--warning-bg)" },
  applicato: { fg: "var(--success-fg)", bg: "var(--success-bg)" },
  rimborsato: { fg: "var(--text-3)", bg: "var(--surface-2)" },
  annullato: { fg: "var(--text-3)", bg: "var(--surface-2)" },
};

function euro(n: number): string {
  return `${Math.round(n).toLocaleString("it-IT")}€`;
}

export function CreditiClient({
  credits,
  courseOptions,
  enrollmentsByCourse,
}: {
  credits: CreditoView[];
  courseOptions: CourseOption[];
  enrollmentsByCourse: Record<number, EnrollmentOption[]>;
}) {
  const t = useT().crediti;
  const [pending, startTransition] = useTransition();
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

  const link = (
    credito: CreditoView,
    corsoId: number,
    iscrId: number,
    corsoTitle: string,
  ) => {
    setOv(credito.id, {
      stato: "applicato",
      corsoDestinazioneId: corsoId,
      corsoDestinazioneTitle: corsoTitle,
    });
    startTransition(async () => {
      try {
        await linkCreditoAction(credito.id, corsoId, iscrId);
      } catch {
        clearOv(credito.id);
      }
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
            extra={open.length > 0 ? format(t.totalOpen, { v: Math.round(totalOpen) }) : undefined}
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
                enrollmentsByCourse={enrollmentsByCourse}
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

function OpenCard({
  credito,
  t,
  pending,
  courseOptions,
  enrollmentsByCourse,
  onLink,
  onStato,
}: {
  credito: CreditoView;
  t: TDict;
  pending: boolean;
  courseOptions: CourseOption[];
  enrollmentsByCourse: Record<number, EnrollmentOption[]>;
  onLink: (c: CreditoView, corsoId: number, iscrId: number, title: string) => void;
  onStato: (c: CreditoView, stato: "rimborsato" | "annullato" | "aperto") => void;
}) {
  const [picking, setPicking] = useState(false);
  const [courseId, setCourseId] = useState<number | "">("");
  const [iscrId, setIscrId] = useState<number | "">("");

  const enrollments = useMemo(
    () => (courseId === "" ? [] : enrollmentsByCourse[courseId] ?? []),
    [courseId, enrollmentsByCourse],
  );

  const submit = () => {
    if (courseId === "" || iscrId === "") return;
    const title = courseOptions.find((c) => c.id === courseId)?.title ?? `Corso ${courseId}`;
    onLink(credito, courseId, iscrId, title);
    setPicking(false);
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
          <select
            className="select"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value === "" ? "" : Number(e.target.value));
              setIscrId("");
            }}
            style={{ minWidth: 200, height: 26, fontSize: 12 }}
          >
            <option value="">{t.pickCourse}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.when ? ` · ${c.when}` : ""}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={iscrId}
            onChange={(e) => setIscrId(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={courseId === "" || enrollments.length === 0}
            style={{ minWidth: 200, height: 26, fontSize: 12 }}
          >
            <option value="">{t.pickEnrollment}</option>
            {enrollments.map((en) => (
              <option key={en.id} value={en.id}>
                {en.name} · {euro(en.net)}
              </option>
            ))}
          </select>

          <button
            className="btn btn-sm btn-primary"
            disabled={pending || courseId === "" || iscrId === ""}
            onClick={submit}
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
    </div>
  );
}
