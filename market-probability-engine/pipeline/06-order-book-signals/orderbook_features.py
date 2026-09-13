"""Order Book Microstructure Feature Extraction.

Computes high-frequency microstructure signals including:
- Top-of-book bid/ask spreads in basis points
- Multi-level cumulative depth
- Order Book Imbalance (OBI_N) across top-N price levels
- Volume-weighted Microprice (Stoikov, 2018)
- Order Flow Imbalance (OFI)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

EPS = 1e-12


@dataclass(frozen=True)
class OrderBookLevel:
    """A single price level in the limit order book."""

    price: float
    size: float


@dataclass
class OrderBookSnapshot:
    """L2 Limit Order Book snapshot."""

    bids: list[OrderBookLevel]  # Ordered highest price to lowest
    asks: list[OrderBookLevel]  # Ordered lowest price to highest
    timestamp: float = 0.0

    @property
    def best_bid(self) -> Optional[OrderBookLevel]:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Optional[OrderBookLevel]:
        return self.asks[0] if self.asks else None

    @property
    def midpoint(self) -> Optional[float]:
        if not self.bids or not self.asks:
            return None
        return (self.bids[0].price + self.asks[0].price) / 2.0


def compute_spread_bps(best_bid: float, best_ask: float) -> Optional[float]:
    """Compute relative bid-ask spread in basis points: 10,000 * (Ask - Bid) / Mid."""
    if best_bid <= 0.0 or best_ask <= 0.0 or best_ask < best_bid:
        return None
    midpoint = (best_bid + best_ask) / 2.0
    if midpoint <= EPS:
        return None
    return 10_000.0 * (best_ask - best_bid) / midpoint


def compute_top_n_depth(
    levels: Sequence[OrderBookLevel], top_n: int = 5
) -> float:
    """Aggregate total volume/size across the top N book levels."""
    return float(sum(lvl.size for lvl in levels[:top_n] if lvl.size > 0))


def compute_order_book_imbalance(
    bids: Sequence[OrderBookLevel],
    asks: Sequence[OrderBookLevel],
    top_n: int = 5,
) -> Optional[float]:
    """Calculate normalized top-N order book imbalance:

        OBI_N = (Depth_Bid - Depth_Ask) / (Depth_Bid + Depth_Ask)

    Returns value in [-1.0, 1.0].
        +1.0 indicates pure buying pressure (empty ask depth)
        -1.0 indicates pure selling pressure (empty bid depth)
    """
    bid_depth = compute_top_n_depth(bids, top_n=top_n)
    ask_depth = compute_top_n_depth(asks, top_n=top_n)
    total_depth = bid_depth + ask_depth

    if total_depth <= EPS:
        return None
    return float((bid_depth - ask_depth) / total_depth)


def compute_microprice(
    best_bid: float,
    best_ask: float,
    bid_size: float,
    ask_size: float,
) -> Optional[float]:
    """Calculate volume-weighted microprice (Stoikov, 2018):

        P_micro = (P_ask * Q_bid + P_bid * Q_ask) / (Q_bid + Q_ask)

    Reflects the probability that the next transaction is a buyer-initiated trade.
    """
    if best_bid <= 0.0 or best_ask <= 0.0 or best_ask < best_bid:
        return None
    total_size = bid_size + ask_size
    if total_size <= EPS:
        return None

    return float((best_ask * bid_size + best_bid * ask_size) / total_size)


def extract_snapshot_features(
    snapshot: OrderBookSnapshot,
    top_n: int = 5,
) -> dict[str, Optional[float]]:
    """Extract a standardized dictionary of order-book microstructure signals."""
    bb = snapshot.best_bid
    ba = snapshot.best_ask

    if bb is None or ba is None:
        return {
            "best_bid": None,
            "best_ask": None,
            "midpoint": None,
            "spread_bps": None,
            "bid_depth_top5": None,
            "ask_depth_top5": None,
            "obi5": None,
            "microprice": None,
        }

    midpoint = (bb.price + ba.price) / 2.0
    spread_bps = compute_spread_bps(bb.price, ba.price)
    bid_depth = compute_top_n_depth(snapshot.bids, top_n=top_n)
    ask_depth = compute_top_n_depth(snapshot.asks, top_n=top_n)
    obi5 = compute_order_book_imbalance(snapshot.bids, snapshot.asks, top_n=top_n)
    microprice = compute_microprice(bb.price, ba.price, bb.size, ba.size)

    return {
        "best_bid": bb.price,
        "best_ask": ba.price,
        "midpoint": midpoint,
        "spread_bps": spread_bps,
        "bid_depth_top5": bid_depth,
        "ask_depth_top5": ask_depth,
        "obi5": obi5,
        "microprice": microprice,
    }
