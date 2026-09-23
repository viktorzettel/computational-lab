# Market Probability Engine

## Research question

This project studies the estimation of short-horizon binary-event probabilities. For a contract with official strike $K$ and expiry $T$, the model target is $P(S_T \ge K\mid\mathcal F_t)$. The question is whether a model with explicit jumps produces better probabilistic forecasts than a continuous-diffusion reference after the same information cutoff. Order-book variables provide separate observations of current liquidity; they do not enter the Kou price process by definition.

This repository publishes reference processing and modelling components. It does not publish an integrated live strategy or claim that either model has a trading edge.

## Data and target definitions

1. **Contract record:** market identifier, outcome-token mapping, start and expiry, official price-to-beat $K$, official final price and resolved side. A spot quote captured near the start is a proxy and must remain labelled as such.
2. **Price observations:** irregular trades are placed on a fixed grid. Empty intervals can be forward-filled with synthetic flat candles; their proportion should be reported because it affects estimators.
3. **Log returns:** $r_i=\log(S_i/S_{i-1})$, with a declared sampling interval and information cutoff.
4. **Evaluation target:** an officially resolved contract outcome is distinct from a subsequent spot-return sign. The [BTC return study](studies/btc-hourly-return-study.md) uses the latter and makes no contract-settlement claim.

## Public architecture

| Stage | Output | Public implementation |
| --- | --- | --- |
| [01 Market discovery](pipeline/01-market-discovery/) | Candidate contracts and token mapping | `market_parser.py` |
| [02 Strike and resolution](pipeline/02-strike-capture/) | Official fields and resolution schema | `strike_parser.py` |
| [03 Price series](pipeline/03-market-data/) | Fixed-grid candles and log returns | `candle_utils.py` |
| [04 Volatility and jumps](pipeline/04-volatility-jumps/) | Continuous-scale and jump-parameter estimates | `volatility.py`, `jump_detection.py` |
| [05 Terminal distribution](pipeline/05-kou-model/) | Kou Monte Carlo probability and diffusion reference | `kou_model.py` |
| [06 Order-book features](pipeline/06-order-book-signals/) | Spread, depth, imbalance, microprice | `orderbook_features.py` |

Stages 04 and 05 form the price-model branch. Stage 06 is a separate feature branch, fed by Level-2 snapshots. A private decision layer may combine outputs after validation; this repository does not specify its weights, rules, sizing or execution. The [architecture diagram](architecture/system-architecture.svg) shows that distinction.

## Statistical model

For an observation interval, the reference simulator models terminal **log** return as

$$
X_H = mH + \sigma\sqrt{H}Z + \sum_{j=1}^{N_H}Y_j,
\qquad N_H\sim\operatorname{Poisson}(\lambda H),\quad Z\sim N(0,1).
$$

Here $m$ is the mean diffusive **log return** per interval. Positive jumps occur with probability $p$ and exponential magnitude with rate $\eta_1$; negative jumps have probability $1-p$ and exponential magnitude with rate $\eta_2$. The simulated share of draws with $X_H\ge\log(K/S_t)$ estimates the terminal event probability. The public diffusion comparator sets the jump contribution to zero under the same log-drift convention. No second $\sigma^2/2$ subtraction is applied to a mean already estimated from log returns.

The threshold-based split between ordinary returns and candidate jumps is an operational estimator, not an identified physical decomposition. Parameter estimates can be unstable with few jumps, changing regimes or synthetic candles. Public numerical defaults are reference settings, not production calibration.

## Evaluation design

At each forecast origin, fit parameters only to observations available by that origin. Record the forecast target, horizon, lookback, sampling grid, number of simulation draws and seed. Compare with a diffusion benchmark and an unconditional-frequency or constant-probability baseline. Report Brier score, reliability by probability bin, and the number of observations per bin; uncertainty intervals for temporally dependent events need appropriate interpretation.

A forecast study does not measure execution quality. Assessing a tradable strategy additionally requires contemporaneous market prices, fees, spread, fills, cancellations and risk constraints. The [hourly BTC return study](studies/btc-hourly-return-study.md) is an explicitly limited example: its fitted models did not beat a constant 0.5 forecast on Brier score.

## Reproduce the public checks

With Python and NumPy installed, run from the repository root:

```bash
python3 -m unittest discover -s market-probability-engine/tests -v
```

The tests check that the Kou simulator and analytic diffusion comparator use the same log-drift convention when jumps are disabled. They are a modelling regression check, not empirical validation.

## Scope

Public: schemas, estimators, reference model, features and methods. Private: current calibration, model-selection and decision rules, capital allocation, trading infrastructure and credentials. [Stages 07–08](pipeline/) remain documentation-only.
