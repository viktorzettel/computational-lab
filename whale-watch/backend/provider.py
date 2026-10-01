"""Public 13f.info filing mirror, with strict units/schema checks and a disk cache."""
import hashlib
import json
import math
import os
import re
import threading
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import httpx

BASE = "https://13f.info"


class DataError(Exception):
    pass


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return " ".join((x.text() if isinstance(x, Node) else x) for x in self.children).strip()

    def find(self, tag=None, **attrs):
        result = []
        for child in self.children:
            if isinstance(child, Node):
                if (tag is None or child.tag == tag) and all(child.attrs.get(k) == v for k, v in attrs.items()):
                    result.append(child)
                result.extend(child.find(tag, **attrs))
        return result


class Document(HTMLParser):
    VOID = {"meta", "link", "input", "img", "br", "hr", "source", "area", "base", "embed", "wbr", "col", "param"}

    def __init__(self, content):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data.strip())


def clean(node):
    return " ".join(node.text().split())


def parse_manager(content, cik):
    root = Document(content).root
    tables = root.find("table", id="managerFilings")
    if not tables:
        raise DataError("The provider's filing index is unavailable or changed format.")
    headers = [clean(n) for n in tables[0].find("th")]
    if headers != ["Quarter", "Holdings", "Value ($000)", "Top Holdings", "Form Type", "Date Filed", "Filing ID"]:
        raise DataError("The filing index columns changed; values have not been guessed.")
    result = []
    for row in tables[0].find("tr"):
        cells = [n for n in row.children if isinstance(n, Node) and n.tag == "td"]
        if not cells:
            continue
        if len(cells) != 7:
            raise DataError("Incomplete filing index row.")
        values = list(map(clean, cells))
        match = re.fullmatch(r"Q([1-4]) (\d{4})", values[0])
        links = cells[0].find("a")
        if not match or not links or not re.fullmatch(r"\d{18}", values[6]):
            raise DataError("Invalid filing identity.")
        path = links[0].attrs.get("href", "")
        if not path.startswith(f"/13f/{values[6]}-"):
            raise DataError("Filing link does not match its accession.")
        form = values[4]
        if form not in {"13F-HR", "RESTATEMENT", "NEW HOLDINGS"}:
            raise DataError(f"Unsupported amendment type: {form}")
        result.append({"quarter": f"{match[2]}-Q{match[1]}", "count": int(values[1].replace(",", "")),
                       "value": int(values[2].replace(",", "")) * 1000,
                       "form": form, "filed": datetime.strptime(values[5], "%m/%d/%Y").date().isoformat(),
                       "accession": values[6], "path": path, "cik": cik})
    if not result:
        raise DataError("No public 13F holdings reports found.")
    return result


def filing_links(content, filing):
    root = Document(content).root
    tables = root.find("table", id="filingAggregated")
    if not tables or tables[0].attrs.get("data-url") != f"/data/13f/{filing['accession']}":
        raise DataError("No matching public holdings table was found.")
    headers = [clean(n) for n in tables[0].find("th")]
    if headers != ["Sym", "Issuer Name", "Cl", "CUSIP", "Value ($000)", "%", "Shares", "Principal", "Option Type"]:
        raise DataError("Holdings columns or value units changed.")
    sec = [n.attrs.get("href", "") for n in root.find("a")
           if n.attrs.get("href", "").startswith("https://www.sec.gov/Archives/edgar/data/")]
    if not sec:
        raise DataError("The filing's original SEC source is missing.")
    return tables[0].attrs["data-url"], sec[0]


def number(value, nullable=False):
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise DataError("Invalid numeric value in the holdings table.")
    return value


def merge_positions(positions):
    merged = {}
    for position in positions:
        key = position["id"]
        if key not in merged:
            merged[key] = dict(position)
        else:
            merged[key]["value"] += position["value"]
            merged[key]["quantity"] += position["quantity"]
    return list(merged.values())


