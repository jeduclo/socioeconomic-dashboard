"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate, fmtPct, fmtValue, loadMeta, loadShard, pct, resolveOption, yearAgo, type Point } from "@/lib/data";

export interface TileSpec {
  id: string; // dataset
  label: string;
  shard?: string; // preferred shard value
  match: Record<string, string>; // preferred value per dimension
  show: "latest" | "yoy" | "millions";
}
interface Tile { href: string; label: string; value: string; sub: string }

async function headline(spec: TileSpec): Promise<{ points: Point[]; unit: string; freq: string } | null> {
  const meta = (await loadMeta()).datasets[spec.id];
  if (!meta) return null;
  const shard = spec.shard
    ? meta.shards.find((s) => s.value === resolveOption(meta.shards.map((x) => x.value ?? ""), spec.shard!))
    : meta.shards[0];
  if (!shard) return null;
  const series = await loadShard(shard.file);
  const want = Object.fromEntries(Object.entries(spec.match).map(([k, v]) => [k, resolveOption(shard.options[k] ?? [], v)]));
  const s = series.find((x) => Object.entries(want).every(([k, v]) => x.key[k] === v));
  return s ? { points: s.points, unit: shard.unit, freq: meta.freq } : null;
}

function toTile(spec: TileSpec, h: Awaited<ReturnType<typeof headline>>): Tile | null {
  if (!h || !h.points.length) return null;
  const i = h.points.length - 1, last = h.points[i];
  const href = `/${spec.id}/`;
  if (spec.show === "yoy") {
    const q = yearAgo(h.points, i);
    return { href, label: spec.label, value: fmtPct(q ? pct(last.v, q.v) : NaN), sub: fmtDate(last.d, h.freq) };
  }
  if (spec.show === "millions") return { href, label: spec.label, value: (last.v / 1e6).toFixed(2) + " million", sub: fmtDate(last.d, h.freq) };
  return { href, label: spec.label, value: fmtValue(last.v, h.unit), sub: fmtDate(last.d, h.freq) };
}

export default function Glance({ tiles: specs, label }: { tiles: TileSpec[]; label: string }) {
  const [tiles, setTiles] = useState<(Tile | null | undefined)[]>(specs.map(() => undefined));
  useEffect(() => {
    Promise.all(specs.map((s) => headline(s).then((h) => toTile(s, h)).catch(() => null))).then(setTiles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="glance" aria-label={label}>
      {tiles.map((t, i) =>
        t ? (
          <Link key={t.href + i} href={t.href} className="kpi">
            <div className="label">{t.label}</div>
            <div className="value">{t.value}</div>
            <div className="sub">{t.sub}</div>
          </Link>
        ) : (
          <div key={i} className="kpi">
            <div className="label">{specs[i].label}</div>
            <div className="value">{t === undefined ? "…" : "–"}</div>
            <div className="sub">{t === null ? "Not available in this build" : " "}</div>
          </div>
        ),
      )}
    </section>
  );
}
