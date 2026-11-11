"""Download the NPS Visitor Use Statistics Data Package (CC0) and verify checksums.

Source: https://irma.nps.gov/DataStore/Reference/Profile/2317666
Fails loudly if a file can't be downloaded or its checksum doesn't match the
one published in the package's EML metadata. Never substitutes data.
"""

from __future__ import annotations

import hashlib
import re
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "data" / "raw"
REFERENCE = 2317666
FILES = {
    "NPS_VUStats_Data_2025_metadata.xml": 756961,
    "Main_Data.csv": 756959,
}


def download(name: str, file_id: int) -> Path:
    url = f"https://irma.nps.gov/DataStore/DownloadFile/{file_id}?Reference={REFERENCE}"
    dest = RAW / name
    print(f"downloading {name} …", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    return dest


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    meta = download("NPS_VUStats_Data_2025_metadata.xml", FILES["NPS_VUStats_Data_2025_metadata.xml"])
    eml = meta.read_text(encoding="utf-8")
    if "eml://ecoinformatics.org" not in eml:
        sys.exit("STOP: metadata file is not EML — the source format changed.")

    csv = download("Main_Data.csv", FILES["Main_Data.csv"])
    m = re.search(r"Main_Data\.csv.*?([0-9a-f]{32})", eml, re.S)
    if not m:
        sys.exit("STOP: no checksum for Main_Data.csv in the EML metadata.")
    got = hashlib.md5(csv.read_bytes()).hexdigest()
    if got != m.group(1):
        sys.exit(f"STOP: Main_Data.csv checksum {got} != published {m.group(1)}")
    header = csv.open(encoding="utf-8").readline().strip()
    if header != '"UnitCode","Year","Month","Statistic","Value"':
        sys.exit(f"STOP: unexpected CSV header: {header}")
    print("ok: checksum and header verified", file=sys.stderr)


if __name__ == "__main__":
    main()
