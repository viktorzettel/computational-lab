"""Recent public analyst calls. Read public HTML tables only; never invent missing names."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from html.parser import HTMLParser
import math
import re
from typing import Literal
from urllib.parse import urljoin, urlparse, quote

import httpx
from pydantic import BaseModel, Field

from .models import Asset
from .providers.base import ProviderError

SourceName = Literal["stockanalysis", "finviz"]
SOURCE_LABELS = {"stockanalysis": "Stock Analysis · TipRanks", "finviz": "Finviz"}


class AnalystCall(BaseModel):
    id: str
    symbol: str
    date: str
    analyst: str | None = None
    firm: str
    rating: str | None = None
    prior_rating: str | None = None
    action: str | None = None
    price_target: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    prior_target: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    currency: str = "USD"
    source: SourceName
    source_url: str
    analyst_url: str | None = None


class AnalystSource(BaseModel):
    id: SourceName
    name: str
    url: str
    status: Literal["available", "empty", "unavailable"]
    count: int = 0
    message: str


class AnalystTargetsResponse(BaseModel):
    symbol: str
    company: str
    currency: str
    status: Literal["available", "empty", "unavailable", "unsupported", "demo"]
    records: list[AnalystCall] = Field(default_factory=list)
    sources: list[AnalystSource] = Field(default_factory=list)
    retrieved_at: int | None = None
    cached: bool = False
    stale: bool = False
    warning: str | None = None
    coverage: str = "Recent public calls only; this is not a complete analyst history."
    message: str | None = None


def source_url(source: SourceName, symbol: str) -> str:
    if source == "stockanalysis":
        return f"https://stockanalysis.com/stocks/{quote(symbol.lower(), safe='')}/ratings/"
    return f"https://finviz.com/stock?t={quote(symbol, safe='')}"


def supported(asset: Asset) -> bool:
    return asset.type == "stock" and asset.currency == "USD" and bool(re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,14}", asset.symbol))


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    children: list[Element | str] = field(default_factory=list)

    def find(self, tag: str | None = None):
        for child in self.children:
            if isinstance(child, Element):
                if tag is None or child.tag == tag:
                    yield child
                yield from child.find(tag)

    def has_class(self, name: str) -> bool:
        return name in self.attrs.get("class", "").split()

    def text(self) -> str:
        # Do not treat scripts, hidden payloads, or stars as published call text.
        if self.tag in {"script", "style", "svg"} or self.has_class("star-rating-wrap"):
            return ""
        return re.sub(r"\s+", " ", "".join(c.text() if isinstance(c, Element) else c for c in self.children)).strip()


class PageParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.root = Element("document", {})
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        element = Element(tag, dict((k, v or "") for k, v in attrs))
        self.stack[-1].children.append(element)
        if tag not in self.VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def cells(row: Element) -> list[Element]:
    return [c for c in row.children if isinstance(c, Element) and c.tag in {"th", "td"} and not c.has_class("mobile-only")]


def target_pair(text: str) -> tuple[float | None, float | None]:
    text = re.sub(r"\s+", "", text)
    if text.lower() in {"", "-", "—", "n/a", "na"}:
        return None, None
    parts = re.split(r"→|->", text)
    if len(parts) not in {1, 2}:
        raise ValueError("Unrecognized target change")
    values = []
    for part in parts:
        if not re.fullmatch(r"\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", part):
            raise ValueError("Unrecognized target price")
        value = float(part.replace("$", "").replace(",", ""))
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid target price")
        values.append(value)
    return values[-1], values[0] if len(values) == 2 else None


def date_value(text: str) -> str:
    for fmt in ("%b %d, %Y", "%b-%d-%y"):
        try:
            return datetime.strptime(text.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError("Missing or invalid call date")


def make_call(symbol: str, source: SourceName, date: str, firm: str, rating: str,
              action: str, target: str, analyst: str | None = None, analyst_url: str | None = None) -> AnalystCall:
    current, prior = target_pair(target)
    if not firm.strip():
        raise ValueError("Missing research firm")
    ratings = re.split(r"\s*(?:→|->)\s*", rating)
    current_rating = ratings[-1].strip() or None
    previous_rating = ratings[0].strip() if len(ratings) == 2 else None
    date = date_value(date)
    identity = "|".join([source, symbol, date, analyst or "", firm, rating, action, target])
    return AnalystCall(id=sha256(identity.encode()).hexdigest()[:20], symbol=symbol, date=date,
                       analyst=analyst or None, firm=firm, rating=current_rating, prior_rating=previous_rating,
                       action=action or None, price_target=current, prior_target=prior,
                       source=source, source_url=source_url(source, symbol), analyst_url=analyst_url)


def parse_stockanalysis(html: str, symbol: str) -> list[AnalystCall]:
    page = PageParser(html).root
    canonical = next((e.attrs.get("href", "") for e in page.find("link") if e.attrs.get("rel") == "canonical"), "")
    if urlparse(canonical).path.lower() != f"/stocks/{symbol.lower()}/ratings/":
        raise ProviderError("Stock Analysis returned a different security or an unavailable page")
    expected = {"analyst", "firm", "rating", "action", "price target", "date"}
    found_table = False
    records = []
    row_count = 0
    for table in page.find("table"):
        rows = list(table.find("tr"))
        if not rows:
            continue
        headers = [c.text().lower() for c in cells(rows[0])]
        if not expected.issubset(headers):
            continue
        found_table = True
        for row in rows[1:]:
            columns = cells(row)
            if len(columns) != len(headers):
                continue
            row_count += 1
            values = dict(zip(headers, columns))
            name = next((e for e in values["analyst"].find() if e.has_class("analyst-name")), None)
            person = name.text() if name else None
            anchor = next(iter(name.find("a")), None) if name else None
            profile = urljoin("https://stockanalysis.com", anchor.attrs.get("href", "")) if anchor else None
            if profile and (urlparse(profile).hostname != "stockanalysis.com" or not urlparse(profile).path.startswith("/analysts/")):
                profile = None
            try:
                records.append(make_call(symbol, "stockanalysis", values["date"].text(), values["firm"].text(),
                                         values["rating"].text(), values["action"].text(), values["price target"].text(),
                                         person, profile))
            except ValueError:
                continue
        break
    if not found_table or (row_count and not records):
        raise ProviderError("Stock Analysis's public ratings table could not be read")
    return records


def parse_finviz(html: str, symbol: str) -> list[AnalystCall]:
    page = PageParser(html).root
    title = next(iter(page.find("title")), None)
    if not title or not title.text().upper().startswith(f"{symbol} - "):
        raise ProviderError("Finviz returned a different security or an unavailable page")
    expected = ["date", "action", "analyst", "rating change", "price target change"]
    for table in page.find("table"):
        rows = list(table.find("tr"))
        if not rows or [c.text().lower() for c in cells(rows[0])] != expected:
            continue
        records = []
        row_count = 0
        for row in rows[1:]:
            columns = cells(row)
            if len(columns) != 5:
                continue
            row_count += 1
            date, action, firm, rating, target = [c.text() for c in columns]
            try:
                # Finviz's "Analyst" column contains firms, not individual names.
                records.append(make_call(symbol, "finviz", date, firm, rating, action, target))
            except ValueError:
                continue
        if row_count and not records:
            raise ProviderError("Finviz's public ratings table could not be read")
        return records
    raise ProviderError("Finviz's public ratings table could not be read")


class PublicAnalystProvider:
    def __init__(self, timeout: float, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=timeout, follow_redirects=True,
                                   headers={"User-Agent": "FinanceBro/1.0 (personal research)", "Accept": "text/html"},
                                   limits=httpx.Limits(max_connections=6, max_keepalive_connections=3))

    def fetch(self, source: SourceName, symbol: str) -> list[AnalystCall]:
        try:
            response = self.client.get(source_url(source, symbol))
        except httpx.HTTPError as exc:
            raise ProviderError(f"{SOURCE_LABELS[source]} is temporarily unreachable") from exc
        if response.status_code != 200:
            raise ProviderError(f"{SOURCE_LABELS[source]} returned HTTP {response.status_code}")
        if len(response.content) > 2_000_000 or "text/html" not in response.headers.get("content-type", ""):
            raise ProviderError(f"{SOURCE_LABELS[source]} returned an unexpected page")
        return (parse_stockanalysis if source == "stockanalysis" else parse_finviz)(response.text, symbol)

    def close(self):
        self.client.close()
