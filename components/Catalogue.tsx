"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { INDICATORS } from "@/lib/indicators";
import { dataUrl, fmtBytes, fmtDate, loadMeta, type Meta } from "@/lib/data";

export default function Catalogue() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { loadMeta().then(setMeta).catch((e) => setErr(String(e.message || e))); }, []);
  if (err) return <div className="banner" role="alert">{err}</div>;
  if (!meta) return <p>Loading…</p>;
  return (
    <section className="card">
      <p className="note">Last rebuilt {new Date(meta.generated_at).toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short" })}</p>
      <div className="table-wrap">
        <table className="catalogue">
          <thead>
            <tr><th>Dataset</th><th>Columns</th><th className="num">Rows</th><th>Coverage</th><th>CSV</th><th>Excel</th></tr>
          </thead>
          <tbody>
            {INDICATORS.map((i) => {
              const d = meta.datasets[i.id];
              if (!d) return null;
              return (
                <tr key={i.id}>
                  <td>
                    <Link href={`/${i.id}/`} className="title">{i.name}</Link>
                    <div className="sub">{d.title}. {d.source}</div>
                  </td>
                  <td className="sub">{d.columns.join(", ")}</td>
                  <td className="num">{d.rows.toLocaleString("en-CA")}</td>
                  <td>{fmtDate(d.start, d.freq)} to {fmtDate(d.end, d.freq)}</td>
                  <td><a href={dataUrl(d.downloads.csv.file)} download>CSV ({fmtBytes(d.downloads.csv.bytes)})</a></td>
                  <td><a href={dataUrl(d.downloads.xlsx.file)} download>Excel ({fmtBytes(d.downloads.xlsx.bytes)})</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
