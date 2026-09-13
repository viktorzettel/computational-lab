"""Strike, Expiry, and Contract Resolution Truth Parser.

Normalizes authoritative strike prices (price-to-beat), contract expiration,
and official settlement prices from prediction market event structures.

Separates authoritative ground truth from captured real-time proxies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class StrikeResolutionTruth:
    """Authoritative contract parameters and settlement outcome."""

    market_slug: str
    official_price_to_beat: Optional[float]
    official_final_price: Optional[float]
    official_winning_side: Optional[str]  # "yes", "no", or None
    closed: bool
    source: str


def safe_float(value: Any) -> Optional[float]:
    """Safely convert a field to float, returning None if invalid."""
    if value is None:
        return None
    try:
        val = float(value)
        return val if val == val else None  # Filter NaN
    except (ValueError, TypeError):
        return None


def safe_json(value: Any) -> Any:
    """Decode a JSON string if needed, returning the original object on failure."""
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return value


def parse_strike_and_resolution(
    payload: dict[str, Any], expected_slug: Optional[str] = None
) -> StrikeResolutionTruth:
    """Extract official strike price, settlement final price, and winning outcome.

    Handles both explicit `eventMetadata` fields (`priceToBeat`, `finalPrice`)
    and terminal market outcome price distributions.
    """
    slug = str(payload.get("slug") or payload.get("ticker") or "")
    if expected_slug and slug != expected_slug:
        raise ValueError(
            f"Slug mismatch: expected '{expected_slug}', got '{slug or '<missing>'}'"
        )

    metadata = safe_json(payload.get("eventMetadata"))
    metadata = metadata if isinstance(metadata, dict) else {}

    price_to_beat = safe_float(metadata.get("priceToBeat"))
    final_price = safe_float(metadata.get("finalPrice"))

    markets = payload.get("markets") or []
    market = (
        markets[0]
        if isinstance(markets, list) and markets and isinstance(markets[0], dict)
        else {}
    )

    outcomes = safe_json(market.get("outcomes"))
    prices = safe_json(market.get("outcomePrices"))
    is_closed = bool(payload.get("closed") or market.get("closed"))

    winning_side: Optional[str] = None

    # Determine winning side from terminal token prices (settled tokens trade at 1.0)
    if is_closed and isinstance(outcomes, list) and isinstance(prices, list):
        pairs: list[tuple[str, float]] = []
        for outcome, price in zip(outcomes, prices):
            parsed = safe_float(price)
            if parsed is not None:
                pairs.append((str(outcome).strip().lower(), parsed))
        if pairs:
            label, best_price = max(pairs, key=lambda item: item[1])
            if best_price >= 0.99:
                label_map = {"up": "yes", "down": "no", "yes": "yes", "no": "no"}
                winning_side = label_map.get(label)

    # Fallback to strike vs final price comparison if terminal token price is absent
    if winning_side is None and price_to_beat is not None and final_price is not None:
        winning_side = "yes" if final_price >= price_to_beat else "no"

    return StrikeResolutionTruth(
        market_slug=slug,
        official_price_to_beat=price_to_beat,
        official_final_price=final_price,
        official_winning_side=winning_side,
        closed=is_closed,
        source="event_metadata",
    )


def evaluate_resolution_outcome(
    final_price: float, strike_price: float
) -> str:
    """Deterministic settlement rule for binary up/down contracts.

    Returns:
        'yes' if final_price >= strike_price, else 'no'.
    """
    return "yes" if final_price >= strike_price else "no"
