"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { INDICATORS, SECTIONS, groupsIn, sectionOf } from "@/lib/indicators";

export default function Sidebar() {
  const path = usePathname().replace(/\/$/, "");
  const [open, setOpen] = useState(false);
  const cur = (href: string) => (path === href.replace(/\/$/, "") ? "page" : undefined);
  return (
    <aside className={`side${open ? " open" : ""}`}>
      <Link href="/" className="brand" onClick={() => setOpen(false)}>
        <b>Economic Indicators</b>
        <span>Canada, from Statistics Canada</span>
      </Link>
      <p className="byline">Site created by Jean Alegue, PhD</p>
      <button className="menu-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Close" : "Menu"}
      </button>
      <nav aria-label="Indicators" onClick={() => setOpen(false)}>
        {SECTIONS.map((s) => (
          <div key={s.id} className="nav-section">
            <Link href={s.home} className="nav-section-title" aria-current={cur(s.home)}>{s.name}</Link>
            {groupsIn(s.id).map((g) => (
              <div key={g}>
                <h2>{g}</h2>
                {INDICATORS.filter((i) => sectionOf(i) === s.id && i.group === g).map((i) => (
                  <Link key={i.id} href={`/${i.id}/`} aria-current={cur(`/${i.id}`)}>{i.name}</Link>
                ))}
              </div>
            ))}
          </div>
        ))}
        <Link href="/downloads/" className="dl-link" aria-current={cur("/downloads")}>All datasets (CSV, Excel)</Link>
      </nav>
    </aside>
  );
}
