import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export interface CrumbsProps {
  items: Crumb[];
}

export function Crumbs({ items }: CrumbsProps) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span
          key={i}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {i > 0 && <span className="sep">/</span>}
          {it.href ? (
            <Link href={it.href}>{it.label}</Link>
          ) : (
            <span className="current">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
