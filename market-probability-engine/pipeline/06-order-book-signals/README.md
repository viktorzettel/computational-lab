# 06 · Order-Book Microstructure Signals

Extracts high-frequency features from L2 Limit Order Book (LOB) snapshots to complement the jump-diffusion model with information about current liquidity and short-horizon market pressure.

## Motivation

A jump-diffusion model describes a distribution for future price changes, while the order book provides a separate view of the current trading environment.

L2 features can summarize:
- Relative bid/ask depth.
- Quoted spread and liquidity conditions.
- Short-lived order-book imbalance.
- Differences between the simple midpoint and an imbalance-adjusted microprice.

These variables are treated as microstructure features, not as deterministic predictors of the next price move.

### Formulations

1. **Bid-Ask Spread in Basis Points**:
   $$
   \text{Spread}_{\text{bps}} = 10\,000 \times \frac{P_{\text{ask}} - P_{\text{bid}}}{P_{\text{mid}}}
   $$

2. **Top-$N$ Order Book Imbalance ($OBI_N$)**:
   Measures relative displayed depth across the top $N$ price levels:
   $$
   OBI_N = \frac{\sum_{i=1}^N q_i^{\text{bid}} - \sum_{i=1}^N q_i^{\text{ask}}}{\sum_{i=1}^N q_i^{\text{bid}} + \sum_{i=1}^N q_i^{\text{ask}}} \in [-1, +1]
   $$

3. **Microprice**:
   An imbalance-adjusted reference price based on the best quoted prices and displayed sizes:
   $$
   P_{\text{micro}} = \frac{P_{\text{ask}} \cdot q^{\text{bid}} + P_{\text{bid}} \cdot q^{\text{ask}}}{q^{\text{bid}} + q^{\text{ask}}}
   $$

## Components

- **`orderbook_features.py`**:
  - `OrderBookLevel` & `OrderBookSnapshot`: L2 data structures.
  - `compute_spread_bps()`: Relative bid-ask spread.
  - `compute_top_n_depth()`: Cumulative displayed depth over $N$ price levels.
  - `compute_order_book_imbalance()`: Multi-level order-book imbalance.
  - `compute_microprice()`: Imbalance-adjusted microprice.
  - `extract_snapshot_features()`: Standardized feature extractor.

## Public vs. Private Boundaries

- **Public**: L2 microstructure feature definitions and feature-extraction interfaces.
- **Private**: Current production feature combinations, signal weights, filters, thresholds, and execution logic.
