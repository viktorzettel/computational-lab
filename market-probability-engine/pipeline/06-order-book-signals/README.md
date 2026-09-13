# 06 · Order-Book Microstructure Signals

Extracts high-frequency microstructure indicators from Limit Order Book (LOB) depth data to complement macroeconomic/jump-diffusion expectations with short-horizon liquidity pressure.

## Motivation

While continuous-time jump-diffusion models (such as Kou) determine the structural probability of price reaching a terminal boundary, order-book liquidity dynamics govern immediate order flow and transient price drift.

Incorporating high-frequency L2 order-book features allows models to detect:
- Temporary supply/demand imbalances.
- Hidden liquidity queues and order book skew.
- Microstructure-induced price drift preceding quotes adjustments.

### Formulations

1. **Bid-Ask Spread in Basis Points**:
   $$
   \text{Spread}_{\text{bps}} = 10\,000 \times \frac{P_{\text{ask}} - P_{\text{bid}}}{P_{\text{mid}}}
   $$

2. **Top-$N$ Order Book Imbalance ($OBI_N$)**:
   Measures relative queue pressure across the top $N$ price levels:
   $$
   OBI_N = \frac{\sum_{i=1}^N q_i^{\text{bid}} - \sum_{i=1}^N q_i^{\text{ask}}}{\sum_{i=1}^N q_i^{\text{bid}} + \sum_{i=1}^N q_i^{\text{ask}}} \in [-1, +1]
   $$

3. **Stoikov (2018) Microprice**:
   Volume-weighted expected fair price adjusted for queue depth at top of book:
   $$
   P_{\text{micro}} = \frac{P_{\text{ask}} \cdot q^{\text{bid}} + P_{\text{bid}} \cdot q^{\text{ask}}}{q^{\text{bid}} + q^{\text{ask}}} = P_{\text{mid}} + \frac{P_{\text{ask}} - P_{\text{bid}}}{2} \cdot OBI_1
   $$

## Components

- **`orderbook_features.py`**:
  - `OrderBookLevel` & `OrderBookSnapshot`: LOB data structures.
  - `compute_spread_bps()`: Relative bid-ask spread.
  - `compute_top_n_depth()`: Cumulative depth over $N$ price levels.
  - `compute_order_book_imbalance()`: Multi-level order book imbalance ($OBI_N$).
  - `compute_microprice()`: Stoikov volume-weighted microprice.
  - `extract_snapshot_features()`: Standardized tabular feature extractor.

## Public vs. Private Boundaries

- **Public**: Microstructure signal formulas, imbalance definitions, and feature extraction interfaces.
- **Private**: Hardware-accelerated L3 order book reconstruction engines, proprietary latency-arbitrage signals, and execution routing logic.
