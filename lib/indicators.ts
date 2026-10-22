// Every indicator page is driven by this file. Ids match scripts/build_data.py.

export type Interval = "all" | "weekly" | "monthly" | "quarterly" | "yearly";

export type ChartKind =
  | "level" // values over time
  | "yoy" // % change vs a year earlier
  | "pop" // % change vs previous period
  | "diff" // absolute change vs previous period
  | "yoyDiff" // absolute change vs a year earlier (for rates, in points)
  | "rollingYear" // sum of the last 12 months / 4 quarters
  | "rebased" // index, first date in range = 100
  | "drawdown" // % below running peak
  | "latest" // latest value of each selected series
  | "periodReturn" // % change first -> last date in range, per selected series
  | "latestYoyAll" // latest y/y % change for every option of the series dimension
  | "latestAll" // latest value for every option of the series dimension
  | "latestAcross"; // latest value across the options of another dimension

export type KpiKind = "latest" | "pop" | "popDiff" | "yoy" | "yoyDiff" | "high" | "avg5" | "periodReturn" | "drawdown";

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  note?: string;
  dim?: string; // for latestAcross
}

export interface FilterSpec {
  dim: string;
  label: string;
  default: string | string[];
  multi?: boolean; // exactly one filter per indicator is multi: it defines the chart series
}

export type Section = "economy" | "social";

export interface Indicator {
  id: string;
  section?: Section; // default "economy"
  fullRange?: boolean; // start the date range at the first year (annual data)
  name: string;
  group: string;
  tagline: string;
  shard?: FilterSpec; // single-choice filter that selects the data file
  filters: FilterSpec[];
  intervals: Interval[];
  charts: [ChartSpec, ChartSpec, ChartSpec, ChartSpec];
  kpis: [KpiKind, KpiKind, KpiKind, KpiKind];
  rate?: boolean; // values are percentages: changes shown in points
  about: { what: string; why: string[]; reading: string[] };
}

const STATCAN_INTERVALS: Interval[] = ["all", "quarterly", "yearly"];
const MONTHLY_INTERVALS: Interval[] = ["all", "quarterly", "yearly"];
const MARKET_INTERVALS: Interval[] = ["all", "weekly", "monthly", "quarterly", "yearly"];

