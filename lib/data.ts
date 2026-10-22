import type { Interval } from "./indicators";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const dataUrl = (file: string) => `${BASE}/data/${file}`;

// ---------- files written by scripts/build_data.py ----------

export interface ShardInfo {
  value: string | null;
  file: string;
  unit: string;
  options: Record<string, string[]>;
}
export interface DatasetMeta {
  title: string;
  source: string;
  rows: number;
  start: string;
  end: string;
  freq: "D" | "M" | "Q" | "A";
  columns: string[];
  value: string;
  dims: string[];
  shard: string | null;
  shards: ShardInfo[];
  downloads: { csv: { file: string; bytes: number }; xlsx: { file: string; bytes: number } };
  fixed?: Record<string, string>; // category columns fixed to one value (social tables)
  sources?: string[]; // report links (hand-entered data)
  section?: string;
}
export interface Meta {
  generated_at: string;
  sample: boolean;
  datasets: Record<string, DatasetMeta>;
}
interface RawSeries {
  key: Record<string, string>;
  start: number;
  values: (number | null)[];
  extra?: Record<string, (number | null)[]>;
}
export interface ShardFile {
  unit: string;
  freq: string;
  dates: string[];
  series: RawSeries[];
}

export interface Point {
  t: number; // epoch ms
  d: string; // YYYY-MM-DD
  v: number;
  extra?: Record<string, number | null>;
}
export interface Series {
  key: Record<string, string>;
  points: Point[];
}

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(dataUrl(file)).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${file} (HTTP ${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return cache.get(file) as Promise<T>;
}

export const loadMeta = () => getJson<Meta>("meta.json");

export async function loadShard(file: string): Promise<Series[]> {
  const raw = await getJson<ShardFile>(file);
  const ts = raw.dates.map((d) => Date.parse(d + "T00:00:00Z"));
  return raw.series.map((s) => {
    const points: Point[] = [];
    s.values.forEach((v, i) => {
      if (v === null) return;
      const j = s.start + i;
      const p: Point = { t: ts[j], d: raw.dates[j], v };
      if (s.extra) {
        p.extra = {};
        for (const k of Object.keys(s.extra)) p.extra[k] = s.extra[k][i];
      }
      points.push(p);
    });
    return { key: s.key, points };
  });
}

// ---------- time-series maths ----------

const YEAR = 365.25 * 86400000;
const DAY = 86400000;

function periodKey(d: string, interval: Interval): string {
  const y = d.slice(0, 4);
  const m = +d.slice(5, 7);
  if (interval === "monthly") return d.slice(0, 7);
  if (interval === "quarterly") return `${y}Q${Math.ceil(m / 3)}`;
  if (interval === "yearly") return y;
  if (interval === "weekly") {
    const t = Date.parse(d + "T00:00:00Z");
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    return String(t - dow * DAY);
  }
  return d;
}

/** Same rule as the Shiny app: keep the last observation in each period. */
export function resample(points: Point[], interval: Interval): Point[] {
  if (interval === "all") return points;
  const out: Point[] = [];
  let lastKey = "";
  for (const p of points) {
    const k = periodKey(p.d, interval);
    if (k === lastKey) out[out.length - 1] = p;
    else out.push(p);
    lastKey = k;
  }
  return out;
}

/** Index of the last point on or before t (binary search). */
function lastAtOrBefore(points: Point[], t: number): number {
  let lo = 0, hi = points.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Value one year earlier (same month/quarter; nearest earlier trading day for daily data). */
export function yearAgo(points: Point[], i: number): Point | null {
  const target = Date.parse(`${+points[i].d.slice(0, 4) - 1}${points[i].d.slice(4)}T00:00:00Z`) || points[i].t - YEAR;
  const j = lastAtOrBefore(points, target + DAY / 2);
  if (j < 0 || target - points[j].t > 6 * DAY) return null;
  return points[j];
}

/** % change from b to a; undefined when the value changes sign (e.g. a balance going negative). */
export const pct = (a: number, b: number) =>
  b !== 0 && ((b > 0 && a >= 0) || (b < 0 && a <= 0)) ? ((a - b) / Math.abs(b)) * 100 : NaN;

export type Transform = "level" | "yoy" | "pop" | "diff" | "yoyDiff" | "rollingYear" | "rebased" | "drawdown";

export function periodsPerYear(freq: string, interval: Interval): number {
  if (interval === "yearly") return 1;
  if (interval === "quarterly") return 4;
  if (interval === "monthly") return 12;
  if (interval === "weekly") return 52;
  return freq === "Q" ? 4 : freq === "A" ? 1 : freq === "D" ? 252 : 12;
}

/**
 * Apply a transform. `points` is the full resampled history so that year-ago
 * comparisons work at the start of the selected range; `from`/`to` clip the result.
 */
export function transform(points: Point[], kind: Transform, from: number, to: number, ppy: number): Point[] {
  const out: Point[] = [];
  let first: number | null = null;
  let peak = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.t > to) break;
    let v: number = NaN;
    switch (kind) {
      case "level": v = p.v; break;
      case "pop": if (i > 0) v = pct(p.v, points[i - 1].v); break;
      case "diff": if (i > 0) v = p.v - points[i - 1].v; break;
      case "yoy": { const q = yearAgo(points, i); if (q) v = pct(p.v, q.v); break; }
      case "yoyDiff": { const q = yearAgo(points, i); if (q) v = p.v - q.v; break; }
      case "rollingYear":
        if (i >= ppy - 1) { v = 0; for (let k = i - ppy + 1; k <= i; k++) v += points[k].v; }
        break;
      case "rebased":
        if (p.t >= from) { if (first === null) first = p.v; v = first ? (p.v / first) * 100 : NaN; }
        break;
      case "drawdown":
        if (p.t >= from) { peak = Math.max(peak, p.v); v = (p.v / peak - 1) * 100; }
        break;
    }
    if (p.t >= from && Number.isFinite(v)) out.push({ t: p.t, d: p.d, v });
  }
  return out;
}

