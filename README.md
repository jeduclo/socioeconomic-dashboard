# Economic Indicators

Next.js + Recharts site with two sections:

- **Economy**: 13 indicators (the original Shiny dashboard).
- **Social conditions** (`/social/`): food insecurity, food bank visits, poverty, income inequality, rents,
  rental vacancy, shelter capacity and shelter use.

Each indicator has four KPIs, four charts, a data table, and CSV/Excel downloads.

## Why it no longer crashes

The Shiny app built every download on one small server, so a class downloading at once ran it out of memory.
Here **nothing runs on a server**:

- `scripts/build_data.py` (the Python port of `global.R`) downloads and cleans every table **ahead of time**
  and writes the complete datasets as static `.csv` and `.xlsx` files.
- The site is a static export (`out/`), served from a CDN. Hundreds of simultaneous downloads are just file requests.
- "Your selection" downloads are built in each student's browser.

## Run it locally

```bash
pip install -r requirements.txt
python scripts/build_data.py          # real data (needs internet, about 5-10 minutes)
#   or: python scripts/build_data.py --sample   (synthetic data, offline, for layout work)
npm install
npm run dev                           # http://localhost:3000
```

## Deploy to Vercel

Full step-by-step guide for Windows + VS Code: **[DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)**.

In short: push to GitHub, import the repo in Vercel (settings come from `vercel.json`), then add a deploy hook
so `.github/workflows/refresh.yml` rebuilds the data every weekday morning.

## What changed from the R version

- Same StatCan tables and filters as `global.R`. One fix: GDP picks the newest "Chained (YYYY) dollars"
  automatically, so a StatCan rebase won't break it.
- Market data is downloaded once per build (from 2000) instead of on every chart view.
- Retail columns are now `date, region, industry, value` (were `retail_*`), and every dataset gains a `unit` column.
- Duplicate rows for the same date and series are averaged, as the Shiny charts did.
- Charts show history from 1980 (markets from 2000); the complete-dataset files contain everything.

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
