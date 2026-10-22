import Link from "next/link";
import { INDICATORS, groupsIn, sectionOf, type Section } from "@/lib/indicators";

export default function IndicatorIndex({ section }: { section: Section }) {
  return (
    <div className="index">
      {groupsIn(section).map((g) => (
        <div className="index-group" key={g}>
          <h3>{g}</h3>
          {INDICATORS.filter((i) => sectionOf(i) === section && i.group === g).map((i) => (
            <Link key={i.id} href={`/${i.id}/`}>
              <b>{i.name}</b>
              <span>{i.tagline}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
