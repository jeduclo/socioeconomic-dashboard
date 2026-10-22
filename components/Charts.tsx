"use client";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/indicators";
import {
  clip, fmtAxis, fmtDate, fmtPct, fmtPts, fmtValue, pct, transform, yearAgo,
  type Point, type Series, type Transform,
} from "@/lib/data";

export interface Plotted {
  id: string; // the option value (e.g. "All-items")
  color: string;
  series: Series; // resampled, full history
}

export interface ChartCtx {
  selected: Plotted[];
  pool: { label: string; points: Point[] }[]; // every option of the series dimension (for latestYoyAll)
  across: { label: string; points: Point[]; isCurrent: boolean }[]; // for latestAcross
  from: number;
  to: number;
  ppy: number;
  freq: string; // display frequency for dates
  unit: string;
  rate: boolean;
}

const short = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const LINE_KINDS: Transform[] = ["level", "yoy", "pop", "diff", "yoyDiff", "rollingYear", "rebased", "drawdown"];

function valueFormatter(kind: string, ctx: ChartCtx): (v: number) => string {
  if (["yoy", "pop", "drawdown", "periodReturn", "latestYoyAll"].includes(kind)) return (v) => fmtPct(v);
  if (kind === "yoyDiff" && ctx.rate) return (v) => fmtPts(v);
  if (kind === "rebased") return (v) => fmtValue(v);
  return (v) => fmtValue(v, ctx.unit);
}

function timeTicks(from: number, to: number): number[] {
  const y0 = new Date(from).getUTCFullYear(), y1 = new Date(to).getUTCFullYear();
  const span = y1 - y0;
  if (span >= 2) {
    const step = [1, 2, 5, 10, 20].find((s) => span / s <= 7) ?? 20;
    const out: number[] = [];
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t >= from && t <= to) out.push(t);
    }
    return out;
  }
  const out: number[] = [];
  const d = new Date(from);
  let m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  const step = span >= 1 ? 3 : 2;
  while (Date.UTC(y, m, 1) <= to) {
    if ((m % step) === 0) out.push(Date.UTC(y, m, 1));
    m++; if (m === 12) { m = 0; y++; }
  }
  return out;
}
const tickLabel = (t: number, from: number, to: number) => {
  const d = new Date(t);
  return to - from > 2 * 365 * 86400000
    ? String(d.getUTCFullYear())
    : d.toLocaleString("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" });
};

function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label} title={i.label}><span className="sw" style={{ background: i.color }} /><span>{i.label}</span></li>
      ))}
    </ul>
  );
}

