# Market Probability Engine

A research project exploring **short-horizon terminal probability modeling** in crypto prediction markets.

The public repository focuses on the mathematical and computational research layer: double-exponential jump-diffusion modeling, realized and range-based volatility estimation, robust jump detection, order-book microstructure signals, and probability calibration benchmarks.

The live production execution infrastructure and proprietary trading strategies are intentionally private.

---

## Research Objective

How accurately can jump-diffusion stochastic processes and high-frequency order-book signals predict terminal outcomes for short-horizon (e.g. 5-minute and 15-minute) prediction market contracts?

In high-frequency crypto asset dynamics, return distributions exhibit significant leptokurtosis, heavy tails, and asymmetric discontinuous price jumps. Standard continuous Brownian motion assumptions underestimate tail probabilities and misprice out-of-the-money or close-to-expiration binary contracts. This project investigates whether explicit jump-diffusion modeling (Kou, 2002) combined with Limit Order Book (LOB) liquidity imbalance improves probability calibration over pure diffusion baselines.

---

## Core Stochastic Model: Kou (2002) Jump-Diffusion

The primary model is the **Kou double-exponential jump-diffusion process**, where the underlying asset price $S_t$ satisfies:

$$\frac{dS_t}{S_t^-} = \mu \, dt + \sigma \, dW_t + d\left(\sum_{i=1}^{N_t} (V_i - 1)\right)$$

where:
* $W_t$ is a standard Brownian motion governing continuous diffusion with volatility $\sigma$.
* $N_t$ is a homogeneous Poisson process with arrival rate $\lambda$.
* $Y_i = \ln(V_i)$ are independent jump amplitudes with an **asymmetric double-exponential density**:

$$f_Y(y) = p \cdot \eta_1 e^{-\eta_1 y} \mathbf{1}_{\{y \ge 0\}} + (1 - p) \cdot \eta_2 e^{\eta_2 y} \mathbf{1}_{\{y < 0\}}$$

with $\eta_1 > 1$ (upward jump decay) and $\eta_2 > 0$ (downward jump decay).

The expected percentage jump size is given by:

$$\xi = \mathbb{E}[e^Y - 1] = p \frac{\eta_1}{\eta_1 - 1} + (1 - p) \frac{\eta_2}{\eta_2 + 1} - 1$$

---

## Pipeline Architecture

The engine is structured as a sequential, modular pipeline:

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

Detailed architecture diagram: [architecture/system-architecture.svg](architecture/system-architecture.svg).

---

## Implemented Pipeline Modules

| Stage | Module | Description |
| :--- | :--- | :--- |
| **01** | [`pipeline/01-market-discovery`](pipeline/01-market-discovery/) | Scans recurring prediction market contracts (5m/15m cycles), detects underlying assets (`BTC`, `ETH`, etc.), and extracts outcome tokens. |
| **02** | [`pipeline/02-strike-capture`](pipeline/02-strike-capture/) | Captures official strike prices (*priceToBeat*), expiration timestamps, and normalizes authoritative settlement truth. |
| **03** | [`pipeline/03-market-data`](pipeline/03-market-data/) | Aggregates irregular tick trades into synchronous fixed-interval candles (10s grid) with synthetic forward-fill gap handling. |
| **04** | [`pipeline/04-volatility-jumps`](pipeline/04-volatility-jumps/) | Computes Parkinson range volatility, Barndorff-Nielsen & Shephard Bipower Variation, and isolates jumps via Core-70 thresholding to estimate $(\lambda, p_{\text{up}}, \eta_1, \eta_2)$. |
| **05** | [`pipeline/05-kou-model`](pipeline/05-kou-model/) | Vectorized Monte Carlo terminal probability engine $P(S_T \ge K)$ under Kou jump-diffusion, plus analytic Black-Scholes benchmark. |
| **06** | [`pipeline/06-order-book-signals`](pipeline/06-order-book-signals/) | Computes L2 order book spread (bps), cumulative top-5 depth, top-5 order book imbalance ($OBI_5$), and Stoikov volume-weighted microprice. |
| **07** | `pipeline/07-decision-risk` | *Private*: Capital allocation, drawdown tripwires, and fractional Kelly risk sizing. |
| **08** | `pipeline/08-execution` | *Private*: Low-latency order routing, cryptographic signing, and order lifecycle managers. |

---

## Evaluation Methodology

Probability forecasts are evaluated out-of-sample against actual contract settlements ($y_i \in \{0, 1\}$) across short-horizon market cycles:

* **Brier Score**:
  $$\text{Brier} = \frac{1}{N} \sum_{i=1}^N (\hat{p}_i - y_i)^2$$
* **Logarithmic Loss (Cross-Entropy)**:
  $$\text{LogLoss} = -\frac{1}{N} \sum_{i=1}^N \left[ y_i \ln(\hat{p}_i) + (1 - y_i) \ln(1 - \hat{p}_i) \right]$$
* **Reliability / Calibration Diagrams**: Empirical win rates plotted against model-predicted probability deciles.
* **Diffusion Baseline**: Comparative evaluation against pure Black-Scholes geometric Brownian motion $\Phi(d_2)$.

---

## Public vs. Private Boundaries

### Public (Open Research)
* Pipeline architecture and data contracts
* Mathematical formulations for Kou jump-diffusion calibration and simulation
* High-frequency volatility and jump-detection estimators
* Order-book feature extraction routines (OBI, Microprice)
* Backtest and probability calibration methodology

### Private (Proprietary Production)
* Live production trade execution code
* Live decision thresholds and proprietary alpha gates
* Capital allocation and Kelly bankroll management
* Infrastructure credentials, private keys, and operational endpoints
