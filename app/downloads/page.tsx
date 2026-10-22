import type { Metadata } from "next";
import Catalogue from "@/components/Catalogue";

export const metadata: Metadata = { title: "All datasets" };

export default function Downloads() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>All datasets</h1>
          <p>
            Every dataset behind this site, cleaned and in long format: one row per date and series. Files are rebuilt
            from the source automatically, so the newest release is always here.
          </p>
        </div>
      </header>
      <Catalogue />
    </>
  );
}
