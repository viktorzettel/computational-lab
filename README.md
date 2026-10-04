# Computational Lab

Selected computational research by Viktor Zettel, at the intersection of financial markets and scientific visualization. Each project separates its question, data, implementation, and limits. This repository contains reference research code and documentation; it is not the deployment repository for a trading system.

| Project | Question | Public material |
| --- | --- | --- |
| [Market Probability Engine](market-probability-engine/) | How can short-horizon terminal-event probabilities be estimated and evaluated? | Contract and data parsing, volatility and jump estimators, Kou simulation, diffusion benchmark, order-book features, methodology |
| [Gaia Nearby Stars](gaia-nearby-stars/) | What does the nearby stellar volume look like in Sun-centred coordinates? | Gaia DR3 catalogue preparation, methodology, interactive Three.js viewer |
| [RiskLens](portfolio-optimization/) | How do historical portfolio data and allocation methods shape estimated risk? | React dashboard, FastAPI analysis service, HRP/NCO allocation, volatility, VaR/ES and correlation views |
| [Solar System Scale Explorer](real-scale-solar-system/) | How can average planetary distances and body sizes be conveyed on a continuous scale? | React/Vite two-dimensional explorer with travel controls, ruler and planet information |
| [FinanceBro](atlas-research-terminal/) | Your own free, open-source TradingView-style charting page. No subscription, no account, and no built-in indicator or watchlist limits. | 28 indicators, Ichimoku Cloud, Volume, analyst price targets, Jordi Visser preset and custom layouts. Bring your AI coding agent to add your own tools. |
| [WhaleWatch](whale-watch/) | See what some of the best-known investors hold and how their reported portfolios changed last quarter. | Five managers, headshots, holdings pie charts, additions, trims and exits, CSV export, original filings and a deadline countdown. |

## Two tools to make market research easier

**[FinanceBro](atlas-research-terminal/)** is a completely free, open-source charting page inspired by TradingView. Run it on your own computer and add as many indicators and watchlist names as you want—no paid tiers or app-imposed quotas. Give your AI coding agent the project and [extension guide](atlas-research-terminal/AGENT_GUIDE.md) to build custom indicators, connect data or create a research view. Free data providers still set their own rate limits and available history. The existing folder name is kept so older Atlas links still work.

**[WhaleWatch](whale-watch/)** helps you learn from the big fish. [Open the free web app](https://whalewatch-viktor.netlify.app/), or clone this repository to run and adapt your own copy. Pick Atreides, Citadel, Duquesne, Berkshire or Pershing Square to see what they reported owning, how much they held, and what grew, shrank or disappeared since the previous quarter. These are quarterly public filings, so they show reported portfolio changes rather than live trades or exact trade dates.

Both projects include their source, local setup instructions and MIT licenses for the project-authored code. Third-party assets retain their own terms and credits.

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
