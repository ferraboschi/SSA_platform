export function CourseStat({
  label,
  value,
  sub,
  bar,
  barTone,
  tone,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  bar?: number;
  barTone?: string;
  tone?: "success" | "danger";
  last?: boolean;
}) {
  return (
    <div style={{ padding: "16px 22px", borderRight: last ? "none" : "1px solid var(--border-2)" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          letterSpacing: "var(--ls-caps)",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color:
            tone === "success"
              ? "var(--success-fg)"
              : tone === "danger"
                ? "var(--danger-fg)"
                : "var(--text)",
        }}
      >
        {value}
      </div>
      {bar !== undefined && (
        <div className={`bar ${barTone ?? ""}`} style={{ marginTop: 10 }}>
          <i style={{ width: `${Math.min(bar * 100, 100)}%` }} />
        </div>
      )}
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}
