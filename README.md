# Economic Indicators

Next.js + Recharts site with two sections:

- **Economy**: 13 indicators (the original Shiny dashboard).
- **Social conditions** (`/social/`): food insecurity, food bank visits, poverty, income inequality, rents,
  rental vacancy, shelter capacity and shelter use.

Each indicator has four KPIs, four charts, a data table, and CSV/Excel downloads.

## Where things live

| File | What it does |
|---|---|
| `scripts/build_data.py` | Download, clean, write chart data and downloads |
| `scripts/social.py` | Social-conditions tables (StatCan, read by column role) and hand-entered data |
| `data/manual/` | Hand-entered report figures (shelter use, food banks), with a source on every row. See its README. |
| `lib/indicators.ts` | Filters, defaults, charts, KPIs and About text for each indicator |
| `components/Dashboard.tsx` | The indicator page |
| `components/Charts.tsx` | The Recharts charts |
| `scripts/vercel_build.sh` | What Vercel runs to build data + site |
| `.github/workflows/refresh.yml` | Weekday trigger for a fresh Vercel build |

To add an indicator: add it to `STATCAN` in the Python script and to `INDICATORS` in `lib/indicators.ts` with the same id.

## Updating the hand-entered data

Shelter use and food bank figures come from reports, not tables. Once a year, add rows to the CSVs in
`data/manual/` (same columns, include the `source` link), then commit and push. See `data/manual/README.md`.
