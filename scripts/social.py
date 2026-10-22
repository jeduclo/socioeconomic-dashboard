"""
Social conditions datasets: Statistics Canada tables read by *role*, plus hand-entered report data.

StatCan social tables have several category columns whose exact names we don't hard-code.
Each dataset names the columns it needs by role (a regex on the column name). Every other
category column is fixed to one value (a preferred value, else a "Total"/"All" value, else the
first one). The chosen values are recorded in meta.json and shown on the page, so nothing is hidden.

If a required role can't be found, the build stops and prints the table's real column names.
"""
from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

MANUAL = Path(__file__).resolve().parent.parent / "data" / "manual"

STD_COLS = {"REF_DATE", "DGUID", "UOM", "UOM_ID", "SCALAR_FACTOR", "SCALAR_ID", "VECTOR", "COORDINATE",
            "VALUE", "STATUS", "SYMBOL", "TERMINATED", "DECIMALS"}
TOTAL_RX = re.compile(r"^(total|all)\b|,\s*total|^total\s*-|all persons|all ages|all households|all family", re.I)

# role: (column regex, required)
SOCIAL_STATCAN = {
    "food": dict(
        table="13-10-0834-01",
        title="Food insecurity by economic family type",
        roles={"region": (r"^GEO$", True),
               "status": (r"food (in)?security", True),
               "group": (r"family type|economic family|persons", True)},
        prefer=[(r"statistic", [r"percent"])],
        shard=None,
    ),
    "poverty": dict(
        table="11-10-0135-01",
        title="Low income statistics by age, gender and economic family type",
        roles={"region": (r"^GEO$", True),
               "line": (r"low income line|income line", True),
               "group": (r"persons in low income|age|gender|family", True)},
        prefer=[(r"statistic", [r"percentage of persons|^percent", r"percent"])],
        keep={"line": [r"market basket", r"low income measure.*after", r"low income cut-?offs?.*after"]},
        shard="line",
    ),
    "gini": dict(
        table="11-10-0134-01",
        title="Gini coefficients of adjusted market, total and after-tax income",
        roles={"region": (r"^GEO$", True),
               "concept": (r"income concept|income", True)},
        prefer=[(r"statistic", [r"gini"])],
        shard=None,
    ),
    "rent": dict(
        table="34-10-0133-01",
        title="CMHC average rents, areas with a population of 10,000 and over",
        roles={"region": (r"^GEO$", True),
               "unit_type": (r"type of unit|unit type|bedroom", True)},
        prefer=[(r"structure", [r"row and apartment", r"apartment"])],
        shard="unit_type",
    ),
    "vacancy": dict(
        table="34-10-0127-01",
        title="CMHC vacancy rates, apartment structures of six units and over",
        roles={"region": (r"^GEO$", True)},
        prefer=[],
        shard=None,
    ),
    "shelters": dict(
        table="14-10-0353-01",
        title="Homeless shelter capacity: beds and shelters",
        roles={"region": (r"^GEO$", True),
               "shelter_type": (r"type of (shelter|program)|shelter type|program", False),
               "population": (r"target population|clientele|population|served", True),
               "measure": (r"type of information|statistic|measure|bed|capacit|count", False)},
        prefer=[],
        shard=None,
    ),
}

MANUAL_SETS = {
    "shelteruse": dict(
        file="shelter_use.csv",
        title="Emergency shelter use in Canada (National Shelter Study)",
        source="Housing, Infrastructure and Communities Canada, National Shelter Study 2023 update",
        shard="measure",
    ),
    "foodbanks": dict(
        file="food_banks.csv",
        title="Food bank visits in March (HungerCount)",
        source="Food Banks Canada, HungerCount reports 2019-2025",
        shard=None,
    ),
}


def _unit(uom: pd.Series, scalar: pd.Series) -> pd.Series:
    sc = scalar.fillna("units").astype(str).str.strip().str.lower()
    u = uom.fillna("").astype(str).str.strip()
    return pd.Series(np.where(sc.isin(["units", "unit", ""]), u, u + " (" + sc + ")"), index=uom.index)