export function clip(points: Point[], from: number, to: number) {
  return points.filter((p) => p.t >= from && p.t <= to);
}

// ---------- formatting ----------

const nf = (max: number, min = 0) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: max, minimumFractionDigits: min });
const compact = new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 2 });

export function fmtValue(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (/percent/i.test(unit)) return nf(1, 1).format(v) + "%";
  if (/^(current )?dollars$/i.test(unit.trim())) return (v < 0 ? "-$" : "$") + nf(a >= 1000 ? 0 : 2).format(a);
  if (a >= 1e7) return compact.format(v);
  if (a >= 1000) return nf(0).format(v);
  if (a >= 10) return nf(1).format(v);
  if (a > 0 && a < 1) return nf(3).format(v); // e.g. Gini coefficients
  return nf(2).format(v);
}
export const fmtAxis = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e4) return compact.format(v);
  if (a === 0) return "0";
  return nf(a < 0.1 ? 3 : a < 1 ? 2 : a < 10 ? 1 : 0).format(v);
};
export const fmtPct = (v: number | null | undefined, sign = true) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : (sign && v > 0 ? "+" : "") + nf(1, 1).format(v) + "%";
export const fmtPts = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : (v > 0 ? "+" : "") + nf(1, 1).format(v) + " pts";
export const fmtSigned = (v: number | null | undefined, unit = "") =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : (v > 0 ? "+" : "") + fmtValue(v, unit);

export function fmtDate(d: string, freq: string): string {
  const [y, m] = d.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1];
  if (freq === "Q") return `${y} Q${Math.ceil(+m / 3)}`;
  if (freq === "A") return y;
  if (freq === "D") return `${mon} ${+d.slice(8)}, ${y}`;
  return `${mon} ${y}`;
}

export const fmtBytes = (b: number) =>
  b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

/** Pick a default option even if StatCan renamed it slightly. */
export function resolveOption(options: string[], wanted: string): string | undefined {
  if (!options.length) return undefined;
  if (options.includes(wanted)) return wanted;
  const w = wanted.toLowerCase();
  return (
    options.find((o) => o.toLowerCase().startsWith(w)) ||
    options.find((o) => o.toLowerCase().includes(w)) ||
    options.find((o) => w.includes(o.toLowerCase())) ||
    options.find((o) => /total|all/i.test(o)) ||
    options[0]
  );
}
