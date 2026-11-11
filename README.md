# Park Pulse — when America's national parks get crowded

An interactive, static web app showing the monthly rhythm of recreation visits
across the National Park System as calendar heatmaps, 1979–2025.

**Views**

- **Trailhead** (home). Search, "this month in the parks" (the quietest and busiest national parks right now), and a way into each tool.
- **Park heatmap.** Rows are years and columns are months. Color can show absolute visits, share of the year, or an index vs. the park's own 1979–2019 median for that month. Hover or tap a cell for the exact count. Shutdowns and closures are flagged.
- **Fingerprints.** Each park's typical 12-month shape. Sort by peak month, peakiness (the share of visits in the busiest 3 months), or total visits.
- **When to go.** Pick a month and optionally a region or state to get a map and a ranked list of the quietest parks. Parks are ranked by *share of their own year* that falls in that month, so big and small parks compare fairly.
- **Season drift.** How one park's peak month and busy season moved from decade to decade.
- **Compare.** Two parks side by side with linked hover.

Every selection lives in the URL, so any view can be shared as a link.

The look is "Trailhead '84", a nod to 1980s park signage and outdoor catalogs. It has Day and Night themes, and its illustrations are original, using no NPS marks.

## Run it

```bash
# 1. Data (Python 3.11+, DuckDB)
cd pipeline
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python fetch_data.py          # downloads + verifies the NPS package (~72 MB)
NPS_API_KEY=... .venv/bin/python fetch_metadata.py   # park names, designations, states, lat/long
.venv/bin/python build.py               # writes app/public/data/*.json

# 2. App (Node 20+)
cd ../app
npm install
npm run dev        # or: npm run build → static site in app/dist/
```

You can get an NPS API key for free at <https://www.nps.gov/subjects/developer/get-started.htm>.
Set it as the `NPS_API_KEY` env var or put it in `pipeline/.env`, which is gitignored.
Without a key, `build.py` still runs, but parks appear only by their four-letter code. Search by
name, the designation filter, state and region filters, and the map all stay empty until
the metadata is fetched.

## Sources

| What | Source | License |
| --- | --- | --- |
| Monthly recreation visits by park, 1979–2025 | [NPS Visitor Use Statistics Data Package, 2025](https://irma.nps.gov/DataStore/Reference/Profile/2317666) (`Main_Data.csv`, statistic `TRV`), via [data.gov](https://catalog.data.gov/dataset/nps-visitor-use-statistics-data-package-2025) | CC0 1.0 |
| Park name, designation, states, lat/long | [NPS API](https://www.nps.gov/subjects/developer/api-documentation.htm) `/parks` | Public domain (U.S. Government work) |
| US state outlines | [us-atlas](https://github.com/topojson/us-atlas) (Census cartographic boundaries) | ISC / public domain |

**As of:** the data package was published **2026-03-26** and covers January 1979 through
December 2025. 2025 is the latest finalized year. The app's footer shows the as-of
date from the package's metadata.

## How the measures work

- **Share of year** is a month's visits divided by that calendar year's total. It's computed only for years with all 12 months reported.
- **Index vs. normal** is 100 × visits ÷ the park's median for that calendar month over 1979–2019. 100 means typical, 200 means double. The index uses a teal↔rust diverging scale around a neutral midpoint. Visits and share use a single-hue "pine" ramp whose lightness is strictly monotonic. Both are colorblind-safe, and each theme gets its own validated steps (see `app/src/scales.ts`).
- **Typical profile** (fingerprints and When to go) is the mean monthly share across complete years 2015–2025, excluding 2020. A park needs at least 3 such years to get a profile.
- **Off-season** in When to go means a month with under 2% of a park's year. Such months usually mean seasonal closure. They're hidden by default, and a checkbox shows them.

## Caveats

- **Counts are shown exactly as NPS published them.** Nothing is smoothed, interpolated, or filled in. A month with no row in the source shows as hatched "no data".
- **Counting methods vary by park and change over time.** Methods include traffic counters with per-vehicle multipliers, entrance counts, and sampling, and NPS periodically revises them. A sudden step in a park's heatmap can be a method change rather than a real change in crowds. NPS documents these per park only, in each park's "Visitor Use Counting Procedures" report on [IRMA Stats](https://irma.nps.gov/Stats/). The bulk package doesn't include them, so the app links to the report from every park page rather than annotating method changes inline.
- **Annotated breaks:**
  - The federal shutdown of Oct 1–16, 2013.
  - The shutdown of Dec 22, 2018 – Jan 25, 2019. Many parks stayed partly open with little staff, so counts may be incomplete.
  - COVID-19 closures, March–June 2020, plus every 2020 month in which a park reported zero visits.
- **Four published values are negative**: SAJH 2002-11, LIBO 2003-01, MORR 2011-12 and RUCA 2004-11. They look like NPS correction entries. They're shown as published and flagged as data notes.
- **Preliminary data.** This build uses only the finalized 2025 package. NPS posts current-year (2026) monthly numbers on IRMA Stats as *preliminary* and revises them, so they aren't included. If you add them later, label them preliminary.
- **IRMA and NPS API codes don't line up one-to-one.** For example, IRMA counts Sequoia and Kings Canyon separately while the API has a single SEKI record, and JEFM is the Thomas Jefferson Memorial, not Gateway Arch (JEFF). `CROSSWALK` in `pipeline/build.py` lists each mapping explicitly. Units the API folds into a larger record use that record's location. The API leaves designation blank for about a dozen DC memorials, and those show as "Other".
- **Designations are current, not historical.** The data uses today's designations: Chiricahua became the 64th National Park on Oct 20, 2026, and it's included under "National Parks" even though its 1979–2025 counts are from its years as a national monument. Redwood ("National and State Parks") also counts as a National Park.
- "Recreation visits" are not unique visitors. One person entering a park on three days counts as three visits.
- The map uses an Albers USA projection, which leaves out some territories (Guam, American Samoa, the Northern Mariana Islands). Those parks still appear in the ranked list.

## Layout

```
pipeline/   Python + DuckDB: fetch_data.py, fetch_metadata.py, build.py
app/        Vite + TypeScript + D3 static app; app/public/data/ is generated by build.py
```

## License

The code is released under the [MIT License](LICENSE). The data in `app/public/data/` is derived from public-domain sources (the CC0 NPS visitation package and NPS API metadata) and isn't covered by the MIT license; it carries no added restrictions. The fonts (Fraunces and Public Sans) are bundled at build time under the SIL Open Font License.

Not affiliated with or endorsed by the National Park Service.