def parse_holdings(payload, filing):
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or len(rows) != filing["count"]:
        raise DataError("The holdings count does not match the filing index.")
    result = []
    for row in rows:
        if not isinstance(row, list) or len(row) != 9:
            raise DataError("Incomplete holdings row.")
        symbol, issuer, share_class, cusip, value, _, shares, principal, option = row
        if not all(isinstance(x, str) and x.strip() for x in (issuer, share_class, cusip)):
            raise DataError("Missing security identity.")
        if symbol is not None and not isinstance(symbol, str):
            raise DataError("Invalid ticker.")
        if option not in (None, "put", "call") or (shares is None) == (principal is None):
            raise DataError("Unknown option or quantity basis.")
        basis = "shares" if shares is not None else "principal"
        kind = option or ("principal" if basis == "principal" else "shares")
        key = "|".join((cusip.strip(), share_class.strip().upper(), option or "", basis))
        result.append({"id": key, "symbol": symbol, "issuer": issuer, "class": share_class,
                       "cusip": cusip, "kind": kind, "basis": basis,
                       "value": number(value) * 1000,
                       "quantity": number(shares if basis == "shares" else principal)})
    # The mirror rounds each row to $000; tolerate at most $1,000 per row.
    if abs(sum(p["value"] for p in result) - filing["value"]) > max(len(rows) * 1000, 1000):
        raise DataError("The holdings value does not reconcile with the filing total.")
    return merge_positions(result)


class Cache:
    def __init__(self, path):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.guard = threading.Lock()
        self.locks = {}

    def load(self, key, loader, ttl, refresh=False):
        with self.guard:
            lock = self.locks.setdefault(key, threading.Lock())
        with lock:
            file = self.path / (hashlib.sha256(key.encode()).hexdigest() + ".json")
            cached = None
            try:
                cached = json.loads(file.read_text())
                if not isinstance(cached.get("fetchedAt"), str) or "data" not in cached:
                    cached = None
            except (OSError, ValueError, AttributeError):
                pass
            if cached and not refresh and time.time() - datetime.fromisoformat(cached["fetchedAt"]).timestamp() < ttl:
                return cached["data"], cached["fetchedAt"], False
            try:
                data = loader()
                at = datetime.now(timezone.utc).isoformat()
                tmp = file.with_suffix(".tmp")
                tmp.write_text(json.dumps({"data": data, "fetchedAt": at}))
                os.replace(tmp, file)
                return data, at, False
            except (httpx.HTTPError, DataError, ValueError, OSError):
                if cached:
                    return cached["data"], cached["fetchedAt"], True
                raise


class Provider:
    def __init__(self, cache):
        self.cache = cache
        self.client = httpx.Client(timeout=30, follow_redirects=True,
                                   headers={"User-Agent": "WhaleWatch/0.1 personal research"},
                                   limits=httpx.Limits(max_connections=3, max_keepalive_connections=3))
        self.rate_lock = threading.Lock()
        self.next_request = 0

    def get(self, path):
        with self.rate_lock:
            time.sleep(max(0, self.next_request - time.monotonic()))
            self.next_request = time.monotonic() + 0.35
        response = self.client.get(BASE + path)
        response.raise_for_status()
        return response

    def history(self, manager, refresh=False):
        return self.cache.load("manager-v1:" + manager,
                               lambda: parse_manager(self.get("/manager/" + manager).text, manager[:10]),
                               ttl=900, refresh=refresh)

    def filing(self, filing, refresh=False):
        def fetch():
            path, sec = filing_links(self.get(filing["path"]).text, filing)
            positions = parse_holdings(self.get(path).json(), filing)
            return {"positions": positions, "secUrl": sec, "mirrorUrl": BASE + filing["path"], **filing}
        return self.cache.load("filing-v1:" + filing["accession"], fetch, ttl=86400 * 30, refresh=refresh)
