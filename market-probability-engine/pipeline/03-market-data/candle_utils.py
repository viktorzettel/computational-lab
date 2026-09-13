"""Market Data Processing and Candle Utilities.

Provides high-frequency tick aggregation into fixed-interval candles (e.g., 10-second grid),
synthetic forward-fill handling for illiquid/gap periods, and robust log return calculations.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np


@dataclass
class Candle10s:
    """Fixed-interval candle record (default 10 seconds)."""

    bucket_ts: int
    open: float
    high: float
    low: float
    close: float
    n_ticks: int
    synthetic: bool = False


class FixedGridCandleAggregator:
    """Aggregates irregular trade ticks into a synchronous, fixed-grid candle series.

    Guarantees a continuous time series without missing intervals by generating
    synthetic flat candles (forward-filling previous close) across zero-volume gaps.
    """

    def __init__(
        self,
        interval_seconds: int = 10,
        history_seconds: int = 1800,
    ) -> None:
        self.interval_seconds = max(1, int(interval_seconds))
        self.history_seconds = max(self.interval_seconds * 10, int(history_seconds))
        self._current_candle: Optional[Candle10s] = None
        self._completed: deque[Candle10s] = deque()
        self._last_price: Optional[float] = None
        self._last_ts: Optional[float] = None

    @property
    def completed(self) -> list[Candle10s]:
        """List of all finalized, completed candles within the retention window."""
        return list(self._completed)

    def bucket_for(self, ts: float) -> int:
        """Calculate the floor bucket boundary for a timestamp."""
        return (int(ts) // self.interval_seconds) * self.interval_seconds

    def update(self, ts: float, price: float) -> None:
        """Ingest a new trade price tick and advance candle state."""
        if price <= 0.0 or not math.isfinite(price):
            return

        if self._last_ts is not None and ts < self._last_ts:
            return  # Reject out-of-order ticks

        self._last_price = price
        self._last_ts = ts
        bucket = self.bucket_for(ts)

        if self._current_candle is None:
            self._current_candle = Candle10s(
                bucket_ts=bucket,
                open=price,
                high=price,
                low=price,
                close=price,
                n_ticks=1,
                synthetic=False,
            )
            return

        current = self._current_candle

        # Current tick belongs to the active candle bucket
        if bucket == current.bucket_ts:
            current.high = max(current.high, price)
            current.low = min(current.low, price)
            current.close = price
            current.n_ticks += 1
            return

        # Advance: finalize the current candle and bridge any missing buckets
        last_close = current.close
        self._append_completed(current)

        gap_bucket = current.bucket_ts
        while gap_bucket + self.interval_seconds < bucket:
            gap_bucket += self.interval_seconds
            synthetic = Candle10s(
                bucket_ts=gap_bucket,
                open=last_close,
                high=last_close,
                low=last_close,
                close=last_close,
                n_ticks=0,
                synthetic=True,
            )
            self._append_completed(synthetic)

        self._current_candle = Candle10s(
            bucket_ts=bucket,
            open=price,
            high=price,
            low=price,
            close=price,
            n_ticks=1,
            synthetic=False,
        )

    def _append_completed(self, candle: Candle10s) -> None:
        self._completed.append(candle)
        cutoff = candle.bucket_ts - self.history_seconds
        while self._completed and self._completed[0].bucket_ts < cutoff:
            self._completed.popleft()

    def get_recent_candles(self, window_seconds: int) -> list[Candle10s]:
        """Return completed candles spanning the most recent window_seconds."""
        if not self._completed:
            return []
        cutoff = self._completed[-1].bucket_ts - window_seconds
        return [c for c in self._completed if c.bucket_ts >= cutoff]


def compute_log_returns(
    candles: Sequence[Candle10s],
) -> np.ndarray:
    """Compute continuous log returns r_t = ln(S_t / S_{t-1}) from candle closes.

    Returns:
        1D numpy array of log returns. Returns empty array if fewer than 2 candles.
    """
    if len(candles) < 2:
        return np.array([], dtype=float)

    closes = np.array([c.close for c in candles], dtype=float)
    if np.any(closes <= 0.0) or np.any(~np.isfinite(closes)):
        raise ValueError("Non-positive or non-finite price encountered in candle closes.")

    return np.diff(np.log(closes))
