# Market Probability Engine

A research project exploring **short-horizon terminal probability modeling** in crypto prediction markets.

The public repository focuses on the mathematical and computational research layer: double-exponential jump-diffusion modeling, realized and range-based volatility estimation, robust jump detection, order-book microstructure signals, and probability calibration benchmarks.

The live production execution infrastructure and current decision logic are intentionally private.

---

## Research Objective

How accurately can jump-diffusion stochastic processes and high-frequency order-book signals estimate terminal outcomes for short-horizon (e.g. 5-minute and 15-minute) prediction market contracts?

High-frequency crypto returns often exhibit heavy tails, excess kurtosis, volatility clustering, and discontinuous price moves. Pure continuous-diffusion models may underrepresent jump-driven tail risk and short-horizon probability mass. This project investigates whether explicit jump-diffusion modeling (Kou, 2002), complemented by Limit Order Book (LOB) information, can improve probability calibration relative to simpler diffusion baselines.

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
| **04** | [`pipeline/04-volatility-jumps`](pipeline/04-volatility-jumps/) | Computes Parkinson range volatility, Barndorff-Nielsen & Shephard Bipower Variation, and robust jump estimates used to parameterize the jump-diffusion model. |
| **05** | [`pipeline/05-kou-model`](pipeline/05-kou-model/) | Vectorized Monte Carlo terminal probability engine $P(S_T \ge K)$ under Kou jump-diffusion, plus analytic diffusion benchmark. |
| **06** | [`pipeline/06-order-book-signals`](pipeline/06-order-book-signals/) | Computes L2 order-book spread, cumulative depth, imbalance, and microprice features. |
| **07** | `pipeline/07-decision-risk` | *Private*: decision aggregation, risk controls, and production sizing logic. |
| **08** | `pipeline/08-execution` | *Private*: live order submission, signing, lifecycle handling, and operational safeguards. |

---

## Reference Calibration

The numerical defaults and parameter choices visible in the public source are **reference / baseline research settings** used to make the open implementation self-contained and reproducible.

They should not be interpreted as the current live production calibration. The private system continues to evolve as new tests, data, and model refinements are incorporated.

---

## Evaluation Methodology

Probability forecasts are evaluated out-of-sample against actual contract settlements ($y_i \in \{0, 1\}$) across short-horizon market cycles:

* **Brier Score**:
  $$\text{Brier} = \frac{1}{N} \sum_{i=1}^N (\hat{p}_i - y_i)^2$$
* **Logarithmic Loss (Cross-Entropy)**:
  $$\text{LogLoss} = -\frac{1}{N} \sum_{i=1}^N \left[ y_i \ln(\hat{p}_i) + (1 - y_i) \ln(1 - \hat{p}_i) \right]$$
* **Reliability / Calibration Diagrams**: Empirical win rates plotted against model-predicted probability bins.
* **Diffusion Baseline**: Comparative evaluation against a pure geometric-Brownian-motion terminal-probability benchmark.

---

## Public vs. Private Boundaries

### Public (Open Research)
* Pipeline architecture and data contracts
* Mathematical formulations for Kou jump-diffusion calibration and simulation
* High-frequency volatility and jump-detection estimators
* Order-book feature extraction routines
* Backtest and probability-calibration methodology
* Baseline research parameters sufficient to reproduce the public examples

### Private (Production)
* Current production calibration and decision thresholds
* Signal combination and filtering logic
* Capital allocation and risk controls
* Live execution code
* Infrastructure credentials, private keys, and operational endpoints
