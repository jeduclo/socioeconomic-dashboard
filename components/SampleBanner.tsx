"use client";
import { useEffect, useState } from "react";
import { loadMeta } from "@/lib/data";

/** Shown only when the site was built with `--sample` data. */
export default function SampleBanner() {
  const [sample, setSample] = useState(false);
  useEffect(() => { loadMeta().then((m) => setSample(m.sample)).catch(() => {}); }, []);
  if (!sample) return null;
  return (
    <div className="banner" role="status">
      These are synthetic sample numbers for testing the layout. Run <code>python scripts/build_data.py</code> to load real
      Statistics Canada and market data.
    </div>
  );
}
