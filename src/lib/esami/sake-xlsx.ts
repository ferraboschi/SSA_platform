import "server-only";

// Builds the per-course "Sake" workbook: one flat, SEARCHABLE table of every
// sake across every day. Unlike attendance-xlsx (which omits it), this sheet
// enables Excel's AutoFilter on the header row so the operator can filter/search
// each column ("Alt+click" the funnel) — the whole point of a real .xlsx over a
// mislabeled CSV.
import ExcelJS from "exceljs";

export interface SakeXlsxDay {
  day: number;
  sakes: { name: string; qty?: number; code?: string }[];
}

const HEADERS = ["Giorno", "Nome sake", "Quantità", "Codice"];

export async function buildSakeXlsx(days: SakeXlsxDay[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SSA Platform";
  const ws = wb.addWorksheet("Sake");

  const header = ws.addRow(HEADERS);
  header.font = { bold: true };

  for (const d of days) {
    for (const sk of d.sakes) {
      ws.addRow([d.day, sk.name, sk.qty ?? "", sk.code ?? ""]);
    }
  }

  // The searchable filter: Excel AutoFilter over the four header cells.
  ws.autoFilter = { from: "A1", to: "D1" };

  // Sensible column widths.
  const widths = [10, 40, 12, 16];
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 16;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
