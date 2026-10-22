#!/usr/bin/env python3
"""
Build every dataset the dashboard uses.

Port of global.R: downloads Statistics Canada tables and Yahoo Finance prices,
applies the same cleaning rules, and writes:

  public/data/meta.json                     dataset catalogue (rows, dates, filter options)
  public/data/<id>/<shard>.json             compact series data the charts read
  public/data/downloads/<id>.csv / .xlsx    clean, complete datasets for students

Everything is generated ahead of time, so the website only serves static files.

Usage:
  python scripts/build_data.py            # real data (needs internet)
  python scripts/build_data.py --sample   # synthetic data with the same shape, for local UI work
  python scripts/build_data.py --only cpi gdp
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
import time
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from social import MANUAL_SETS, SOCIAL_STATCAN, read_manual, read_social_statcan, sample_social  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
DL = OUT / "downloads"

# Charts only need recent history; the "complete dataset" downloads keep everything.
WEB_START = "1980-01-01"
MARKET_START = "2000-01-01"
XLSX_MAX_ROWS = 1_000_000  # Excel's limit is 1,048,576; larger datasets are split over sheets

# --------------------------------------------------------------------------------------
# Dataset definitions (mirrors global.R)
# --------------------------------------------------------------------------------------

RETAIL_INDUSTRIES = [
    "Retail trade [44-45]",
    "Motor vehicle and parts dealers [441]",
    "Building material and garden equipment and supplies dealers [444]",
    "Food and beverage retailers [445]",
    "Furniture, home furnishings, electronics and appliances retailers [449]",
    "General merchandise retailers [455]",
    "Health and personal care retailers [456]",
    "Gasoline stations and fuel vendors [457]",
    "Clothing, clothing accessories, shoes, jewelry, luggage and leather goods retailers [458]",
    "Sporting goods, hobby, musical instrument, book, and miscellaneous retailers [459]",
]
GDP_COMPONENTS = [
    "Final consumption expenditure",
    "Gross fixed capital formation",
    "Investment in inventories",
    "Exports of goods and services",
    "Less: imports of goods and services",
    "Statistical discrepancy",
    "Gross domestic product at market prices",
    "Final domestic demand",
]

# Each StatCan dataset:
#   pid       table id without dashes
#   rename    raw column -> clean column
#   filters   raw column -> exact value, list of values, or callable(series)->mask
#   prefer    raw column -> value, applied only if the column exists (removes duplicate series)
#   dims      clean dimension columns (order = column order in downloads)
#   value     clean name of the value column
#   shard     dimension used to split the chart files (single-choice filter), or None
STATCAN = {
    "gdp": dict(
        table="36-10-0104-01",
        title="Gross domestic product, expenditure-based",
        rename={"Estimates": "component"},
        filters={
            "Seasonal adjustment": "Seasonally adjusted at annual rates",
            "Prices": "__latest_chained__",
            "UOM": "Dollars",
            "Estimates": GDP_COMPONENTS,
        },
        dims=["component"], value="value", shard=None,
    ),
    "cpi": dict(
        table="18-10-0004-01",
        title="Consumer Price Index, monthly, not seasonally adjusted",
        rename={"GEO": "region", "Products and product groups": "product"},
        filters={"UOM": "2002=100"},
        dims=["region", "product"], value="cpi", shard="region",
    ),
    "we": dict(
        table="14-10-0223-01",
        title="Average weekly earnings by industry",
        rename={"GEO": "region", "North American Industry Classification System (NAICS)": "industry"},
        filters={"Estimate": "Average weekly earnings including overtime for all employees"},
        dims=["region", "industry"], value="value", shard="region",
    ),
    "ca": dict(
        table="36-10-0018-01",
        title="Current account, quarterly",
        rename={"Receipts, payments and balances": "statistic", "Current account": "current_acct"},
        filters={},
        prefer={"Seasonal adjustment": "Seasonally adjusted"},
        dims=["statistic", "current_acct"], value="value", shard="statistic",
    ),
    "ippi": dict(
        table="18-10-0265-01",
        title="Industrial product price index, by product, monthly",
        rename={"North American Product Classification System (NAPCS)": "product"},
        filters={"UOM": "Index, 202001=100"},
        dims=["product"], value="value", shard=None,
    ),
    "lm": dict(
        table="14-10-0287-01",
        title="Labour force characteristics, monthly, seasonally adjusted",
        rename={
            "GEO": "region",
            "Labour force characteristics": "indicator",
            "Gender": "sex",
            "Sex": "sex",
            "Age group": "age_group",
        },
        filters={"Data type": "Seasonally adjusted", "Statistics": "Estimate", "UOM": "Percent"},
        dims=["region", "indicator", "sex", "age_group"], value="value", shard="region",
        recode={"sex": {"Men+": "Male", "Women+": "Female", "Total - Gender": "Total",
                        "Males": "Male", "Females": "Female", "Both sexes": "Total"}},
    ),
    "ms": dict(
        table="16-10-0047-01",
        title="Manufacturers' sales, inventories, orders and inventory to sales ratios",
        rename={"Principal statistics": "statistic",
                "North American Industry Classification System (NAICS)": "type"},
        filters={
            "Seasonal adjustment": "Seasonally adjusted",
            "North American Industry Classification System (NAICS)":
                ["Manufacturing", "Non-durable goods industries", "Durable goods industries"],
        },
        dims=["statistic", "type"], value="value", shard="statistic",
    ),
    "pop": dict(
        table="17-10-0009-01",
        title="Population estimates, quarterly",
        rename={"GEO": "region"},
        filters={"GEO": lambda s: s != "Northwest Territories including Nunavut"},
        dims=["region"], value="population", shard=None,
    ),
    "rs": dict(
        table="20-10-0056-01",
        title="Monthly retail trade sales by province and territory",
        rename={"GEO": "region", "North American Industry Classification System (NAICS)": "industry"},
        filters={
            "Adjustments": "Seasonally adjusted",
            "Sales": "Total retail sales",
            "North American Industry Classification System (NAICS)": RETAIL_INDUSTRIES,
        },
        dims=["region", "industry"], value="value", shard="region",
    ),
    "trade": dict(
        table="12-10-0011-01",
        title="International merchandise trade for all countries and by principal trading partners",
        rename={"Trade": "trade", "Principal trading partners": "trading_partners"},
        filters={"Seasonal adjustment": "Seasonally adjusted", "Basis": "Balance of payments"},
        dims=["trade", "trading_partners"], value="value", shard="trade",
    ),
}

MARKETS = {
    "com": dict(
        title="Commodity futures prices",
        items={"CL=F": "Crude Oil", "NG=F": "Natural Gas", "GC=F": "Gold", "SI=F": "Silver",
               "HG=F": "Copper", "ZW=F": "Wheat", "ZC=F": "Corn", "ZS=F": "Soybeans"},
    ),
    "sec": dict(
        title="US sector ETF prices",
        items={"XLK": "Technology", "XLV": "Healthcare", "XLF": "Financials",
               "XLY": "Consumer Discretionary", "XLE": "Energy", "XLU": "Utilities",
               "XLB": "Materials", "XLI": "Industrial"},
    ),
    "stock": dict(
        title="TSX large-cap stock prices",
        items={"RY.TO": "Royal Bank of Canada", "TD.TO": "Toronto-Dominion Bank", "SHOP.TO": "Shopify",
               "ENB.TO": "Enbridge", "CNR.TO": "Canadian National Railway", "BNS.TO": "Bank of Nova Scotia",
               "BN.TO": "Brookfield Corp", "CP.TO": "Canadian Pacific Kansas City",
               "BMO.TO": "Bank of Montreal", "BCE.TO": "BCE Inc"},
    ),
}

# --------------------------------------------------------------------------------------
# StatCan download + cleaning
# --------------------------------------------------------------------------------------


class StatCanDown(RuntimeError):
    pass


_STATCAN_DOWN: str | None = None  # set once the site is known to be down, so later tables fail fast
_UA = {"User-Agent": "Mozilla/5.0 (econ-dashboard data build; +https://econindicators.ca)"}


def statcan_zip(table: str, retries: int = 3) -> bytes:
    """Download a full StatCan table as a zip. Tries the direct link, then the WDS API link."""
    global _STATCAN_DOWN
    import requests

    if _STATCAN_DOWN:
        raise StatCanDown(_STATCAN_DOWN)
    pid = table.replace("-", "")[:8]
    direct = f"https://www150.statcan.gc.ca/n1/tbl/csv/{pid}-eng.zip"
    wds = f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{pid}/en"
    problem = ""
    for attempt in range(retries):
        for how in ("direct", "wds"):
            try:
                url = direct
                if how == "wds":
                    j = requests.get(wds, timeout=60, headers=_UA)
                    url = j.json().get("object") if j.ok and j.text.lstrip().startswith("{") else None
                    if not url:
                        problem = f"WDS API answered HTTP {j.status_code} without a file link"
                        continue
                r = requests.get(url, timeout=600, headers=_UA)
                if r.ok and r.content[:2] == b"PK":
                    return r.content
                kind = r.headers.get("content-type", "?").split(";")[0]
                problem = f"got HTTP {r.status_code} {kind} instead of a zip file"
            except Exception as e:  # noqa: BLE001
                problem = str(e)
        time.sleep(10 * (attempt + 1))
    if "text/html" in problem or "WDS" in problem:
        _STATCAN_DOWN = ("Statistics Canada's website is not serving data right now (" + problem + "). "
                         "It is probably down for maintenance; try again in a few hours.")
        raise StatCanDown(_STATCAN_DOWN)
    raise RuntimeError(f"Could not download table {table}: {problem}")


def parse_ref_date(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.strip()
    out = s.where(~s.str.fullmatch(r"\d{4}-\d{2}"), s + "-01")
    out = out.where(~out.str.fullmatch(r"\d{4}"), out + "-01-01")
    return pd.to_datetime(out, errors="coerce")


def unit_label(uom: pd.Series, scalar: pd.Series) -> pd.Series:
    sc = scalar.fillna("units").astype(str).str.strip().str.lower()
    u = uom.fillna("").astype(str).str.strip()
    return np.where(sc.isin(["units", "unit", ""]), u, u + " (" + sc + ")")


def read_statcan(cfg: dict) -> pd.DataFrame:
    raw = statcan_zip(cfg["table"])
    zf = zipfile.ZipFile(io.BytesIO(raw))
    name = next(n for n in zf.namelist() if n.endswith(".csv") and "MetaData" not in n)

    filters: dict = cfg.get("filters", {})
    prefer: dict = cfg.get("prefer", {})
    needed = {"REF_DATE", "VALUE", "UOM", "SCALAR_FACTOR"} | set(cfg["rename"]) | set(filters) | set(prefer)

    with zf.open(name) as fh:
        header = pd.read_csv(fh, nrows=0, encoding="utf-8-sig").columns.tolist()
    usecols = [c for c in header if c in needed]

    # Resolve "latest chained dollars" once, from the Prices column values.
    special_prices = filters.get("Prices") == "__latest_chained__"
    chunks = []
    with zf.open(name) as fh:
        for chunk in pd.read_csv(fh, usecols=usecols, dtype=str, encoding="utf-8-sig", chunksize=500_000):
            mask = pd.Series(True, index=chunk.index)
            for col, rule in filters.items():
                if col not in chunk.columns or (col == "Prices" and special_prices):
                    continue
                if callable(rule):
                    mask &= rule(chunk[col])
                elif isinstance(rule, (list, tuple, set)):
                    mask &= chunk[col].isin(rule)
                else:
                    mask &= chunk[col] == rule
            if special_prices and "Prices" in chunk.columns:
                mask &= chunk["Prices"].str.match(r"Chained \(\d{4}\) dollars", na=False)
            chunks.append(chunk[mask])
    df = pd.concat(chunks, ignore_index=True)

    if special_prices and "Prices" in df.columns and len(df):
        years = df["Prices"].str.extract(r"\((\d{4})\)")[0].astype(int)
        df = df[years == years.max()]

    for col, val in prefer.items():
        if col in df.columns and (df[col] == val).any():
            df = df[df[col] == val]

    df = df.rename(columns=cfg["rename"])
    for col, mapping in cfg.get("recode", {}).items():
        if col in df.columns:
            df[col] = df[col].replace(mapping)

    df["date"] = parse_ref_date(df["REF_DATE"])
    df[cfg["value"]] = pd.to_numeric(df["VALUE"], errors="coerce")
    df["unit"] = unit_label(df["UOM"], df.get("SCALAR_FACTOR", pd.Series(index=df.index, dtype=str)))

    keep = ["date", *cfg["dims"], cfg["value"], "unit"]
    df = df[keep].dropna(subset=["date"])
    # One value per date and series (same as the mean() the Shiny charts applied).
    df = (df.groupby(["date", *cfg["dims"]], as_index=False, sort=False)
            .agg({cfg["value"]: "mean", "unit": "first"}))
    return df.sort_values([*cfg["dims"], "date"]).reset_index(drop=True)


# --------------------------------------------------------------------------------------
# Market data
# --------------------------------------------------------------------------------------

MARKET_DIMS = ["name", "ticker"]
MARKET_COLS = ["open", "high", "low", "close", "adjusted", "volume"]


def read_market(cfg: dict) -> pd.DataFrame:
    import yfinance as yf

    frames = []
    for ticker, label in cfg["items"].items():
        for attempt in range(3):
            try:
                h = yf.download(ticker, start=MARKET_START, auto_adjust=False, progress=False,
                                threads=False, multi_level_index=False)
                break
            except Exception:  # noqa: BLE001
                h = pd.DataFrame()
                time.sleep(3 * (attempt + 1))
        if h is None or h.empty:
            raise RuntimeError(f"No Yahoo Finance data for {ticker}")
        h = h.reset_index().rename(columns={
            "Date": "date", "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Adj Close": "adjusted", "Volume": "volume"})
        h["name"], h["ticker"] = label, ticker
        frames.append(h[["date", *MARKET_DIMS, *MARKET_COLS]])
    df = pd.concat(frames, ignore_index=True)
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()
    df["unit"] = "Price (quote currency)"
    return df.dropna(subset=["adjusted"]).sort_values(["name", "date"]).reset_index(drop=True)


# --------------------------------------------------------------------------------------
# Synthetic data (same columns and shapes) for working on the UI offline
# --------------------------------------------------------------------------------------

REGIONS = ["Canada", "Newfoundland and Labrador", "Prince Edward Island", "Nova Scotia", "New Brunswick",
           "Quebec", "Ontario", "Manitoba", "Saskatchewan", "Alberta", "British Columbia"]
SAMPLE_DIMS = {
    "gdp": {"component": GDP_COMPONENTS},
    "cpi": {"region": REGIONS, "product": [
        "All-items", "Food", "Shelter", "Household operations, furnishings and equipment",
        "Clothing and footwear", "Transportation", "Gasoline", "Health and personal care",
        "Recreation, education and reading", "Alcoholic beverages, tobacco products and recreational cannabis",
        "All-items excluding food and energy", "Energy", "Rent", "Fresh vegetables"]},
    "we": {"region": REGIONS, "industry": [
        "Industrial aggregate excluding unclassified businesses", "Goods producing industries",
        "Service producing industries", "Construction [23]", "Manufacturing [31-33]",
        "Retail trade [44-45]", "Finance and insurance [52]", "Educational services [61]",
        "Health care and social assistance [62]", "Accommodation and food services [72]"]},
    "ca": {"statistic": ["Receipts", "Payments", "Balances"], "current_acct": [
        "Current account balance", "Goods and services", "Goods", "Services",
        "Primary income", "Secondary income"]},
    "ippi": {"product": [
        "Industrial product price index, total", "Energy and petroleum products",
        "Lumber and other wood products", "Primary non-ferrous metal products", "Chemicals and chemical products",
        "Meat, fish, and dairy products", "Motorized and recreational vehicles", "Pulp and paper products",
        "Fabricated metal products and construction materials", "Plastic and rubber products"]},
    "lm": {"region": REGIONS,
           "indicator": ["Unemployment rate", "Participation rate", "Employment rate"],
           "sex": ["Total", "Male", "Female"],
           "age_group": ["15 years and over", "15 to 24 years", "25 to 54 years", "55 years and over",
                         "15 to 64 years", "25 years and over"]},
    "ms": {"statistic": ["Sales of goods manufactured (shipments)", "New orders, estimated",
                         "Inventory to sales ratio", "Unfilled orders, estimated"],
           "type": ["Manufacturing", "Non-durable goods industries", "Durable goods industries"]},
    "pop": {"region": REGIONS + ["Yukon", "Northwest Territories", "Nunavut"]},
    "rs": {"region": REGIONS, "industry": RETAIL_INDUSTRIES},
    "trade": {"trade": ["Export", "Import", "Trade Balance"],
              "trading_partners": ["All countries", "United States", "China", "United Kingdom", "Mexico",
                                   "Japan", "European Union", "South Korea"]},
}
SAMPLE_FREQ = {"gdp": "QS", "ca": "QS", "pop": "QS"}
SAMPLE_UNIT = {"gdp": "Dollars (millions)", "cpi": "2002=100", "we": "Current dollars", "ca": "Dollars (millions)",
               "ippi": "Index, 202001=100", "lm": "Percent", "ms": "Dollars (thousands)", "pop": "Persons",
               "rs": "Dollars (thousands)", "trade": "Dollars (millions)"}


def sample_statcan(key: str, cfg: dict, rng: np.random.Generator) -> pd.DataFrame:
    dims = SAMPLE_DIMS[key]
    dates = pd.date_range("1995-01-01", "2026-09-01", freq=SAMPLE_FREQ.get(key, "MS"))
    n = len(dates)
    idx = pd.MultiIndex.from_product([dims[d] for d in cfg["dims"]], names=cfg["dims"])
    rows = []
    t = np.arange(n)
    for combo in idx:
        combo = combo if isinstance(combo, tuple) else (combo,)
        h = abs(hash((key,) + combo)) % 1000 / 1000
        if key == "lm":
            base = {"Unemployment rate": 7, "Participation rate": 65, "Employment rate": 61}[combo[1]]
            v = base + 1.5 * np.sin(t / 40 + h * 6) + rng.normal(0, .25, n).cumsum() * .05 + (h - .5) * 3
            v[(dates >= "2020-04-01") & (dates <= "2020-08-01")] += 5 if base == 7 else -5
        elif key == "ca":
            sign = {"Receipts": 1, "Payments": 1, "Balances": -.15}[combo[0]]
            v = sign * (20000 + 60000 * h) * np.exp(t * .012) * (1 + rng.normal(0, .03, n))
        elif key == "trade" and combo[0] == "Trade Balance":
            v = (h - .5) * 4000 + rng.normal(0, 900, n).cumsum() * .3
        elif key == "ms" and combo[0] == "Inventory to sales ratio":
            v = 1.4 + .1 * np.sin(t / 20) + rng.normal(0, .02, n)
        else:
            scale = {"gdp": 400000, "cpi": 90, "we": 750, "ippi": 70, "ms": 25e6, "pop": 1.2e6,
                     "rs": 2.5e6, "trade": 25000, "ca": 1}.get(key, 100)
            growth = {"cpi": .0022, "ippi": .0025, "we": .0025, "pop": .0025, "gdp": .005}.get(key, .004)
            shocks = rng.normal(0, .004 if key in ("cpi", "pop", "we") else .015, n).cumsum()
            v = scale * (0.3 + h) * np.exp(t * growth * (0.7 + h * .6) + shocks)
            if key in ("gdp", "rs", "ms", "trade"):
                v[(dates >= "2020-04-01") & (dates <= "2020-06-01")] *= .82
        if key == "gdp" and combo[0] in ("Statistical discrepancy", "Investment in inventories"):
            v = rng.normal(0, 4000, n)
        if key == "gdp" and combo[0] == "Less: imports of goods and services":
            v = -np.abs(v)
        frame = pd.DataFrame({"date": dates, cfg["value"]: np.round(v, 2)})
        for d, val in zip(cfg["dims"], combo):
            frame[d] = val
        rows.append(frame)
    df = pd.concat(rows, ignore_index=True)
    df["unit"] = SAMPLE_UNIT[key]
    if key == "ms":
        df.loc[df["statistic"] == "Inventory to sales ratio", "unit"] = "Ratio"
    return df[["date", *cfg["dims"], cfg["value"], "unit"]]


def sample_market(cfg: dict, rng: np.random.Generator) -> pd.DataFrame:
    dates = pd.bdate_range(MARKET_START, "2026-10-16")
    frames = []
    for i, (ticker, label) in enumerate(cfg["items"].items()):
        r = rng.normal(.0003, .012 + .004 * (i % 3), len(dates))
        close = (20 + 10 * i) * np.exp(r.cumsum())
        f = pd.DataFrame({
            "date": dates, "name": label, "ticker": ticker,
            "open": close * (1 + rng.normal(0, .003, len(dates))),
            "high": close * (1 + abs(rng.normal(0, .008, len(dates)))),
            "low": close * (1 - abs(rng.normal(0, .008, len(dates)))),
            "close": close, "adjusted": close * .97,
            "volume": rng.integers(1e5, 5e6, len(dates)),
        })
        frames.append(f)
    df = pd.concat(frames, ignore_index=True)
    df["unit"] = "Price (quote currency)"
    return df


# --------------------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------------------


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "all"


def rnd(x, digits=6):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    if x == 0:
        return 0
    # keep ~6 significant figures: plenty for charts, much smaller files
    mag = int(math.floor(math.log10(abs(x))))
    return round(float(x), max(0, digits - 1 - mag))


def write_series(df: pd.DataFrame, series_dims: list[str], value: str, extra: list[str], path: Path, freq: str):
    """Compact chart file: shared date axis, one value array per series."""
    dates = sorted(df["date"].unique())
    pos = {d: i for i, d in enumerate(dates)}
    series = []
    for key, g in df.groupby(series_dims, sort=True):
        key = key if isinstance(key, tuple) else (key,)
        g = g.sort_values("date")
        start, end = pos[g["date"].iloc[0]], pos[g["date"].iloc[-1]]
        arr = [None] * (end - start + 1)
        ex = {c: [None] * (end - start + 1) for c in extra}
        for row in g.itertuples(index=False):
            i = pos[row.date] - start
            arr[i] = rnd(getattr(row, value))
            for c in extra:
                v = getattr(row, c)
                ex[c][i] = int(v) if c == "volume" and pd.notna(v) else rnd(v)
        s = {"key": dict(zip(series_dims, key)), "start": start, "values": arr}
        if extra:
            s["extra"] = ex
        series.append(s)
    payload = {
        "unit": df["unit"].mode().iat[0] if len(df) else "",
        "freq": freq,
        "dates": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in dates],
        "series": series,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")))
    return payload


def write_downloads(key: str, df: pd.DataFrame, title: str, source: str, columns_doc: dict):
    DL.mkdir(parents=True, exist_ok=True)
    out = df.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.to_csv(DL / f"{key}.csv", index=False)

    write_xlsx(DL / f"{key}.xlsx", df, [
        ("Dataset", title), ("Source", source), ("Rows", len(out)),
        ("First date", out["date"].min()), ("Last date", out["date"].max()),
        ("Built (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")),
        *[(k, v if k.startswith(("Fixed:", "Source ")) else f"Column: {v}") for k, v in columns_doc.items()],
    ])


def write_xlsx(path: Path, df: pd.DataFrame, about: list[tuple[str, object]]):
    """Write row by row (xlsxwriter constant_memory needs strict row order; pandas' writer doesn't do that)."""
    import xlsxwriter

    wb = xlsxwriter.Workbook(str(path), {"constant_memory": True})
    bold = wb.add_format({"bold": True})
    datefmt = wb.add_format({"num_format": "yyyy-mm-dd"})
    cols = list(df.columns)
    n_sheets = max(1, math.ceil(len(df) / XLSX_MAX_ROWS))
    for i in range(n_sheets):
        ws = wb.add_worksheet("Data" if n_sheets == 1 else f"Data {i + 1}")
        ws.set_column(0, 0, 12)
        ws.set_column(1, len(cols), 22)
        ws.freeze_panes(1, 0)
        ws.write_row(0, 0, cols, bold)
        part = df.iloc[i * XLSX_MAX_ROWS:(i + 1) * XLSX_MAX_ROWS]
        for r, row in enumerate(part.itertuples(index=False, name=None), start=1):
            for c, v in enumerate(row):
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    continue
                if c == 0 and hasattr(v, "to_pydatetime"):
                    ws.write_datetime(r, 0, v.to_pydatetime(), datefmt)
                elif isinstance(v, (int, float, np.integer, np.floating)):
                    ws.write_number(r, c, float(v))
                else:
                    ws.write_string(r, c, str(v))
    info = wb.add_worksheet("About")
    info.set_column(0, 0, 24)
    info.set_column(1, 1, 90)
    info.write_row(0, 0, ["Field", "Value"], bold)
    for r, (k, v) in enumerate(about, start=1):
        info.write(r, 0, k)
        info.write(r, 1, v if isinstance(v, (int, float)) else str(v))
    wb.close()


def guess_freq(df: pd.DataFrame) -> str:
    d = pd.Series(sorted(df["date"].unique()))
    if len(d) < 3:
        return "M"
    gap = d.diff().dt.days.median()
    return "D" if gap < 7 else "M" if gap < 45 else "Q" if gap < 120 else "A"


COL_DOCS = {
    "date": "Reference period (first day of the month/quarter for StatCan series)",
    "region": "Geography", "product": "Product or product group", "component": "GDP expenditure component",
    "industry": "Industry (NAICS)", "statistic": "Statistic", "current_acct": "Current account item",
    "indicator": "Labour force characteristic", "sex": "Gender", "age_group": "Age group",
    "type": "Industry aggregate (NAICS)", "trade": "Trade flow", "trading_partners": "Trading partner",
    "value": "Observed value, in the units of the 'unit' column", "cpi": "Consumer Price Index (2002=100)",
    "population": "Number of persons", "unit": "Unit of measure and scale",
    "name": "Instrument name", "ticker": "Yahoo Finance ticker", "open": "Opening price",
    "high": "Daily high", "low": "Daily low", "close": "Closing price",
    "adjusted": "Close adjusted for splits and dividends", "volume": "Shares/contracts traded",
}


def process(key: str, df: pd.DataFrame, *, dims: list[str], value: str, shard: str | None,
            extra: list[str], title: str, source: str, web_start: str, **more) -> dict:
    notes = {**{f"Fixed: {k}": v for k, v in (more.get("fixed") or {}).items()},
             **{f"Source {i + 1}": u for i, u in enumerate(more.get("sources") or [])}}
    write_downloads(key, df, title, source, {**{c: COL_DOCS.get(c, c) for c in df.columns}, **notes})

    web = df[df["date"] >= web_start]
    freq = guess_freq(web)
    series_dims = [d for d in dims if d != shard]
    folder = OUT / key
    for old in folder.glob("*.json"):
        old.unlink()

    shards = []
    groups = [(None, web)] if shard is None else web.groupby(shard, sort=False)
    for sval, g in groups:
        fname = "all.json" if sval is None else f"{slug(str(sval))}.json"
        payload = write_series(g, series_dims, value, extra, folder / fname, freq)
        shards.append({"value": sval, "file": f"{key}/{fname}", "unit": payload["unit"],
                       "options": {d: sorted(g[d].dropna().unique().tolist()) for d in series_dims}})

    size = lambda p: (DL / p).stat().st_size
    return {
        "title": title, "source": source, "rows": int(len(df)),
        "start": df["date"].min().strftime("%Y-%m-%d"), "end": df["date"].max().strftime("%Y-%m-%d"),
        "freq": freq, "columns": list(df.columns), "value": value, "dims": dims, "shard": shard,
        "shards": shards, **{k: v for k, v in more.items() if v},
        "downloads": {"csv": {"file": f"downloads/{key}.csv", "bytes": size(f"{key}.csv")},
                      "xlsx": {"file": f"downloads/{key}.xlsx", "bytes": size(f"{key}.xlsx")}},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true", help="generate synthetic data (no internet needed)")
    ap.add_argument("--only", nargs="*", help="dataset ids to rebuild")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() and args.only else {"datasets": {}}
    rng = np.random.default_rng(7)
    failures = []

    for key, cfg in STATCAN.items():
        if args.only and key not in args.only:
            continue
        print(f"[statcan] {key} {cfg['table']} ...", flush=True)
        try:
            df = sample_statcan(key, cfg, rng) if args.sample else read_statcan(cfg)
            if df.empty:
                raise RuntimeError("no rows after filtering - check the filter values against the table")
            source = f"Statistics Canada, Table {cfg['table']}"
            meta["datasets"][key] = process(key, df, dims=cfg["dims"], value=cfg["value"], shard=cfg["shard"],
                                            extra=[], title=cfg["title"], source=source, web_start=WEB_START)
            print(f"   {len(df):,} rows", flush=True)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{key}: {e}")
            print(f"   FAILED: {e}", file=sys.stderr)

    for key, cfg in MARKETS.items():
        if args.only and key not in args.only:
            continue
        print(f"[yahoo] {key} ...", flush=True)
        try:
            df = sample_market(cfg, rng) if args.sample else read_market(cfg)
            meta["datasets"][key] = process(key, df, dims=MARKET_DIMS, value="adjusted", shard=None,
                                            extra=["open", "high", "low", "close", "volume"],
                                            title=cfg["title"], source="Yahoo Finance", web_start=MARKET_START)
            print(f"   {len(df):,} rows", flush=True)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{key}: {e}")
            print(f"   FAILED: {e}", file=sys.stderr)

    for key, cfg in SOCIAL_STATCAN.items():
        if args.only and key not in args.only:
            continue
        print(f"[statcan] {key} {cfg['table']} ...", flush=True)
        try:
            if args.sample:
                df, dims, fixed = sample_social(key, rng)
            else:
                df, dims, fixed = read_social_statcan(cfg, statcan_zip(cfg["table"]))
            meta["datasets"][key] = process(key, df, dims=dims, value="value", shard=cfg["shard"], extra=[],
                                            title=cfg["title"], source=f"Statistics Canada, Table {cfg['table']}",
                                            web_start="1900-01-01", fixed=fixed, section="social")
            print(f"   {len(df):,} rows; fixed {fixed}", flush=True)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{key}: {e}")
            print(f"   FAILED: {e}", file=sys.stderr)

    for key, cfg in MANUAL_SETS.items():
        if args.only and key not in args.only:
            continue
        print(f"[manual] {key} {cfg['file']} ...", flush=True)
        try:
            df, dims, sources = read_manual(cfg)
            meta["datasets"][key] = process(key, df, dims=dims, value="value", shard=cfg["shard"], extra=[],
                                            title=cfg["title"], source=cfg["source"], web_start="1900-01-01",
                                            sources=sources, section="social")
            print(f"   {len(df):,} rows", flush=True)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{key}: {e}")
            print(f"   FAILED: {e}", file=sys.stderr)

    meta["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta["sample"] = bool(args.sample)
    meta_path.write_text(json.dumps(meta, indent=1))

    if failures:
        print("\nSome datasets failed:\n  " + "\n  ".join(failures), file=sys.stderr)
        sys.exit(1)
    print(f"\nDone. Files in {OUT}")


if __name__ == "__main__":
    main()
