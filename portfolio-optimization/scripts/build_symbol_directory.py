"""Build the client-side US-listed symbol directory from Nasdaq Trader snapshots.

Usage: python3 scripts/build_symbol_directory.py nasdaqlisted.txt otherlisted.txt
The source files are available at https://www.nasdaqtrader.com/dynamic/SymDir/.
"""

import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path


SYMBOL = re.compile(r"[A-Z0-9.^=-]{1,15}\Z")


def clean_name(name):
    name = name.strip()
    name = re.sub(r"\s+-\s+Common Stock\Z", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+Common Stock\Z", "", name, flags=re.IGNORECASE)
    return name


def read_symbols(path, *, nasdaq):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = csv.reader(handle, delimiter="|")
        next(rows)
        for row in rows:
            if not row or row[0].startswith("File Creation Time:"):
                continue
            symbol, name = row[0].strip(), clean_name(row[1])
            is_test = row[3] if nasdaq else row[6]
            is_etf = row[6] if nasdaq else row[4]
            if is_test != "N" or not SYMBOL.fullmatch(symbol) or not name:
                continue
            yield [symbol, name, "ETF" if is_etf == "Y" else "Listed security"]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Provide nasdaqlisted.txt and otherlisted.txt")
    listed, other = (Path(value) for value in sys.argv[1:])
    symbols = {}
    for path, nasdaq in ((listed, True), (other, False)):
        for entry in read_symbols(path, nasdaq=nasdaq):
            symbols.setdefault(entry[0], entry)
    stamp = next(
        line for line in reversed(listed.read_text().splitlines())
        if line.startswith("File Creation Time:")
    ).split(":", 1)[1].strip()[:8]
    output = {
        "asOf": datetime.strptime(stamp, "%m%d%Y").date().isoformat(),
        "source": "Nasdaq Trader symbol directory",
        "assets": [symbols[key] for key in sorted(symbols)],
    }
    destination = Path(__file__).resolve().parents[1] / "public/symbol-directory.json"
    destination.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {len(symbols):,} listed symbols to {destination}")


if __name__ == "__main__":
    main()
