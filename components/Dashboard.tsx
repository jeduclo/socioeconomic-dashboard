"use client";
import { useEffect, useMemo, useState } from "react";
import { byId, type Interval } from "@/lib/indicators";
import {
  clip, fmtDate, loadMeta, loadShard, periodsPerYear, resample, resolveOption,
  type DatasetMeta, type Series,
} from "@/lib/data";
import { buildRows } from "@/lib/export";
import { ChartCard, type ChartCtx, type Plotted } from "./Charts";
import Kpis from "./Kpis";
import MultiSelect, { MAX_SERIES } from "./MultiSelect";
import { DataTable, DownloadSlip } from "./DataPanels";

const INTERVAL_LABEL: Record<Interval, string> = {
  all: "As published", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};
const PRESETS: [string, number | null][] = [["1Y", 1], ["5Y", 5], ["10Y", 10], ["20Y", 20], ["Max", null]];
const DEFAULT_FROM = "2010-01-01";
const toT = (d: string) => Date.parse(d + "T00:00:00Z");
const color = (slot: number) => `var(--s${slot + 1})`;

export default function Dashboard({ id }: { id: string }) {
  const ind = byId(id);
  const multi = ind.filters.find((f) => f.multi)!;
  const singlesAll = ind.filters.filter((f) => !f.multi);

  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  // single-choice filters whose column exists in this build (some social tables have optional columns)
  const singlesSpec = singlesAll.filter((f) => !meta || meta.dims.includes(f.dim));
  const [error, setError] = useState("");
  const [shardChoice, setShardChoice] = useState<string | null>(null);
  const [singles, setSingles] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<{ id: string; slot: number }[] | null>(null); // null = use defaults
  const [series, setSeries] = useState<Series[] | null>(null);
  const [interval, setIv] = useState<Interval>("all");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>("");

  useEffect(() => {
    loadMeta()
      .then((m) => {
        const d = m.datasets[id];
        if (!d) return setError(`The ${ind.name} dataset is missing from this build. Re-run the data script.`);
        setMeta(d);
        if (ind.fullRange) setFrom(d.start);
      })
      .catch((e) => setError(String(e.message || e)));
  }, [id, ind.name, ind.fullRange]);

  // ----- resolve the data file (shard) -----
  const shardValues = meta?.shards.map((s) => s.value ?? "") ?? [];
  const shardValue = ind.shard && meta
    ? (shardChoice && shardValues.includes(shardChoice) ? shardChoice : resolveOption(shardValues, ind.shard.default as string) ?? null)
    : null;
  const shardInfo = meta?.shards.find((s) => (ind.shard ? s.value === shardValue : true));

  useEffect(() => {
    if (!shardInfo) return;
    let live = true;
    setSeries(null);
    loadShard(shardInfo.file).then((s) => live && setSeries(s)).catch((e) => live && setError(String(e.message || e)));
    return () => { live = false; };
  }, [shardInfo?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- resolve filters against the options in this file -----
  const opts = shardInfo?.options ?? {};
  const effSingles = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of singlesSpec) {
      const o = opts[f.dim] ?? [];
      out[f.dim] = o.includes(singles[f.dim]) ? singles[f.dim] : resolveOption(o, f.default as string) ?? "";
    }
    return out;
  }, [opts, singles]); // eslint-disable-line react-hooks/exhaustive-deps

  const multiOptions = opts[multi.dim] ?? [];
  const selected = useMemo(() => {
    if (picked) return picked.filter((p) => multiOptions.includes(p.id));
    const defs = (multi.default as string[]).map((d) => resolveOption(multiOptions, d)).filter(Boolean) as string[];
    return Array.from(new Set(defs)).map((id, slot) => ({ id, slot }));
  }, [picked, multiOptions, multi.default]);

  function toggle(option: string) {
    const cur = selected;
    if (cur.some((p) => p.id === option)) return setPicked(cur.filter((p) => p.id !== option));
    if (cur.length >= MAX_SERIES) return;
    const used = new Set(cur.map((p) => p.slot));
    const slot = [...Array(MAX_SERIES).keys()].find((s) => !used.has(s))!; // colours stay with their series
    setPicked([...cur, { id: option, slot }]);
  }

  // ----- series for the current view -----
  const matches = (s: Series, except?: string) =>
    singlesSpec.every((f) => f.dim === except || s.key[f.dim] === effSingles[f.dim]);

  const rs = (s: Series): Series => ({ key: s.key, points: resample(s.points, interval) });

  const plotted: Plotted[] = useMemo(() => {
    if (!series) return [];
    return selected.flatMap((p) => {
      const s = series.find((x) => x.key[multi.dim] === p.id && matches(x));
      return s ? [{ id: p.id, color: color(p.slot), series: rs(s) }] : [];
    });
  }, [series, selected, effSingles, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  const endDate = to ?? meta?.end ?? "2100-01-01";
  const tFrom = toT(from), tTo = toT(endDate);
  const unit = shardInfo?.unit ?? "";
  const freq = interval === "all" ? (meta?.freq ?? "M") : ({ weekly: "D", monthly: "M", quarterly: "Q", yearly: "A" } as const)[interval];

  const ctx: ChartCtx = useMemo(() => {
    const needsPool = ind.charts.some((c) => c.kind === "latestYoyAll" || c.kind === "latestAll");
    const acrossDim = ind.charts.find((c) => c.kind === "latestAcross")?.dim;
    const primary = plotted[0]?.id;
    return {
      selected: plotted,
      pool: needsPool && series ? series.filter((s) => matches(s)).map((s) => ({ label: s.key[multi.dim], points: resample(s.points, interval) })) : [],
      across: acrossDim && series && primary
        ? series.filter((s) => s.key[multi.dim] === primary && matches(s, acrossDim))
            .map((s) => ({ label: s.key[acrossDim], points: resample(s.points, interval), isCurrent: s.key[acrossDim] === effSingles[acrossDim] }))
        : [],
      from: tFrom, to: tTo, ppy: periodsPerYear(meta?.freq ?? "M", interval), freq, unit, rate: !!ind.rate,
    };
  }, [plotted, series, tFrom, tTo, interval, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => (meta ? buildRows(meta, shardValue, unit, plotted.map((p) => ({ key: p.series.key, points: clip(p.series.points, tFrom, tTo) }))) : []),
    [meta, plotted, tFrom, tTo, shardValue, unit],
  );

  function applyPreset(label: string, years: number | null) {
    if (!meta) return;
    setPreset(label);
    setTo(null);
    if (years === null) return setFrom(meta.start);
    const end = new Date(toT(meta.end));
    end.setUTCFullYear(end.getUTCFullYear() - years);
    setFrom(end.toISOString().slice(0, 10));
  }

  const filterSummary: [string, string][] = [
    ...Object.entries(meta?.fixed ?? {}),
    ...(ind.shard && shardValue ? [[ind.shard.label, shardValue] as [string, string]] : []),
    ...singlesSpec.map((f) => [f.label, effSingles[f.dim]] as [string, string]),
    [multi.label, selected.map((s) => s.id).join("; ") || "None"],
    ["Interval", INTERVAL_LABEL[interval]],
  ];
  const rangeLabel = `${fmtDate(from, meta?.freq === "A" ? "A" : "M")} to ${fmtDate(endDate, meta?.freq === "A" ? "A" : "M")}`;
  const presets = PRESETS.filter(([l]) => !(meta?.freq === "A" && l === "1Y"));

  if (error) return <div className="banner" role="alert">{error}</div>;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{ind.name}</h1>
          <p>{ind.tagline}</p>
        </div>
        {meta && (
          <div className="source">
            {meta.source}
            <br />Latest data: {fmtDate(meta.end, meta.freq)}
          </div>
        )}
      </header>

      <form className="filters" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
        {ind.shard && (
          <label className="field">
            <span>{ind.shard.label}</span>
            <select value={shardValue ?? ""} onChange={(e) => setShardChoice(e.target.value)}>
              {shardValues.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        )}
        {singlesSpec.map((f) => (
          <label className="field" key={f.dim}>
            <span>{f.label}</span>
            <select value={effSingles[f.dim]} onChange={(e) => setSingles({ ...singles, [f.dim]: e.target.value })}>
              {(opts[f.dim] ?? []).map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <MultiSelect label={multi.label} options={multiOptions} value={selected.map((s) => s.id)} onToggle={toggle} onClear={() => setPicked([])} />
        <label className="field">
          <span>From</span>
          <input type="date" value={from} min={meta?.start} max={endDate} onChange={(e) => { setPreset(""); e.target.value && setFrom(e.target.value); }} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={endDate} min={from} max={meta?.end} onChange={(e) => { setPreset(""); e.target.value && setTo(e.target.value); }} />
        </label>
        <div className="field">
          <span>Range</span>
          <div className="presets">
            {presets.map(([l, y]) => (
              <button type="button" key={l} className="chip" aria-pressed={preset === l} onClick={() => applyPreset(l, y)}>{l}</button>
            ))}
          </div>
        </div>
        {ind.intervals.length > 1 && <label className="field">
          <span>Interval</span>
          <select value={interval} onChange={(e) => setIv(e.target.value as Interval)}>
            {ind.intervals.map((i) => <option key={i} value={i}>{INTERVAL_LABEL[i]}</option>)}
          </select>
        </label>}
      </form>

      {selected.length > 0 && (
        <ul className="selected-series" aria-label="Series shown">
          {selected.map((s) => (
            <li key={s.id}>
              <span className="sw" style={{ background: color(s.slot) }} />
              {s.id}
              <button type="button" aria-label={`Remove ${s.id}`} onClick={() => toggle(s.id)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <Kpis kinds={ind.kpis} points={series ? plotted[0]?.series.points ?? [] : null} name={plotted[0]?.id ?? ""}
        from={tFrom} to={tTo} unit={unit} freq={freq} rate={!!ind.rate} />

      <div className="charts">
        {ind.charts.map((c) => (
          series ? <ChartCard key={c.kind + c.title} spec={c} ctx={ctx} />
            : <section className="card" key={c.title}><h3>{c.title}</h3><div className="empty">Loading…</div></section>
        ))}
      </div>

      <div className="lower">
        <DataTable columns={meta?.columns ?? []} rows={rows} value={meta?.value ?? "value"} />
        {meta && <DownloadSlip id={id} meta={meta} rows={rows} filters={filterSummary} range={rangeLabel} />}
      </div>

      <section className="card about" aria-label={`About ${ind.name}`}>
        <div>
          <h3>What it measures</h3>
          <p>{ind.about.what}</p>
          {unit && <p>Unit: {unit}.</p>}
        </div>
        <div>
          <h3>Why it matters</h3>
          <ul>{ind.about.why.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
        <div>
          <h3>Reading the charts</h3>
          <ul>{ind.about.reading.map((w) => <li key={w}>{w}</li>)}</ul>
          {meta?.fixed && Object.keys(meta.fixed).length > 0 && (
            <p className="fineprint">
              Also selected from the source table: {Object.entries(meta.fixed).map(([k, v]) => `${k}: ${v}`).join("; ")}.
            </p>
          )}
          {meta?.sources && (
            <p className="fineprint">
              Sources: {meta.sources.map((u, i) => (
                <span key={u}>{i > 0 && ", "}<a href={u} target="_blank" rel="noreferrer">{new URL(u).hostname.replace(/^www\./, "")}</a></span>
              ))}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
