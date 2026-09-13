"""Market Discovery and Metadata Parser.

Provides clean, public-safe utilities to parse prediction-market metadata,
detect underlying assets, extract interval recurrence (e.g., 5-minute cycles),
and identify eligible contract candidates for downstream pricing models.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional


ASSET_ALIASES: dict[str, tuple[str, ...]] = {
    "BTC": ("btc", "bitcoin"),
    "ETH": ("eth", "ethereum"),
    "SOL": ("sol", "solana"),
    "XRP": ("xrp", "ripple"),
}


@dataclass(frozen=True)
class MarketCandidate:
    """Standardized representation of a short-horizon prediction market."""

    slug: str
    question: str
    asset: str
    interval_minutes: int
    token_yes: str
    token_no: str
    yes_label: str
    no_label: str
    start_ts: float
    end_ts: float
    accepting_orders: bool
    active: bool
    closed: bool
    liquidity: float
    volume_24h: float
    resolution_source: str


def parse_iso_ts(val: Any) -> Optional[float]:
    """Parse an ISO-8601 string or numeric timestamp to epoch seconds."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if val < 1e11 else float(val) / 1000.0
    text = str(val).strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return None


def parse_json_field(val: Any) -> Any:
    """Safely decode fields that may be returned as JSON-encoded strings."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def detect_interval_minutes(market: dict[str, Any]) -> Optional[int]:
    """Detect contract recurrence interval (e.g., 5 or 15 minutes) from metadata."""
    # Check series recurrence first if present
    events = market.get("events")
    if isinstance(events, list) and events and isinstance(events[0], dict):
        series = events[0].get("series")
        if isinstance(series, list) and series and isinstance(series[0], dict):
            rec = str(series[0].get("recurrence", "")).strip().lower()
            if rec in {"5m", "5min", "5-minute", "5 minute"}:
                return 5
            if rec in {"15m", "15min", "15-minute", "15 minute"}:
                return 15

    blob = " ".join(
        [
            str(market.get("slug", "")),
            str(market.get("question", "")),
            str(market.get("title", "")),
        ]
    ).lower()

    if re.search(r"(^|[^0-9])15\s*[- ]?\s*(m|min|minute)([^a-z0-9]|$)", blob):
        return 15
    if re.search(r"(^|[^0-9])5\s*[- ]?\s*(m|min|minute)([^a-z0-9]|$)", blob):
        return 5
    return None


def detect_asset(market: dict[str, Any]) -> Optional[str]:
    """Identify the underlying asset symbol from market question, slug, or title."""
    blob = " ".join(
        [
            str(market.get("slug", "")),
            str(market.get("question", "")),
            str(market.get("title", "")),
            str(market.get("resolutionSource", "")),
        ]
    ).lower()

    for asset, aliases in ASSET_ALIASES.items():
        if any(a in blob for a in aliases):
            return asset
    return None


def extract_yes_no_tokens(market: dict[str, Any]) -> tuple[str, str, str, str]:
    """Extract (token_yes, token_no, yes_label, no_label) from contract outcomes."""
    token_ids = parse_json_field(market.get("clobTokenIds", []))
    if not isinstance(token_ids, list) or len(token_ids) < 2:
        return "", "", "YES", "NO"

    outcomes_raw = parse_json_field(market.get("outcomes", []))
    if isinstance(outcomes_raw, list):
        outcomes = [str(x).strip().lower() for x in outcomes_raw]
        yes_idx = next((i for i, o in enumerate(outcomes) if o in {"yes", "up"}), None)
        no_idx = next((i for i, o in enumerate(outcomes) if o in {"no", "down"}), None)

        if yes_idx is not None and no_idx is not None:
            yes_label = str(outcomes_raw[yes_idx]).upper()
            no_label = str(outcomes_raw[no_idx]).upper()
            return str(token_ids[yes_idx]), str(token_ids[no_idx]), yes_label, no_label

    return str(token_ids[0]), str(token_ids[1]), "YES", "NO"


def extract_start_end_ts(
    market: dict[str, Any], interval_minutes: int
) -> tuple[Optional[float], Optional[float]]:
    """Determine market start and expiry timestamps."""
    start_keys = ["eventStartTime", "startTime", "startDate", "acceptingOrdersTimestamp"]
    end_keys = ["endDate", "endTime"]

    def first_ts(keys: list[str], obj: dict[str, Any]) -> Optional[float]:
        for k in keys:
            if k in obj:
                ts = parse_iso_ts(obj.get(k))
                if ts is not None:
                    return ts
        return None

    start_ts = first_ts(start_keys, market)
    end_ts = first_ts(end_keys, market)

    events = market.get("events")
    if isinstance(events, list) and events and isinstance(events[0], dict):
        ev0 = events[0]
        if start_ts is None:
            start_ts = first_ts(start_keys, ev0)
        if end_ts is None:
            end_ts = first_ts(end_keys, ev0)

    # Check slug for embedded timestamp if start is missing
    slug = str(market.get("slug", ""))
    match = re.search(r"-(\d{9,10})(?:$|[^\d])", slug)
    if match and start_ts is None:
        start_ts = float(match.group(1))

    if start_ts is None and end_ts is not None:
        start_ts = end_ts - (interval_minutes * 60)
    if end_ts is None and start_ts is not None:
        end_ts = start_ts + (interval_minutes * 60)

    return start_ts, end_ts


def parse_market_candidate(
    market: dict[str, Any],
    target_asset: Optional[str] = None,
    allowed_intervals: tuple[int, ...] = (5,),
) -> Optional[MarketCandidate]:
    """Parse and filter a raw API dictionary into a typed MarketCandidate."""
    interval = detect_interval_minutes(market)
    if interval is None or interval not in allowed_intervals:
        return None

    asset = detect_asset(market)
    if asset is None:
        return None
    if target_asset and asset != target_asset:
        return None

    token_yes, token_no, yes_label, no_label = extract_yes_no_tokens(market)
    if not token_yes or not token_no:
        return None

    start_ts, end_ts = extract_start_end_ts(market, interval)
    if start_ts is None or end_ts is None:
        return None

    return MarketCandidate(
        slug=str(market.get("slug", "")),
        question=str(market.get("question", "")),
        asset=asset,
        interval_minutes=interval,
        token_yes=token_yes,
        token_no=token_no,
        yes_label=yes_label,
        no_label=no_label,
        start_ts=start_ts,
        end_ts=end_ts,
        accepting_orders=bool(market.get("acceptingOrders", False)),
        active=bool(market.get("active", False)),
        closed=bool(market.get("closed", False)),
        liquidity=float(market.get("liquidityNum") or market.get("liquidity") or 0.0),
        volume_24h=float(market.get("volume24hr") or 0.0),
        resolution_source=str(market.get("resolutionSource", "")),
    )


def select_current_market(
    candidates: list[MarketCandidate], now_ts: float
) -> tuple[Optional[MarketCandidate], list[MarketCandidate]]:
    """Select the active live candidate for now_ts and upcoming queue candidates."""
    live = [m for m in candidates if (m.start_ts - 1.0) <= now_ts < m.end_ts and not m.closed]
    if live:
        live.sort(key=lambda m: (m.end_ts, -m.start_ts))
        current = live[0]
    else:
        upcoming = [m for m in candidates if now_ts < m.start_ts and not m.closed]
        upcoming.sort(key=lambda m: m.start_ts)
        current = upcoming[0] if upcoming else None

    if current is None:
        return None, []

    upcoming_queue = [
        m for m in candidates if m.start_ts > current.start_ts and not m.closed
    ]
    upcoming_queue.sort(key=lambda m: m.start_ts)
    return current, upcoming_queue[:2]
