# System Architecture

The **Market Probability Engine** is organized as a modular, feed-forward computational pipeline designed to calculate high-frequency terminal probabilities for short-horizon binary prediction contracts.

![Market Probability Engine Architecture](system-architecture.svg)

## Pipeline Flow

```text
Market Discovery
      ↓
Strike & Contract Capture
      ↓
Market Data Ingestion
      ↓
Volatility & Jump Estimation
      ↓
Kou Probability Engine
      ↓
Order-Book Signals
      ↓
Decision & Risk Filters  (Private)
      ↓
Market Comparison       (Private)
      ↓
Execution               (Private)
```

## Stage Descriptions

### Public Research & Mathematical Modeling Layer

1. **`01-market-discovery`**: Ingests market metadata, parses recurrence patterns (e.g. 5-minute recurring cycles), verifies liquidity prerequisites, and maps outcome tokens (`UP` / `DOWN`, `YES` / `NO`).
2. **`02-strike-capture`**: Normalizes contract boundaries, identifying authoritative strike values ($K$, *priceToBeat*), contract expiries ($T$), and post-expiration settlement truth ($S_T$).
3. **`03-market-data`**: Groups irregular tick trades into synchronous fixed-interval buckets (e.g., 10-second candles), forward-filling synthetic bars across liquidity droughts to produce clean continuous log return series.
4. **`04-volatility-jumps`**: Disentangles the continuous diffusion variance $\sigma_{\text{diff}}^2$ from discontinuous jump innovations using Barndorff-Nielsen & Shephard Bipower Variation, Parkinson range volatility, and Core-70 jump thresholding. Fits asymmetric exponential arrival rates ($\lambda, p_{\text{up}}, \eta_1, \eta_2$).
5. **`05-kou-model`**: Evaluates the terminal state distribution $P(S_T \ge K)$ using the double-exponential jump diffusion process via vectorized Monte Carlo path simulation alongside analytic Black-Scholes diffusion baselines.
6. **`06-order-book-signals`**: Extracts high-frequency Limit Order Book (LOB) microstructure indicators including top-of-book bid/ask spreads in basis points, top-$N$ order book imbalance ($OBI_N$), and volume-weighted microprices (Stoikov, 2018).

---

### Private Execution Layer (Proprietary)

Stages 7 through 9 govern live capital allocation, private API signing, and transaction routing. These stages are intentionally retained in private repositories:

7. **`07-decision-risk`**: Evaluates model dislocation thresholds, bankroll risk limits, drawdown tripwires, and fractional Kelly bet sizing.
8. **Market Comparison**: Compares structural model probability $P_{\text{model}}$ against active exchange order-book quotes $P_{\text{market}}$ to isolate net expected value after fees.
9. **`08-execution`**: Production order router, asynchronous fill tracking, EIP-712 cryptographic order signing, and private cancellation managers.