export const INDICATORS: Indicator[] = [
  {
    id: "gdp",
    name: "GDP",
    group: "Output and prices",
    tagline: "Expenditure-based GDP in chained dollars, seasonally adjusted at annual rates.",
    filters: [{ dim: "component", label: "Components", default: ["Gross domestic product at market prices"], multi: true }],
    intervals: STATCAN_INTERVALS,
    charts: [
      { kind: "level", title: "Level over time" },
      { kind: "yoy", title: "Growth on a year earlier", note: "% change vs the same quarter a year before" },
      { kind: "pop", title: "Quarter-on-quarter growth", note: "% change vs the previous quarter" },
      { kind: "latest", title: "Latest quarter by component" },
    ],
    kpis: ["latest", "pop", "yoy", "high"],
    about: {
      what: "Gross Domestic Product is the market value of all final goods and services produced in Canada in a period. The expenditure approach adds up consumption, investment, government spending and net exports.",
      why: ["Economic analysis", "Investment decisions", "Policy development", "Forecasting economic trends"],
      reading: ["Values are real (chained dollars), so changes reflect volume, not price.", "Annual-rate figures are the quarter's pace scaled to a full year."],
    },
  },
  {
    id: "cpi",
    name: "Consumer prices (CPI)",
    group: "Output and prices",
    tagline: "Consumer Price Index by product group and region, 2002 = 100.",
    shard: { dim: "region", label: "Region", default: "Canada" },
    filters: [{ dim: "product", label: "Products", default: ["All-items"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Index level" },
      { kind: "yoy", title: "Inflation, 12-month", note: "% change vs the same month a year before" },
      { kind: "pop", title: "Monthly change", note: "% change vs the previous month" },
      { kind: "latestYoyAll", title: "Where prices rose fastest", note: "Latest 12-month inflation by product group" },
    ],
    kpis: ["latest", "yoy", "pop", "avg5"],
    about: {
      what: "The Consumer Price Index tracks the average change over time in the prices consumers pay for a fixed basket of goods and services.",
      why: ["Measuring inflation and deflation", "Cost-of-living adjustments for wages, pensions and contracts", "Deflating other economic series", "Business planning and investment analysis"],
      reading: ["The index level itself has no meaning; compare changes.", "12-month inflation is the headline figure the Bank of Canada targets at 2%."],
    },
  },
  {
    id: "ippi",
    name: "Industrial prices (IPPI)",
    group: "Output and prices",
    tagline: "Prices received by Canadian producers for their output, January 2020 = 100.",
    filters: [{ dim: "product", label: "Products", default: ["Industrial product price index, total"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Index level" },
      { kind: "yoy", title: "Change on a year earlier" },
      { kind: "pop", title: "Monthly change" },
      { kind: "latestYoyAll", title: "Biggest price moves", note: "Latest 12-month change by product" },
    ],
    kpis: ["latest", "yoy", "pop", "high"],
    about: {
      what: "The Industrial Product Price Index measures changes in the prices domestic manufacturers receive for goods as they leave the plant.",
      why: ["An early signal of consumer inflation", "Cost estimation and contract escalation", "Market analysis", "Policy-making"],
      reading: ["Producer prices often move before consumer prices.", "Energy products drive much of the total's volatility."],
    },
  },
  {
    id: "lm",
    name: "Labour market",
    group: "People and work",
    tagline: "Labour Force Survey rates by region, gender and age group, seasonally adjusted.",
    shard: { dim: "region", label: "Region", default: "Canada" },
    filters: [
      { dim: "indicator", label: "Indicator", default: "Unemployment rate" },
      { dim: "sex", label: "Gender", default: "Total" },
      { dim: "age_group", label: "Age groups", default: ["15 years and over"], multi: true },
    ],
    intervals: MONTHLY_INTERVALS,
    rate: true,
    charts: [
      { kind: "level", title: "Rate over time" },
      { kind: "yoyDiff", title: "Change on a year earlier", note: "Percentage points" },
      { kind: "latest", title: "Latest month by age group" },
      { kind: "latestAcross", dim: "sex", title: "Latest month by gender", note: "First selected age group" },
    ],
    kpis: ["latest", "popDiff", "yoyDiff", "avg5"],
    about: {
      what: "Labour market indicators from Statistics Canada's monthly Labour Force Survey: unemployment, participation and employment rates.",
      why: ["Tracking the business cycle", "Workforce planning", "Economic forecasting", "Social program planning"],
      reading: ["Changes in rates are shown in percentage points, not percent.", "Youth rates move more than prime-age (25 to 54) rates."],
    },
  },
  {
    id: "we",
    name: "Weekly earnings",
    group: "People and work",
    tagline: "Average weekly earnings including overtime, all employees, by industry.",
    shard: { dim: "region", label: "Region", default: "Canada" },
    filters: [{ dim: "industry", label: "Industries", default: ["Industrial aggregate excluding unclassified businesses"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Weekly earnings" },
      { kind: "yoy", title: "Wage growth on a year earlier" },
      { kind: "latest", title: "Latest month by industry" },
      { kind: "latestYoyAll", title: "Wage growth by industry", note: "Latest 12-month change" },
    ],
    kpis: ["latest", "yoy", "pop", "high"],
    about: {
      what: "Average weekly earnings from the Survey of Employment, Payrolls and Hours, including overtime, across industries and regions.",
      why: ["Workforce planning", "Setting pay benchmarks", "Economic analysis", "Understanding income gaps between industries"],
      reading: ["Compare wage growth to CPI inflation to see whether real wages are rising.", "Series are not seasonally adjusted, so compare with a year earlier."],
    },
  },
  {
    id: "pop",
    name: "Population",
    group: "People and work",
    tagline: "Quarterly population estimates for Canada, provinces and territories.",
    filters: [{ dim: "region", label: "Regions", default: ["Canada"], multi: true }],
    intervals: STATCAN_INTERVALS,
    charts: [
      { kind: "level", title: "Population" },
      { kind: "yoy", title: "Annual growth rate" },
      { kind: "pop", title: "Quarterly growth rate" },
      { kind: "latestYoyAll", title: "Growth by region", note: "Latest 12-month growth" },
    ],
    kpis: ["latest", "yoy", "pop", "periodReturn"],
    about: {
      what: "Estimates of the number of people living in each province and territory at the start of each quarter.",
      why: ["Government policy and planning", "Market research", "Sociological and economic studies", "Resource allocation"],
      reading: ["Growth is driven mostly by international migration.", "Per-capita measures divide other indicators by these figures."],
    },
  },
  {
    id: "trade",
    name: "Merchandise trade",
    group: "Trade and the external sector",
    tagline: "Exports, imports and the trade balance by principal trading partner, balance-of-payments basis.",
    shard: { dim: "trade", label: "Trade flow", default: "Export" },
    filters: [{ dim: "trading_partners", label: "Trading partners", default: ["United States"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Monthly value" },
      { kind: "rollingYear", title: "Last 12 months, total" },
      { kind: "yoy", title: "Change on a year earlier", note: "Blank where values change sign" },
      { kind: "latest", title: "Latest month by partner" },
    ],
    kpis: ["latest", "pop", "yoy", "high"],
    about: {
      what: "Canada's merchandise exports and imports with its principal trading partners, adjusted to a balance-of-payments basis.",
      why: ["Trade policy and negotiations", "International business planning", "Economic analysis", "Exchange-rate analysis"],
      reading: ["Monthly values are seasonally adjusted.", "The 12-month total smooths out month-to-month noise."],
    },
  },
  {
    id: "ca",
    name: "Current account",
    group: "Trade and the external sector",
    tagline: "Quarterly receipts, payments and balances on goods, services and income.",
    shard: { dim: "statistic", label: "Statistic", default: "Balances" },
    filters: [{ dim: "current_acct", label: "Current account items", default: ["Total current account"], multi: true }],
    intervals: STATCAN_INTERVALS,
    charts: [
      { kind: "level", title: "Value over time" },
      { kind: "rollingYear", title: "Last four quarters, total" },
      { kind: "diff", title: "Change on the previous quarter" },
      { kind: "latest", title: "Latest quarter by item" },
    ],
    kpis: ["latest", "popDiff", "yoyDiff", "avg5"],
    about: {
      what: "The current account is one of the two main parts of the balance of payments. It records trade in goods and services, investment income and transfers between residents and non-residents.",
      why: ["Macroeconomic policy", "Investment decisions", "International financial planning", "Assessing external vulnerability"],
      reading: ["A negative balance means Canada pays the rest of the world more than it receives.", "Balances can change sign, so changes are shown in dollars, not percent."],
    },
  },
  {
    id: "rs",
    name: "Retail sales",
    group: "Business activity",
    tagline: "Monthly retail sales by store type and region, seasonally adjusted.",
    shard: { dim: "region", label: "Region", default: "Canada" },
    filters: [{ dim: "industry", label: "Store types", default: ["Retail trade [44-45]"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Monthly sales" },
      { kind: "yoy", title: "Change on a year earlier" },
      { kind: "pop", title: "Monthly change" },
      { kind: "latestYoyAll", title: "Growth by store type", note: "Latest 12-month change" },
    ],
    kpis: ["latest", "pop", "yoy", "high"],
    about: {
      what: "The value of sales by retailers across store types and regions, a key gauge of consumer spending.",
      why: ["Market research", "Economic forecasting", "Business planning", "Policy formulation"],
      reading: ["Values are nominal: part of the growth is price increases.", "Gasoline stations swing with fuel prices."],
    },
  },
  {
    id: "ms",
    name: "Manufacturing",
    group: "Business activity",
    tagline: "Manufacturers' sales, orders and inventories, seasonally adjusted.",
    shard: { dim: "statistic", label: "Statistic", default: "Sales of goods manufactured (shipments)" },
    filters: [{ dim: "type", label: "Industry groups", default: ["Manufacturing"], multi: true }],
    intervals: MONTHLY_INTERVALS,
    charts: [
      { kind: "level", title: "Value over time" },
      { kind: "yoy", title: "Change on a year earlier" },
      { kind: "pop", title: "Monthly change" },
      { kind: "latest", title: "Latest month by industry group" },
    ],
    kpis: ["latest", "pop", "yoy", "high"],
    about: {
      what: "The Monthly Survey of Manufacturing measures sales of goods manufactured, inventories and orders.",
      why: ["Gauging the health of the manufacturing sector", "Business planning and investment", "Market analysis", "Economic forecasting"],
      reading: ["Rising inventories with falling sales can signal a slowdown.", "Durable goods are more sensitive to the business cycle."],
    },
  },
  {
    id: "com",
    name: "Commodities",
    group: "Markets",
    tagline: "Daily futures prices for energy, metals and grains.",
    filters: [{ dim: "name", label: "Commodities", default: ["Crude Oil"], multi: true }],
    intervals: MARKET_INTERVALS,
    charts: [
      { kind: "level", title: "Price" },
      { kind: "rebased", title: "Performance", note: "Index, first date shown = 100" },
      { kind: "drawdown", title: "Drop from peak", note: "% below the highest price so far in the range" },
      { kind: "periodReturn", title: "Return over the range" },
    ],
    kpis: ["latest", "periodReturn", "high", "drawdown"],
    about: {
      what: "Commodities are raw materials and primary products: hard commodities such as oil and gold, and soft commodities such as wheat and corn. Prices are front-month futures.",
      why: ["Understanding market fluctuations", "Commodity trading decisions", "Forecasting prices", "Managing risk"],
      reading: ["Use the performance chart to compare commodities with very different prices.", "Canada's terms of trade move with oil prices."],
    },
  },
  {
    id: "sec",
    name: "Economic sectors",
    group: "Markets",
    tagline: "Daily prices of US sector ETFs (SPDR Select Sector funds).",
    filters: [{ dim: "name", label: "Sectors", default: ["Technology"], multi: true }],
    intervals: MARKET_INTERVALS,
    charts: [
      { kind: "level", title: "Price" },
      { kind: "rebased", title: "Performance", note: "Index, first date shown = 100" },
      { kind: "drawdown", title: "Drop from peak" },
      { kind: "periodReturn", title: "Return over the range" },
    ],
    kpis: ["latest", "periodReturn", "high", "drawdown"],
    about: {
      what: "Exchange-traded funds that track one sector of the US stock market each, such as technology, energy or utilities.",
      why: ["Portfolio diversification", "Reading the momentum of a sector", "Investment decisions", "Spotting sector rotation"],
      reading: ["Prices are adjusted for dividends and splits.", "Defensive sectors (utilities, healthcare) usually fall less in downturns."],
    },
  },
  {
    id: "stock",
    name: "Canadian stocks",
    group: "Markets",
    tagline: "Daily prices of ten large TSX-listed companies.",
    filters: [{ dim: "name", label: "Stocks", default: ["Royal Bank of Canada"], multi: true }],
    intervals: MARKET_INTERVALS,
    charts: [
      { kind: "level", title: "Price" },
      { kind: "rebased", title: "Performance", note: "Index, first date shown = 100" },
      { kind: "drawdown", title: "Drop from peak" },
      { kind: "periodReturn", title: "Return over the range" },
    ],
    kpis: ["latest", "periodReturn", "high", "drawdown"],
    about: {
      what: "The Toronto Stock Exchange is Canada's largest exchange. These ten companies are among its largest components across banking, energy, rail, telecom and technology.",
      why: ["Insight into the Canadian economy", "Investment decisions", "Financial planning", "Global market linkages"],
      reading: ["Prices are in Canadian dollars, adjusted for dividends and splits.", "Banks and energy carry large weights in the TSX."],
    },
  },
  // ------------------------------------------------------------------ social conditions
  {
    id: "food",
    section: "social",
    fullRange: true,
    name: "Food insecurity",
    group: "Food and poverty",
    tagline: "Share of people living in households that struggle to afford enough food, by family type.",
    filters: [
      { dim: "region", label: "Region", default: "Canada" },
      { dim: "status", label: "Severity", default: "Food insecure" },
      { dim: "group", label: "Family types", default: ["All persons"], multi: true },
    ],
    intervals: ["all"],
    rate: true,
    charts: [
      { kind: "level", title: "Share of people over time", note: "% of persons" },
      { kind: "yoyDiff", title: "Change on the previous year", note: "Percentage points" },
      { kind: "latestAll", title: "Latest year, all family types", note: "Your selection highlighted" },
      { kind: "latestAcross", dim: "region", title: "Latest year by province", note: "First selected family type" },
    ],
    kpis: ["latest", "yoyDiff", "high", "avg5"],
    about: {
      what: "Food insecurity means inadequate or insecure access to food because of financial constraints. It is measured with the 18-question Household Food Security Survey Module in the Canadian Income Survey. Marginal, moderate and severe levels add up to the food-insecure total.",
      why: ["The most direct measure of material hardship", "Strongly linked to physical and mental health", "Tracks the effect of inflation and income support on households", "Used to monitor Canada's poverty reduction strategy"],
      reading: ["Covers the ten provinces only: the territories and First Nations reserves are not surveyed.", "Severity levels: marginal (worry about running out), moderate (lower quality or quantity), severe (skipped meals, days without food)."],
    },
  },
  {
    id: "foodbanks",
    section: "social",
    fullRange: true,
    name: "Food bank visits",
    group: "Food and poverty",
    tagline: "Visits to food banks in March of each year, from Food Banks Canada's HungerCount survey.",
    filters: [{ dim: "region", label: "Regions", default: ["Canada"], multi: true }],
    intervals: ["all"],
    charts: [
      { kind: "level", title: "Visits in March" },
      { kind: "yoy", title: "Change on the previous year" },
      { kind: "latest", title: "Latest year, selected regions" },
      { kind: "latestYoyAll", title: "Growth by province", note: "% change on the previous year" },
    ],
    kpis: ["latest", "yoy", "periodReturn", "high"],
    about: {
      what: "HungerCount counts every visit to participating food banks and meal programs during the month of March. One person visiting three times counts as three visits.",
      why: ["The most visible sign of food insecurity", "Shows pressure on charitable food networks", "Available by province within months of collection"],
      reading: ["Hand-entered from HungerCount reports; every figure links to its source in the download.", "No count took place in 2020. Provincial figures are included for 2019, 2021, 2024 and 2025.", "Network and data-collection changes (notably Manitoba and the territories) affect comparisons with 2019."],
    },
  },
  {
    id: "poverty",
    section: "social",
    fullRange: true,
    name: "Poverty",
    group: "Food and poverty",
    tagline: "Share of people living below the poverty line, by age and gender. Canada's official line is the Market Basket Measure.",
    shard: { dim: "line", label: "Poverty line", default: "Market basket measure, 2018 base" },
    filters: [
      { dim: "region", label: "Region", default: "Canada" },
      { dim: "group", label: "Groups", default: ["All persons"], multi: true },
    ],
    intervals: ["all"],
    rate: true,
    charts: [
      { kind: "level", title: "Poverty rate over time", note: "% of persons below the line" },
      { kind: "yoyDiff", title: "Change on the previous year", note: "Percentage points" },
      { kind: "latestAll", title: "Latest year, all groups", note: "Your selection highlighted" },
      { kind: "latestAcross", dim: "region", title: "Latest year by region", note: "First selected group" },
    ],
    kpis: ["latest", "yoyDiff", "high", "avg5"],
    about: {
      what: "The Market Basket Measure (MBM) is Canada's Official Poverty Line: the cost of a basket of food, clothing, shelter, transportation and other necessities in each region. A family is in poverty if its disposable income is below that cost. The low income measure (LIM) and low income cut-offs (LICO) are older, alternative lines.",
      why: ["Canada's poverty reduction targets are set against the MBM", "Shows who is most exposed: children, seniors, single people", "Shows the effect of benefits such as the Canada Child Benefit"],
      reading: ["Compare lines with care: they measure different things and give different rates.", "The 2020 drop reflects temporary pandemic benefits."],
    },
  },
  {
    id: "gini",
    section: "social",
    fullRange: true,
    name: "Income inequality",
    group: "Food and poverty",
    tagline: "Gini coefficient of household income before and after taxes and transfers.",
    filters: [
      { dim: "concept", label: "Income concept", default: "Adjusted after-tax income" },
      { dim: "region", label: "Regions", default: ["Canada"], multi: true },
    ],
    intervals: ["all"],
    charts: [
      { kind: "level", title: "Gini coefficient over time", note: "0 = everyone has the same income, 1 = one household has it all" },
      { kind: "diff", title: "Change on the previous year" },
      { kind: "latestAll", title: "Latest year by region" },
      { kind: "latestAcross", dim: "concept", title: "Effect of taxes and transfers", note: "First selected region, latest year" },
    ],
    kpis: ["latest", "popDiff", "high", "avg5"],
    about: {
      what: "The Gini coefficient summarises how unequally income is spread across households, from 0 (perfect equality) to 1. Market income is earnings and investment income; total income adds government transfers; after-tax income also subtracts income tax.",
      why: ["The standard summary of inequality", "The gap between market and after-tax Gini shows how much redistribution taxes and transfers achieve", "Comparable across provinces and over 45+ years"],
      reading: ["Changes are small: 0.01 is a meaningful move.", "Incomes are adjusted for household size."],
    },
  },
  {
    id: "rent",
    section: "social",
    fullRange: true,
    name: "Rents",
    group: "Housing and homelessness",
    tagline: "Average monthly rent in purpose-built rental apartments, from CMHC's Rental Market Survey (October each year).",
    shard: { dim: "unit_type", label: "Unit type", default: "Two bedroom units" },
    filters: [{ dim: "region", label: "Cities", default: ["Toronto", "Montréal", "Vancouver"], multi: true }],
    intervals: ["all"],
    charts: [
      { kind: "level", title: "Average monthly rent", note: "Dollars" },
      { kind: "yoy", title: "Change on the previous year" },
      { kind: "latest", title: "Latest year, selected cities" },
      { kind: "latestYoyAll", title: "Fastest rent increases", note: "Latest 12-month change, all centres" },
    ],
    kpis: ["latest", "yoy", "periodReturn", "avg5"],
    about: {
      what: "The average rent of occupied and vacant units in privately initiated apartment and row structures, surveyed by Canada Mortgage and Housing Corporation each October.",
      why: ["The core cost of housing for renters", "Compare with wage growth and CPI to see affordability", "Large differences between cities drive migration"],
      reading: ["Covers purpose-built rentals only, not condos or basement units rented privately.", "Averages include long-term tenants, so they rise more slowly than asking rents."],
    },
  },
  {
    id: "vacancy",
    section: "social",
    fullRange: true,
    name: "Rental vacancy",
    group: "Housing and homelessness",
    tagline: "Share of purpose-built rental apartments that are vacant, by city (CMHC, October each year).",
    filters: [{ dim: "region", label: "Cities", default: ["Canada", "Toronto", "Vancouver"], multi: true }],
    intervals: ["all"],
    rate: true,
    charts: [
      { kind: "level", title: "Vacancy rate over time", note: "% of units" },
      { kind: "yoyDiff", title: "Change on the previous year", note: "Percentage points" },
      { kind: "latest", title: "Latest year, selected cities" },
      { kind: "latestAll", title: "All centres, latest year", note: "Lowest = tightest rental markets" },
    ],
    kpis: ["latest", "yoyDiff", "high", "avg5"],
    about: {
      what: "The vacancy rate is the share of rental units that are empty and available for immediate rent at the time of the survey.",
      why: ["A vacancy rate near 3% is often considered a balanced market", "Low vacancy pushes rents up and makes finding housing harder", "A leading signal for homelessness pressure"],
      reading: ["Covers structures of six units and over.", "Compare with the rents page: falling vacancy usually precedes faster rent growth."],
    },
  },
  {
    id: "shelters",
    section: "social",
    fullRange: true,
    name: "Shelter capacity",
    group: "Housing and homelessness",
    tagline: "Beds and shelters for people experiencing homelessness, by province and type of shelter.",
    filters: [
      { dim: "region", label: "Region", default: "Canada" },
      { dim: "shelter_type", label: "Shelter type", default: "Emergency shelters" },
      { dim: "measure", label: "Count", default: "Beds" },
      { dim: "population", label: "Clientele", default: ["Total"], multi: true },
    ],
    intervals: ["all"],
    charts: [
      { kind: "level", title: "Capacity over time" },
      { kind: "yoy", title: "Change on the previous year" },
      { kind: "latestAll", title: "Latest year by clientele", note: "Your selection highlighted" },
      { kind: "latestAcross", dim: "region", title: "Latest year by province", note: "First selected clientele" },
    ],
    kpis: ["latest", "yoy", "periodReturn", "high"],
    about: {
      what: "Counts of permanent beds and facilities in emergency shelters, transitional housing and violence-against-women shelters, from the National Service Provider List maintained by Housing, Infrastructure and Communities Canada.",
      why: ["Shows the system's capacity to respond to homelessness", "Compare with shelter use to see how full the system is", "Differences by province and clientele (youth, women, families)"],
      reading: ["Permanent beds only: seasonal and overflow beds are excluded.", "Capacity is not need: many people experiencing homelessness never use a shelter."],
    },
  },
  {
    id: "shelteruse",
    section: "social",
    fullRange: true,
    name: "Shelter use",
    group: "Housing and homelessness",
    tagline: "How many people used emergency shelters each year, how full shelters were, and chronic homelessness.",
    shard: { dim: "measure", label: "Measure", default: "People who used an emergency shelter" },
    filters: [{ dim: "group", label: "Breakdown", default: ["All shelter users", "All shelters"], multi: true }],
    intervals: ["all"],
    charts: [
      { kind: "level", title: "Over time" },
      { kind: "pop", title: "Change on the previous year", note: "%" },
      { kind: "rebased", title: "Index, first year shown = 100" },
      { kind: "latestAll", title: "Latest year by breakdown", note: "Length of stay and age measures only" },
    ],
    kpis: ["latest", "pop", "high", "periodReturn"],
    about: {
      what: "The National Shelter Study estimates emergency shelter use across Canada from shelter records (HIFIS and other systems), counting each person once per year. Chronic homelessness means 180+ days of homelessness in a year, or recurrent episodes over three years.",
      why: ["The longest consistent national series on homelessness (2005 onward)", "Shows whether more people are entering homelessness or staying longer", "Shows which age groups are most affected"],
      reading: ["Hand-entered from the 2023 update; the next update will be added when published.", "Emergency shelters only: people sleeping outside, in cars or couch-surfing are not counted.", "2020 and 2021 were affected by pandemic capacity limits.", "Age rates are published for 2005, 2010, 2016 and 2023 only."],
    },
  },
];

export const SECTIONS: { id: Section; name: string; home: string }[] = [
  { id: "economy", name: "Economy", home: "/" },
  { id: "social", name: "Social conditions", home: "/social/" },
];
export const sectionOf = (i: Indicator): Section => i.section ?? "economy";
export const groupsIn = (s: Section) =>
  Array.from(new Set(INDICATORS.filter((i) => sectionOf(i) === s).map((i) => i.group)));
export const GROUPS = Array.from(new Set(INDICATORS.map((i) => i.group)));
export const byId = (id: string) => INDICATORS.find((i) => i.id === id)!;
