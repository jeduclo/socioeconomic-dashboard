"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export const MAX_SERIES = 8;

interface Props {
  label: string;
  options: string[];
  value: string[];
  onToggle: (option: string) => void;
  onClear: () => void;
}

/** Searchable checkbox list; handles hundreds of options (e.g. CPI products). */
export default function MultiSelect({ label, options, value, onToggle, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.toLowerCase().includes(s)) : options;
  }, [q, options]);
  const full = value.length >= MAX_SERIES;

  return (
    <div className="field ms" ref={ref}>
      <span id={id}>{label}</span>
      <button type="button" className="ms-trigger" aria-labelledby={id} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="txt">{value.length === 0 ? "Choose…" : value.length === 1 ? value[0] : `${value.length} selected`}</span>
        <span className="count">▾</span>
      </button>
      {open && (
        <div className="ms-pop" role="dialog" aria-label={label}>
          <input autoFocus placeholder={`Search ${options.length} options`} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="ms-list">
            {shown.map((o) => {
              const checked = value.includes(o);
              return (
                <li key={o}>
                  <label>
                    <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => onToggle(o)} />
                    <span>{o}</span>
                  </label>
                </li>
              );
            })}
            {!shown.length && <li className="ms-foot">No option matches “{q}”.</li>}
          </ul>
          <div className="ms-foot">
            <span>{full ? `Up to ${MAX_SERIES} at a time` : `${value.length} of ${MAX_SERIES} max`}</span>
            <button type="button" onClick={onClear}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
