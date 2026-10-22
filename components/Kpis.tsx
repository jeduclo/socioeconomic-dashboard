"use client";
import type { KpiKind } from "@/lib/indicators";
import { clip, fmtDate, fmtPct, fmtPts, fmtSigned, fmtValue, pct, yearAgo, type Point } from "@/lib/data";

interface Tile { label: string; value: string; sub: string; dir?: number }

export function computeKpi(kind: KpiKind, all: Point[], from: number, to: number, unit: string, freq: string, rate: boolean): Tile {
  const inRange = clip(all, from, to);
  const histTo = all.filter((p) => p.t <= to);
  const last = histTo[histTo.length - 1];
  const prev = histTo[histTo.length - 2];
  const none = { value: "–", sub: "Not enough data" };
  const change = (a: number, b: number) => (rate ? a - b : pct(a, b));
  const fmtChange = (v: number) => (rate ? fmtPts(v) : fmtPct(v));

  switch (kind) {
    case "latest":
      return { label: "Latest", ...(last ? { value: fmtValue(last.v, unit), sub: fmtDate(last.d, freq) } : none) };
    case "pop":
    case "popDiff": {
      const label = freq === "Q" ? "vs previous quarter" : freq === "D" ? "vs previous day" : freq === "A" ? "vs previous year" : "vs previous month";
      if (!last || !prev) return { label: `Change ${label}`, ...none };
      const v = kind === "pop" ? change(last.v, prev.v) : last.v - prev.v;
      return { label: `Change ${label}`, value: kind === "pop" ? fmtChange(v) : rate ? fmtPts(v) : fmtSigned(v, unit), sub: `From ${fmtValue(prev.v, unit)}`, dir: Math.sign(v) };
    }
    case "yoy":
    case "yoyDiff": {
      const q = last ? yearAgo(histTo, histTo.length - 1) : null;
      if (!last || !q) return { label: "Change vs a year earlier", ...none };
      const v = kind === "yoy" ? change(last.v, q.v) : last.v - q.v;
      return { label: "Change vs a year earlier", value: kind === "yoy" ? fmtChange(v) : rate ? fmtPts(v) : fmtSigned(v, unit), sub: `${fmtDate(q.d, freq)}: ${fmtValue(q.v, unit)}`, dir: Math.sign(v) };
    }
    case "high": {
      if (!inRange.length) return { label: "High in range", ...none };
      const h = inRange.reduce((m, p) => (p.v > m.v ? p : m));
      return { label: "High in range", value: fmtValue(h.v, unit), sub: fmtDate(h.d, freq) };
    }
    case "avg5": {
      if (!last) return { label: "5-year average", ...none };
      const w = histTo.filter((p) => p.t > last.t - 5 * 365.25 * 86400000);
      const avg = w.reduce((s, p) => s + p.v, 0) / w.length;
      return { label: "5-year average", value: fmtValue(avg, unit), sub: `To ${fmtDate(last.d, freq)}` };
    }
    case "periodReturn": {
      if (inRange.length < 2) return { label: "Change over range", ...none };
      const v = pct(inRange[inRange.length - 1].v, inRange[0].v);
      return { label: "Change over range", value: fmtPct(v), sub: `Since ${fmtDate(inRange[0].d, freq)}`, dir: Math.sign(v) };
    }
    case "drawdown": {
      if (!inRange.length) return { label: "Below range high", ...none };
      const h = Math.max(...inRange.map((p) => p.v));
      const v = (inRange[inRange.length - 1].v / h - 1) * 100;
      return { label: "Below range high", value: fmtPct(v), sub: v === 0 ? "At its high" : `High ${fmtValue(h, unit)}` };
    }
  }
}

export default function Kpis({ kinds, points, name, ...rest }: {
  kinds: KpiKind[]; points: Point[] | null; name: string; from: number; to: number; unit: string; freq: string; rate: boolean;
}) {
  return (
    <section className="kpis" aria-label={`Key figures for ${name}`}>
      {kinds.map((k) => {
        const t = points ? computeKpi(k, points, rest.from, rest.to, rest.unit, rest.freq, rest.rate) : { label: "", value: "…", sub: "" };
        return (
          <div className="kpi" key={k}>
            <div className="label">{t.label}</div>
            <div className="value">
              {t.dir ? <span aria-hidden="true" style={{ fontSize: "0.6em", marginRight: 4, verticalAlign: "0.15em" }}>{t.dir > 0 ? "▲" : "▼"}</span> : null}
              {t.value}
            </div>
            <div className="sub" title={name}>{t.sub}</div>
          </div>
        );
      })}
    </section>
  );
}
