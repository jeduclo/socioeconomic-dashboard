import type { Metadata } from "next";
import Link from "next/link";
import Glance from "@/components/Glance";
import IndicatorIndex from "@/components/IndicatorIndex";

export const metadata: Metadata = { title: "Social conditions" };

export default function Social() {
  return (
    <>
      <section className="hero">
        <h1>Social conditions in Canada</h1>
        <p>
          Food insecurity, poverty, inequality, housing costs and homelessness, from Statistics Canada, CMHC, the
          National Shelter Study and Food Banks Canada. Most of these figures are published once a year, a year or more
          after the period they describe. Each page explains what is measured and what is left out.
        </p>
      </section>
      <Glance
        label="Social conditions at a glance"
        tiles={[
          { id: "food", label: "People in food-insecure households", match: { region: "Canada", status: "Food insecure", group: "All persons" }, show: "latest" },
          { id: "poverty", label: "Poverty rate (official line)", shard: "Market basket measure, 2018 base", match: { region: "Canada", group: "All persons" }, show: "latest" },
          { id: "shelteruse", label: "People who used an emergency shelter", shard: "People who used an emergency shelter", match: { group: "All shelter users" }, show: "latest" },
          { id: "foodbanks", label: "Food bank visits in March", match: { region: "Canada" }, show: "millions" },
        ]}
      />
      <h2 className="section-h">Indicators</h2>
      <IndicatorIndex section="social" />
      <p><Link href="/downloads/">See every dataset and download it in one place</Link></p>
    </>
  );
}
