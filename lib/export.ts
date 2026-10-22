import type { DatasetMeta, Series } from "./data";

export type Row = Record<string, string | number | null>;

/** Long-format rows with exactly the same columns as the complete download. */
export function buildRows(meta: DatasetMeta, shardValue: string | null, unit: string, series: Series[]): Row[] {
  const rows: Row[] = [];
  for (const s of series) {
    for (const p of s.points) {
      const r: Row = {};
      for (const c of meta.columns) {
        if (c === "date") r[c] = p.d;
        else if (c === meta.value) r[c] = p.v;
        else if (c === "unit") r[c] = unit;
        else if (meta.shard && c === meta.shard) r[c] = shardValue;
        else if (c in s.key) r[c] = s.key[c];
        else r[c] = p.extra?.[c] ?? null;
      }
      rows.push(r);
    }
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Row[]): Blob {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  // BOM so Excel opens accented region names correctly
  return new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
}

export async function toXlsx(columns: string[], rows: Row[], about: [string, string][]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Economic Indicators dashboard";

  const ws = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c, key: c, width: c === "date" ? 12 : Math.min(40, Math.max(12, c.length + 4)) }));
  for (const r of rows) {
    const row: Record<string, unknown> = { ...r };
    if (typeof r.date === "string") row.date = new Date(r.date + "T00:00:00Z");
    ws.addRow(row);
  }
  ws.getColumn("date").numFmt = "yyyy-mm-dd";
  ws.getRow(1).font = { bold: true };

  const info = wb.addWorksheet("About");
  info.columns = [{ header: "Field", key: "f", width: 22 }, { header: "Value", key: "v", width: 90 }];
  about.forEach(([f, v]) => info.addRow({ f, v }));
  info.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
