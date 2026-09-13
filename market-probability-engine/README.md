# Market Probability Engine

A research project exploring **short-horizon market probabilities** in crypto and prediction markets.

The public project focuses on the research layer: model intuition, pipeline architecture, volatility and jump estimation, market-microstructure signals, backtesting methodology, and selected figures.

The live production system is intentionally not published.

## Research question

How useful are jump-aware probability models and high-frequency market information when estimating short-horizon terminal probabilities in crypto markets?

## Core model

The main model family is the **Kou double-exponential jump-diffusion process**, used as an alternative to continuous-diffusion assumptions when returns exhibit fat tails, asymmetric jumps, and rapidly changing volatility.

## System architecture

```text
MARKET DISCOVERY
      ↓
STRIKE & CONTRACT CAPTURE
      ↓
MARKET DATA INGESTION
      ↓
VOLATILITY + JUMP ESTIMATION
      ↓
KOU PROBABILITY ENGINE
      ↓
ORDER-BOOK / FLOW SIGNALS
      ↓
DECISION & RISK FILTERS
      ↓
MARKET COMPARISON
      ↓
EXECUTION
```

## Public vs. private

### Public here
- architecture and research notes
- selected model methodology
- volatility / jump analysis
- benchmark methodology
- non-sensitive figures and experiments
- reproducible research components where appropriate

### Private
- production Kou implementation
- live decision filters
- live execution logic
- credentials and infrastructure configuration
- operational parameters that expose the current trading system

Selected implementation details may be available on request.

## Evaluation

The research layer uses probability-forecast metrics such as **Brier score** and **log loss**, alongside comparisons with simpler probability baselines.

## Planned figures

- Kou vs. diffusion-model probability comparison
- realized volatility and jump-detection chart
- calibration / horizon sensitivity
- probability forecast calibration
- order-book / microstructure visualization
- pipeline architecture schematic
