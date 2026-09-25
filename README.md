# Computational Lab

Selected computational research by Viktor Zettel, at the intersection of financial markets and scientific visualization. Each project separates its question, data, implementation, and limits. This repository contains reference research code and documentation; it is not the deployment repository for a trading system.

| Project | Question | Public material |
| --- | --- | --- |
| [Market Probability Engine](market-probability-engine/) | How can short-horizon terminal-event probabilities be estimated and evaluated? | Contract and data parsing, volatility and jump estimators, Kou simulation, diffusion benchmark, order-book features, methodology |
| [Gaia Nearby Stars](gaia-nearby-stars/) | What does the nearby stellar volume look like in Sun-centred coordinates? | Gaia DR3 catalogue preparation, methodology, interactive Three.js viewer |
| [RiskLens](portfolio-optimization/) | How do historical portfolio data and allocation methods shape estimated risk? | React dashboard, FastAPI analysis service, HRP/NCO allocation, volatility, VaR/ES and correlation views |
| [Solar System Scale Explorer](real-scale-solar-system/) | How can average planetary distances and body sizes be conveyed on a continuous scale? | React/Vite two-dimensional explorer with travel controls, ruler and planet information |

## How to read the market research

Start with the [Market Probability Engine research overview](market-probability-engine/README.md). The [architecture](market-probability-engine/architecture/) maps the public modules and distinguishes the price model from independent order-book features. The [Kou reference module](market-probability-engine/pipeline/05-kou-model/) specifies the drift convention and has a small regression test. An [illustrative historical study](market-probability-engine/studies/btc-hourly-return-study.md) reports its data, forecast target, baselines and limitations.

The public code does not establish profitable trading performance. A probability score for subsequent BTC returns is not a score for officially resolved prediction-market contracts. Official contract strike, final price, resolved side, and realized fills are distinct records.

## Reproducibility and boundaries

- The public modules contain explicit **reference** defaults. They do not identify current production settings.
- The included test runs with Python and NumPy: `python3 -m unittest discover -s market-probability-engine/tests -v`.
- Raw operational data, credentials, private decision rules, live sizing, and order submission are outside this repository.
- The Gaia repository directory contains the current 150 ly catalogue, its data pipeline and the Vite/Three.js viewer.
- RiskLens and Solar System Scale Explorer were early projects. Their READMEs describe how to run each prototype and distinguish its visualization or estimates from a validated physical or financial model.

**Author:** Viktor Zettel · Economics, markets, computation
