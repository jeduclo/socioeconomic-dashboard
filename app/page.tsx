import Link from "next/link";
import Glance from "@/components/Glance";
import IndicatorIndex from "@/components/IndicatorIndex";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>How Canada&apos;s economy is doing, in the numbers</h1>
        <p>
          Thirteen economic indicators from Statistics Canada and the markets, refreshed automatically. Explore each one
          with charts, then download the clean data as CSV or Excel for your own analysis.
        </p>
      </section>
      <Glance
        label="The economy at a glance"
        tiles={[
          { id: "gdp", label: "Real GDP growth, year on year", match: { component: "Gross domestic product at market prices" }, show: "yoy" },
          { id: "cpi", label: "CPI inflation, 12-month", shard: "Canada", match: { product: "All-items" }, show: "yoy" },
          { id: "lm", label: "Unemployment rate", shard: "Canada", match: { indicator: "Unemployment rate", sex: "Total", age_group: "15 years and over" }, show: "latest" },
          { id: "pop", label: "Population", match: { region: "Canada" }, show: "millions" },
        ]}
      />
      <h2 className="section-h">Economic indicators</h2>
      <IndicatorIndex section="economy" />
      <aside className="crosslink">
        <h2 className="section-h">Social conditions</h2>
        <p>Food insecurity, poverty, inequality, rents and homelessness in Canada.</p>
        <p><Link href="/social/">Go to Social conditions</Link></p>
      </aside>
      <p><Link href="/downloads/">See every dataset and download it in one place</Link></p>
    </>
  );
}
