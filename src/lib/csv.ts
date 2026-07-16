// Tiny CSV helpers for client-side "export" buttons. Excel-friendly (UTF-8 BOM,
// CRLF, quoted fields).

type Cell = string | number | null | undefined;

export function toCsv(headers: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    let s = v == null ? "" : String(v);
    // Formula-injection guard (OWASP): text cells starting with =, +, -, @,
    // tab or CR would execute in Excel. Buyer names/titles come from public
    // Shopify checkout, so they are attacker-controlled. Numbers stay intact.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Trigger a browser download of a CSV string. Client-only. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
