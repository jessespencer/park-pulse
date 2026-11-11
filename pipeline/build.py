"""Build Park Pulse JSON from the NPS Visitor Use Statistics Data Package.

Steps
  1. Load monthly recreation visits (Statistic = TRV) into a long table.
  2. Left-join park metadata from data/raw/nps_parks.json (if fetched).
  3. Compute share of year, index vs the park's 1979-2019 monthly median, YoY.
  4. Annotate known breaks (shutdowns, COVID, published negative values).
  5. Export one JSON per park + a national index to app/public/data.

Values are exported exactly as published. Nothing is smoothed or interpolated:
a month with no row is null, never filled.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

import duckdb

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw"
OUT = HERE.parent / "app" / "public" / "data"

BASELINE = (1979, 2019)
# "Typical recent year" for fingerprints and When to go: complete years
# 2015-2025, skipping 2020 (COVID closures distort the shape).
PROFILE_YEARS = [y for y in range(2015, 2026) if y != 2020]
MIN_PROFILE_YEARS = 3

NATIONAL_EVENTS = [
    {"year": 2013, "month": 10, "kind": "shutdown",
     "text": "Federal government shutdown, Oct 1–16, 2013: most NPS units closed."},
    {"year": 2018, "month": 12, "kind": "shutdown",
     "text": "Federal government shutdown began Dec 22, 2018; many parks stayed partly open with little staff, so counts may be incomplete."},
    {"year": 2019, "month": 1, "kind": "shutdown",
     "text": "Shutdown continued to Jan 25, 2019; counts may be incomplete."},
    {"year": 2020, "month": 3, "kind": "covid",
     "text": "COVID-19: closures began mid-March 2020 (timing varied by park)."},
    {"year": 2020, "month": 4, "kind": "covid",
     "text": "COVID-19: many parks fully closed."},
    {"year": 2020, "month": 5, "kind": "covid",
     "text": "COVID-19: phased reopenings began; many facilities still closed."},
    {"year": 2020, "month": 6, "kind": "covid",
     "text": "COVID-19: reopenings continued, often with capacity limits."},
]


# IRMA Stats unit codes vs NPS API park codes don't line up one-to-one. Each entry maps
# a visitation unit to the API record that holds its location/states (`api`), plus
# the unit's own name/designation when the API merged it into a larger record or
# leaves designation blank. Location-only aliases are approximate (the merged unit's
# point). Units with no entry and no API match get designation "Not in NPS API".
CROSSWALK: dict[str, dict] = {
    # Counted separately by IRMA, one combined API record (SEKI).
    "SEQU": {"api": "SEKI", "name": "Sequoia National Park", "short": "Sequoia", "designation": "National Park"},
    "KICA": {"api": "SEKI", "name": "Kings Canyon National Park", "short": "Kings Canyon", "designation": "National Park"},
    # API leaves designation blank.
    "NPSA": {"designation": "National Park"},
    # Renamed units: the API record is the same unit under its current name.
    # (Gateway Arch NP is JEFF in both sources and needs no entry.)
    "JEFM": {"api": "THJE"},  # Thomas Jefferson Memorial, DC
    "PERL": {"api": "VALR"},  # WWII Valor in the Pacific → Pearl Harbor National Memorial
    "OBRI": {"api": "OBED"},  # Obed Wild & Scenic River
    "NCPE": {"api": "NACE"},  # National Capital Parks-East
    # Units the API folds into a larger record.
    "LACH": {"api": "NOCA", "name": "Lake Chelan National Recreation Area", "short": "Lake Chelan", "designation": "National Recreation Area"},
    "ROLA": {"api": "NOCA", "name": "Ross Lake National Recreation Area", "short": "Ross Lake", "designation": "National Recreation Area"},
    "JODR": {"api": "GRTE", "name": "John D. Rockefeller, Jr. Memorial Parkway", "short": "Rockefeller Parkway", "designation": "Parkway"},
    "FOCA": {"api": "TIMU", "name": "Fort Caroline National Memorial", "short": "Fort Caroline", "designation": "National Memorial"},
    "NCPC": {"api": "NAMA", "name": "National Capital Parks-Central", "short": "Natl Capital Parks-Central", "designation": "Other"},
    "PRPA": {"api": "WHHO", "name": "President's Park", "short": "President's Park", "designation": "Other"},
    # Former units with no API record (no visitation reported after the year shown).
    "JOFK": {"name": "John F. Kennedy Center for the Performing Arts (to 1994)", "designation": "Former NPS unit"},
    "NACA": {"name": "National Capital Parks (to 1996)", "designation": "Former NPS unit"},
    "NAVC": {"name": "National Visitor Center (to 1981)", "designation": "Former NPS unit"},
}


def park_meta(code: str, meta: dict, has_meta: bool) -> dict:
    """Name/designation/states/location for a visitation unit (see CROSSWALK)."""
    if not has_meta:
        return {"code": code, "name": code, "shortName": code, "designation": "Unknown",
                "states": [], "lat": None, "lon": None}
    cw = CROSSWALK.get(code, {})
    row = meta.get(cw.get("api", code))
    name = cw.get("name") or (row[1] if row else None) or code
    return {
        "code": code,
        "name": name,
        "shortName": cw.get("short") or (None if "name" in cw else (row[2] if row else None)) or name,
        "designation": cw.get("designation") or (row[3] if row else None) or ("Other" if row else "Not in NPS API"),
        "states": [s for s in ((row[4] if row else "") or "").split(",") if s],
        "lat": float(row[5]) if row and row[5] else None,
        "lon": float(row[6]) if row and row[6] else None,
    }


def r(x, nd):
    return None if x is None else round(float(x), nd)


def main() -> None:
    csv = RAW / "Main_Data.csv"
    eml = RAW / "NPS_VUStats_Data_2025_metadata.xml"
    if not csv.exists():
        sys.exit("STOP: data/raw/Main_Data.csv missing — run fetch_data.py first.")
    pub = re.search(r"<pubDate>([^<]+)</pubDate>", eml.read_text(encoding="utf-8"))
    as_of = pub.group(1) if pub else None

    con = duckdb.connect()
    # 1. long table
    con.execute(f"""
        create table visits as
        select upper(UnitCode) as park_code, Year::int as year, Month::int as month,
               Value::bigint as recreation_visits
        from read_csv('{csv}', header=true,
             columns={{'UnitCode':'VARCHAR','Year':'INT','Month':'INT','Statistic':'VARCHAR','Value':'BIGINT'}})
        where Statistic = 'TRV'
    """)
    dupes = con.execute("""select count(*) from (select park_code,year,month from visits
                           group by all having count(*)>1)""").fetchone()[0]
    if dupes:
        sys.exit(f"STOP: {dupes} duplicate park/year/month rows — format not as expected.")
    bad_month = con.execute("select count(*) from visits where month not between 1 and 12").fetchone()[0]
    if bad_month:
        sys.exit(f"STOP: {bad_month} rows with month outside 1-12.")

    # 2. metadata
    meta_path = RAW / "nps_parks.json"
    has_meta = meta_path.exists()
    if has_meta:
        con.execute(f"""create table meta as select * from read_json('{meta_path}',
            columns={{'parkCode':'VARCHAR','fullName':'VARCHAR','name':'VARCHAR',
                      'designation':'VARCHAR','states':'VARCHAR','latitude':'VARCHAR','longitude':'VARCHAR'}})""")
    else:
        print("warning: nps_parks.json missing — run fetch_metadata.py (needs NPS_API_KEY). "
              "Exporting with park codes only.", file=sys.stderr)
        con.execute("""create table meta(parkCode varchar, fullName varchar, name varchar,
                       designation varchar, states varchar, latitude varchar, longitude varchar)""")

    # 3. measures
    con.execute(f"""
        create table measures as
        with yr as (
            select park_code, year, sum(recreation_visits) as year_total, count(*) as n_months
            from visits group by all
        ), base as (
            select park_code, month, median(recreation_visits) as base_median
            from visits where year between {BASELINE[0]} and {BASELINE[1]} group by all
        )
        select v.*, yr.year_total, yr.n_months,
               case when yr.n_months = 12 and yr.year_total > 0
                    then v.recreation_visits / yr.year_total end as share,
               case when b.base_median > 0
                    then 100.0 * v.recreation_visits / b.base_median end as idx,
               case when p.recreation_visits > 0
                    then v.recreation_visits::double / p.recreation_visits - 1 end as yoy
        from visits v
        join yr using (park_code, year)
        left join base b using (park_code, month)
        left join visits p on p.park_code = v.park_code and p.month = v.month and p.year = v.year - 1
    """)

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "parks").mkdir(parents=True)

    meta = {row[0]: row for row in con.execute("select * from meta").fetchall()}
    codes = [c for (c,) in con.execute("select distinct park_code from visits order by 1").fetchall()]
    rows = con.execute("""select park_code, year, month, recreation_visits, share, idx, yoy, n_months
                          from measures order by park_code, year, month""").fetchall()
    by_park: dict[str, list] = {}
    for row in rows:
        by_park.setdefault(row[0], []).append(row)

    index = []
    for code in codes:
        prow = by_park[code]
        y0, y1 = prow[0][1], max(x[1] for x in prow)
        n = y1 - y0 + 1
        grid = lambda: [[None] * 12 for _ in range(n)]  # noqa: E731
        vis, sh, ix, yy = grid(), grid(), grid(), grid()
        complete = set()
        notes = []
        for _, y, m, v, s, i, d, nm in prow:
            k = y - y0
            vis[k][m - 1] = int(v)
            sh[k][m - 1] = r(s, 5)
            ix[k][m - 1] = r(i, 1)
            yy[k][m - 1] = r(d, 3)
            if nm == 12:
                complete.add(y)
            if v < 0:
                notes.append({"year": y, "month": m, "kind": "data",
                              "text": f"Published value is negative ({v:,}); NPS appears to have entered a correction against an earlier month. Shown as published."})
            if y == 2020 and v == 0:
                notes.append({"year": y, "month": m, "kind": "covid",
                              "text": "This park reported zero recreation visits (closed)."})
        notes += [e for e in NATIONAL_EVENTS if y0 <= e["year"] <= y1]

        annual = [sum(x for x in row if x is not None) if (y0 + k) in complete else None
                  for k, row in enumerate(vis)]
        prof_years = [y for y in PROFILE_YEARS if y in complete and annual[y - y0]]
        profile = None
        if len(prof_years) >= MIN_PROFILE_YEARS:
            profile = [r(sum(sh[y - y0][m] for y in prof_years) / len(prof_years), 5) for m in range(12)]
        rec = park_meta(code, meta, has_meta)
        summary = {
            **rec,
            "firstYear": y0, "lastYear": y1,
            "profile": profile,
            "profileYears": prof_years,
            "peakMonth": (max(range(12), key=lambda m: profile[m]) + 1) if profile else None,
            "peakiness": r(sum(sorted(profile, reverse=True)[:3]), 4) if profile else None,
            "avgAnnual": round(sum(annual[y - y0] for y in prof_years) / len(prof_years)) if prof_years else None,
            "latestAnnual": annual[-1],
        }
        index.append(summary)
        detail = {**summary, "years": list(range(y0, y1 + 1)), "visits": vis, "share": sh,
                  "index": ix, "yoy": yy, "annual": annual,
                  "notes": sorted(notes, key=lambda e: (e["year"], e["month"]))}
        (OUT / "parks" / f"{code}.json").write_text(json.dumps(detail, separators=(",", ":")))

    # national
    nat = con.execute(f"""
        with t as (select year, month, sum(recreation_visits) v, count(distinct park_code) units
                   from visits group by all),
             yt as (select year, sum(v) yt from t group by 1),
             b as (select month, median(v) bm from t where year between {BASELINE[0]} and {BASELINE[1]} group by 1)
        select t.year, t.month, t.v, t.v / yt.yt, 100.0 * t.v / b.bm, t.units
        from t join yt using(year) join b using(month) order by 1,2
    """).fetchall()
    ny0, ny1 = nat[0][0], nat[-1][0]
    nn = ny1 - ny0 + 1
    nv = [[None] * 12 for _ in range(nn)]
    ns = [[None] * 12 for _ in range(nn)]
    ni = [[None] * 12 for _ in range(nn)]
    for y, m, v, s, i, _ in nat:
        nv[y - ny0][m - 1] = int(v)
        ns[y - ny0][m - 1] = r(s, 5)
        ni[y - ny0][m - 1] = r(i, 1)
    (OUT / "national.json").write_text(json.dumps({
        "code": "NPS", "name": "All NPS units (national total)", "firstYear": ny0, "lastYear": ny1,
        "years": list(range(ny0, ny1 + 1)), "visits": nv, "share": ns, "index": ni,
        "notes": NATIONAL_EVENTS}, separators=(",", ":")))

    (OUT / "index.json").write_text(json.dumps({
        "asOf": as_of, "built": date.today().isoformat(), "hasMetadata": has_meta,
        "baseline": BASELINE, "profileYears": PROFILE_YEARS,
        "source": "NPS Visitor Use Statistics Data Package, 2025 (CC0) — https://irma.nps.gov/DataStore/Reference/Profile/2317666",
        "parks": index}, separators=(",", ":")))
    size = sum(f.stat().st_size for f in OUT.rglob("*.json"))
    print(f"ok: {len(index)} parks, {ny0}-{ny1}, metadata={'yes' if has_meta else 'NO'}, "
          f"{size / 1e6:.1f} MB → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