def _parse_date(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.strip()
    s = s.where(~s.str.fullmatch(r"\d{4}-\d{2}"), s + "-01")
    s = s.where(~s.str.fullmatch(r"\d{4}"), s + "-01-01")
    return pd.to_datetime(s, errors="coerce")


def _pick(values: list[str], prefs: list[str]) -> str:
    for rx in prefs:
        hit = [v for v in values if re.search(rx, v, re.I)]
        if hit:
            return hit[0]
    hit = [v for v in values if TOTAL_RX.search(v)]
    return hit[0] if hit else values[0]


def read_social_statcan(cfg: dict, zip_bytes: bytes) -> tuple[pd.DataFrame, list[str], dict]:
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    name = next(n for n in zf.namelist() if n.endswith(".csv") and "MetaData" not in n)
    with zf.open(name) as fh:
        header = pd.read_csv(fh, nrows=0, encoding="utf-8-sig").columns.tolist()
    dim_cols = [c for c in header if c not in STD_COLS]

    # 1. assign roles to columns
    role_col: dict[str, str] = {}
    for role, (rx, required) in cfg["roles"].items():
        col = next((c for c in dim_cols if c not in role_col.values() and re.search(rx, c, re.I)), None)
        if col:
            role_col[role] = col
        elif required:
            raise RuntimeError(f"no column for '{role}' (pattern {rx!r}). Table columns: {dim_cols}")
    other = [c for c in dim_cols if c not in role_col.values()]

    usecols = ["REF_DATE", "VALUE", "UOM", "SCALAR_FACTOR", *dim_cols]

    def chunks():
        with zf.open(name) as fh:
            yield from pd.read_csv(fh, usecols=lambda c: c in usecols, dtype=str, encoding="utf-8-sig",
                                   chunksize=400_000)

    # 2. first pass: distinct values of the columns we collapse, and of role columns with a keep-list
    seen: dict[str, dict[str, None]] = {c: {} for c in other}
    keep_roles = cfg.get("keep", {})
    role_seen: dict[str, dict[str, None]] = {r: {} for r in keep_roles if r in role_col}
    for ch in chunks():
        for c in other:
            for v in ch[c].dropna().unique():
                seen[c].setdefault(v, None)
        for r in role_seen:
            for v in ch[role_col[r]].dropna().unique():
                role_seen[r].setdefault(v, None)

    fixed = {}
    for c in other:
        prefs = [p for crx, plist in cfg.get("prefer", []) if re.search(crx, c, re.I) for p in plist]
        fixed[c] = _pick(list(seen[c]), prefs)
    allowed = {}
    for r, vals in role_seen.items():
        ok = [v for v in vals if any(re.search(rx, v, re.I) for rx in keep_roles[r])]
        if ok:
            allowed[r] = set(ok)

    # 3. second pass: filter
    parts = []
    for ch in chunks():
        m = pd.Series(True, index=ch.index)
        for c, v in fixed.items():
            m &= ch[c] == v
        for r, vals in allowed.items():
            m &= ch[role_col[r]].isin(vals)
        parts.append(ch[m])
    df = pd.concat(parts, ignore_index=True)
    if df.empty:
        raise RuntimeError(f"no rows after fixing {fixed}")

    df = df.rename(columns={v: k for k, v in role_col.items()})
    df["date"] = _parse_date(df["REF_DATE"])
    df["value"] = pd.to_numeric(df["VALUE"], errors="coerce")
    df["unit"] = _unit(df["UOM"], df["SCALAR_FACTOR"])
    dims = list(role_col)
    df = df[["date", *dims, "value", "unit"]].dropna(subset=["date", "value"])
    df = df.groupby(["date", *dims], as_index=False, sort=False).agg({"value": "mean", "unit": "first"})
    return df.sort_values([*dims, "date"]).reset_index(drop=True), dims, fixed


def read_manual(cfg: dict) -> tuple[pd.DataFrame, list[str], list[str]]:
    df = pd.read_csv(MANUAL / cfg["file"], dtype=str)
    sources = list(dict.fromkeys(df["source"].dropna()))
    dims = [c for c in df.columns if c not in ("date", "value", "unit", "source")]
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"])
    df = df[["date", *dims, "value", "unit"]]
    return df.sort_values([*dims, "date"]).reset_index(drop=True), dims, sources


# ------------------------------------------------------------------ synthetic data (layout testing)

PROVINCES = ["Canada", "Atlantic provinces", "Newfoundland and Labrador", "Prince Edward Island", "Nova Scotia",
             "New Brunswick", "Quebec", "Ontario", "Prairie provinces", "Manitoba", "Saskatchewan", "Alberta",
             "British Columbia"]
CITIES = ["Canada", "Toronto, Ontario", "Montréal, Quebec", "Vancouver, British Columbia", "Calgary, Alberta",
          "Edmonton, Alberta", "Ottawa-Gatineau, Ontario part, Ontario/Quebec", "Winnipeg, Manitoba",
          "Québec, Quebec", "Hamilton, Ontario", "Halifax, Nova Scotia", "Victoria, British Columbia",
          "Saskatoon, Saskatchewan", "Regina, Saskatchewan", "St. John's, Newfoundland and Labrador",
          "Kelowna, British Columbia", "Moncton, New Brunswick", "Charlottetown, Prince Edward Island"]
SAMPLE = {
    "food": dict(years=range(2018, 2025), unit="Percent", dims={
        "region": PROVINCES,
        "status": ["Food insecure", "Marginal food insecurity", "Moderate food insecurity", "Severe food insecurity"],
        "group": ["All persons", "Persons under 18 years", "Persons in couple families with children",
                  "Persons in lone-parent families", "Female lone-parent families", "Persons not in an economic family",
                  "Senior persons in couple families"]}),
    "poverty": dict(years=range(2006, 2025), unit="Percent", dims={
        "region": PROVINCES,
        "line": ["Market basket measure, 2018 base", "Low income measure after tax", "Low income cut-offs after tax"],
        "group": ["All persons", "Persons under 18 years", "Persons 18 to 64 years", "Persons 65 years and over",
                  "Males", "Females"]}),
    "gini": dict(years=range(1976, 2025), unit="Number", dims={
        "region": PROVINCES,
        "concept": ["Adjusted market income", "Adjusted total income", "Adjusted after-tax income"]}),
    "rent": dict(years=range(1990, 2026), unit="Dollars", dims={
        "region": CITIES, "unit_type": ["Bachelor units", "One bedroom units", "Two bedroom units",
                                        "Three bedroom units"]}),
    "vacancy": dict(years=range(1990, 2026), unit="Percent", dims={"region": CITIES}),
    "shelters": dict(years=range(2016, 2025), unit="Number", dims={
        "region": ["Canada"] + PROVINCES[2:8] + PROVINCES[9:] + ["Yukon", "Northwest Territories", "Nunavut"],
        "shelter_type": ["Emergency shelters", "Transitional housing", "Domestic violence shelters"],
        "population": ["Total", "General", "Men", "Women", "Youth", "Family"],
        "measure": ["Beds", "Shelters"]}),
}


def sample_social(key: str, rng: np.random.Generator) -> tuple[pd.DataFrame, list[str], dict]:
    spec = SAMPLE[key]
    dims = list(spec["dims"])
    years = list(spec["years"])
    idx = pd.MultiIndex.from_product([spec["dims"][d] for d in dims], names=dims)
    rows = []
    t = np.arange(len(years))
    for combo in idx:
        h = (abs(hash((key,) + combo)) % 1000) / 1000
        if key == "food":
            base = {"Food insecure": 16, "Marginal food insecurity": 4, "Moderate food insecurity": 7,
                    "Severe food insecurity": 4}[combo[1]]
            v = base * (0.7 + h * .8) * (1 + .06 * np.maximum(t - 3, 0)) + rng.normal(0, .4, len(t))
        elif key == "poverty":
            v = (8 + h * 10) * (1.25 - .04 * t + .025 * np.maximum(t - 14, 0) * 3) + rng.normal(0, .3, len(t))
        elif key == "gini":
            base = {"Adjusted market income": .43, "Adjusted total income": .32, "Adjusted after-tax income": .29}[combo[1]]
            v = base + .03 * np.tanh((t - 20) / 10) + (h - .5) * .03 + rng.normal(0, .003, len(t))
        elif key == "rent":
            v = (450 + 400 * h + 200 * spec["dims"]["unit_type"].index(combo[1])) * np.exp(.035 * t)
        elif key == "vacancy":
            v = np.clip(3 + 2 * np.sin(t / 5 + h * 6) + rng.normal(0, .3, len(t)), .3, 9)
        else:  # shelters
            v = (50 + 2000 * h) * (1 + .03 * t) * (1 if combo[3] == "Beds" else .05)
            v = np.round(v)
        f = pd.DataFrame({"date": pd.to_datetime([f"{y}-01-01" for y in years]), "value": np.round(v, 3)})
        for d, val in zip(dims, combo):
            f[d] = val
        rows.append(f)
    df = pd.concat(rows, ignore_index=True)
    df["unit"] = spec["unit"]
    return df[["date", *dims, "value", "unit"]], dims, {}