function TimeTip({ active, payload, label, fmt, freq, names }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label).toISOString().slice(0, 10);
  return (
    <div className="tip">
      <b>{fmtDate(d, freq)}</b>
      {payload
        .filter((p: any) => p.value !== undefined && p.value !== null)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <div key={p.dataKey}>
            <span className="sw" style={{ background: p.color || p.fill }} />
            <span>{names[p.dataKey] ?? p.dataKey}</span>
            <span>{fmt(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

function BarTip({ active, payload, fmt, sub }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <b>{p.label}</b>
      <div><span>{sub(p)}</span><span>{fmt(p.v)}</span></div>
    </div>
  );
}

function TimeChart({ spec, ctx }: { spec: ChartSpec; ctx: ChartCtx }) {
  const kind = spec.kind as Transform;
  const fmt = valueFormatter(kind, ctx);
  const lines = ctx.selected.map((s, i) => ({
    key: `s${i}`, id: s.id, color: s.color,
    pts: transform(s.series.points, kind, ctx.from, ctx.to, ctx.ppy),
  }));
  const rows = new Map<number, Record<string, number>>();
  for (const l of lines) for (const p of l.pts) {
    const r = rows.get(p.t) ?? { t: p.t };
    r[l.key] = p.v;
    rows.set(p.t, r);
  }
  const data = Array.from(rows.values()).sort((a, b) => a.t - b.t);
  if (!data.length) return <div className="empty">No values for this view. Try a longer date range.</div>;

  const names = Object.fromEntries(lines.map((l) => [l.key, l.id]));
  const asBars = (kind === "pop" || kind === "diff") && lines.length === 1 && data.length <= 130;
  const t0 = data[0].t, t1 = data[data.length - 1].t;
  const ticks = timeTicks(t0, t1);
  const zeroLine = kind !== "level" && kind !== "rollingYear" ? <ReferenceLine y={kind === "rebased" ? 100 : 0} stroke="var(--rule-strong)" /> : null;
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="t" type="number" scale="time" domain={[t0, t1]} ticks={ticks}
        tickFormatter={(t) => tickLabel(t, t0, t1)} tickLine={false} axisLine={{ stroke: "var(--rule-strong)" }} minTickGap={16} />
      <YAxis tickFormatter={kind === "level" || kind === "rollingYear" || kind === "diff" || kind === "rebased" || (kind === "yoyDiff")
        ? fmtAxis : (v) => `${fmtAxis(v)}%`} width={56} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
      <Tooltip content={<TimeTip fmt={fmt} freq={ctx.freq} names={names} />} cursor={{ stroke: "var(--ink-2)", strokeDasharray: "3 3" }} />
      {zeroLine}
    </>
  );
  return (
    <>
      <Legend items={lines.map((l) => ({ label: l.id, color: l.color }))} />
      <div className="plot">
        <ResponsiveContainer>
          {asBars ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
              {axes}
              <Bar dataKey="s0" fill={lines[0].color} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {axes}
              {lines.map((l) => (
                <Line key={l.key} dataKey={l.key} stroke={l.color} strokeWidth={2} dot={false} connectNulls
                  isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );
}

interface BarDatum { label: string; v: number; color: string; d: string }

function RankChart({ spec, ctx }: { spec: ChartSpec; ctx: ChartCtx }) {
  const neutral = "var(--bar-neutral)";
  let data: BarDatum[] = [];
  let note = "";
  const lastIn = (pts: Point[]) => { const c = clip(pts, ctx.from, ctx.to); return c[c.length - 1]; };

  if (spec.kind === "latest") {
    data = ctx.selected.flatMap((s) => { const p = lastIn(s.series.points); return p ? [{ label: s.id, v: p.v, color: s.color, d: p.d }] : []; });
  } else if (spec.kind === "periodReturn") {
    data = ctx.selected.flatMap((s) => {
      const c = clip(s.series.points, ctx.from, ctx.to);
      return c.length > 1 ? [{ label: s.id, v: pct(c[c.length - 1].v, c[0].v), color: s.color, d: c[c.length - 1].d }] : [];
    });
  } else if (spec.kind === "latestYoyAll") {
    const colorOf = new Map(ctx.selected.map((s) => [s.id, s.color]));
    data = ctx.pool.flatMap((s) => {
      const c = s.points.filter((p) => p.t <= ctx.to);
      if (!c.length) return [];
      const q = yearAgo(c, c.length - 1);
      const v = q ? pct(c[c.length - 1].v, q.v) : NaN;
      return Number.isFinite(v) ? [{ label: s.label, v, color: colorOf.get(s.label) ?? neutral, d: c[c.length - 1].d }] : [];
    });
    // compare like with like: only series reporting at the most recent date
    const latest = data.reduce((m, x) => (x.d > m ? x.d : m), "");
    data = data.filter((x) => x.d === latest);
    if (data.length > 15) {
      const sorted = [...data].sort((a, b) => b.v - a.v);
      const keep = new Set([...sorted.slice(0, 8), ...sorted.slice(-7), ...sorted.filter((x) => x.color !== neutral)]);
      note = `Highest and lowest of ${data.length}, plus your selection`;
      data = sorted.filter((x) => keep.has(x));
    }
    if (latest) note = `${fmtDate(latest, ctx.freq)}${note ? ". " + note : ""}`;
  } else if (spec.kind === "latestAll") {
    const colorOf = new Map(ctx.selected.map((s) => [s.id, s.color]));
    data = ctx.pool.flatMap((s) => {
      const c = s.points.filter((p) => p.t <= ctx.to);
      const p = c[c.length - 1];
      return p ? [{ label: s.label, v: p.v, color: colorOf.get(s.label) ?? neutral, d: p.d }] : [];
    });
    const latest = data.reduce((m, x) => (x.d > m ? x.d : m), "");
    data = data.filter((x) => x.d === latest);
    if (data.length > 15) {
      const sorted = [...data].sort((a, b) => b.v - a.v);
      const keep = new Set([...sorted.slice(0, 8), ...sorted.slice(-7), ...sorted.filter((x) => x.color !== neutral)]);
      note = `Highest and lowest of ${data.length}, plus your selection`;
      data = sorted.filter((x) => keep.has(x));
    }
    if (latest) note = `${fmtDate(latest, ctx.freq)}${note ? ". " + note : ""}`;
  } else if (spec.kind === "latestAcross") {
    const color = ctx.selected[0]?.color ?? neutral;
    data = ctx.across.flatMap((s) => { const p = lastIn(s.points); return p ? [{ label: s.label, v: p.v, color: s.isCurrent ? color : neutral, d: p.d }] : []; });
  }
  data.sort((a, b) => b.v - a.v);
  if (!data.length) return <div className="empty">No values for this view.</div>;
  if (spec.kind === "latestAll" && data.length < 2)
    return <div className="empty">This measure has no breakdown. Pick another measure above to compare groups.</div>;

  const fmt = valueFormatter(spec.kind, ctx);
  const height = Math.max(200, data.length * 26 + 30);
  const hasNeg = data.some((d) => d.v < 0);
  const latestDate = data.reduce((m, x) => (x.d > m ? x.d : m), "");
  return (
    <>
      {(note || spec.kind === "latest" || spec.kind === "latestAcross") && (
        <p className="note">{note || `Most recent: ${fmtDate(latestDate, ctx.freq)}`}</p>
      )}
      <div style={{ height, marginTop: 8 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={4}>
            <XAxis type="number" hide domain={hasNeg ? ["auto", "auto"] : [0, "auto"]} />
            <YAxis type="category" dataKey="label" width={180} tickLine={false} axisLine={false} interval={0}
              tick={({ x, y, payload }: any) => (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="var(--ink-2)">
                  <title>{payload.value}</title>{short(payload.value, 28)}
                </text>
              )} />
            <Tooltip cursor={{ fill: "var(--paper)" }} content={<BarTip fmt={fmt} sub={(p: BarDatum) => fmtDate(p.d, ctx.freq)} />} />
            {hasNeg && <ReferenceLine x={0} stroke="var(--rule-strong)" />}
            <Bar dataKey="v" radius={hasNeg ? 0 : [0, 4, 4, 0]} isAnimationActive={false} maxBarSize={22}>
              {data.map((d) => <Cell key={d.label} fill={d.color} />)}
              <LabelList dataKey="v" position="right" formatter={(v: any) => fmt(Number(v))}
                style={{ fill: "var(--ink-2)", fontSize: 12 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function ChartCard({ spec, ctx }: { spec: ChartSpec; ctx: ChartCtx }) {
  const isTime = LINE_KINDS.includes(spec.kind as Transform);
  return (
    <section className="card" aria-label={spec.title}>
      <h3>{spec.title}</h3>
      {spec.note && <p className="note">{spec.note}</p>}
      {!ctx.selected.length ? (
        <div className="empty">Choose at least one series above.</div>
      ) : isTime ? <TimeChart spec={spec} ctx={ctx} /> : <RankChart spec={spec} ctx={ctx} />}
    </section>
  );
}
