"""Fetch park metadata (name, designation, states, lat/long) from the NPS API.

Requires a free key from https://www.nps.gov/subjects/developer/get-started.htm
in the NPS_API_KEY env var (or pipeline/.env). The key is sent as a header,
never in the URL. Without a key this exits — it does not fall back to scraping.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "data" / "raw" / "nps_parks.json"


def load_key() -> str | None:
    if key := os.environ.get("NPS_API_KEY"):
        return key.strip()
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("NPS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> None:
    key = load_key()
    if not key:
        sys.exit(
            "NPS_API_KEY is not set. Get a free key at "
            "https://www.nps.gov/subjects/developer/get-started.htm and export it "
            "(or put NPS_API_KEY=... in pipeline/.env). Not scraping as a fallback."
        )
    parks: list[dict] = []
    start = 0
    while True:
        req = urllib.request.Request(
            f"https://developer.nps.gov/api/v1/parks?limit=100&start={start}",
            headers={"X-Api-Key": key, "User-Agent": "park-pulse-pipeline"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.load(r)
        data = page.get("data")
        if not isinstance(data, list):
            sys.exit(f"STOP: unexpected NPS API response shape: {list(page)[:5]}")
        parks.extend(
            {
                "parkCode": p.get("parkCode", "").upper(),
                "fullName": p.get("fullName"),
                "name": p.get("name"),
                "designation": p.get("designation"),
                "states": p.get("states"),
                "latitude": p.get("latitude"),
                "longitude": p.get("longitude"),
            }
            for p in data
        )
        start += len(data)
        if not data or start >= int(page.get("total", 0)):
            break
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(parks, indent=1))
    print(f"ok: {len(parks)} parks → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
