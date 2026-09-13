# 03 · Market Data Ingestion & Candle Utilities

Ingests asynchronous market trade streams and converts them into uniform, synchronized fixed-interval time series suitable for statistical modeling.

## Problem Formulation

High-frequency spot trades arrive at irregular intervals. Stochastic jump-diffusion models (such as Kou or Merton models) require discrete equidistant observations:
$$
r_t = \ln\left(\frac{S_t}{S_{t-1}}\right), \quad t \in \{1, \dots, N\}
$$

During low-activity regimes, missing ticks distort volatility estimates if skipped. The aggregator generates synthetic flat candles (forward-filling previous settlement price) to maintain grid continuity:
$$
O_t = H_t = L_t = C_t = C_{t-1}, \quad r_t = 0
$$

## Components

- **`candle_utils.py`**:
  - `Candle10s`: Dataclass for candle metrics (`open`, `high`, `low`, `close`, `n_ticks`, `synthetic`).
  - `FixedGridCandleAggregator`: Ring-buffered fixed-frequency aggregator (default 10-second grid) with zero-tick gap synthesis and monotonic timestamp enforcement.
  - `compute_log_returns()`: Vectorized continuous logarithmic return calculator.

## Public vs. Private Boundaries

- **Public**: Aggregation algorithms, synthetic candle interpolation, and return vectorization.
- **Private**: Production WebSocket connection pools, reconnection managers, and latency-optimized socket transports.
