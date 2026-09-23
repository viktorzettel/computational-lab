# Historical BTC hourly-return study

This is a descriptive reference study of probability estimation, not an evaluation of prediction-market settlement or trading profit.

## Sample and target

- Input: 43,201 continuous BTC minute closes from 11 January 2026 19:58 UTC to 10 February 2026 19:58 UTC. The source file does not identify an exchange; no exchange attribution is made.
- Binary target at origin (t): $1\{S_{t+60m}\ge S_t\}$. This is a subsequent BTC close comparison, **not** an official contract outcome.
- Evaluation: 696 hourly forecast origins. The target windows do not overlap; the trailing estimation windows do.

## Procedure

At each origin, use only the preceding 1,440 minute returns to estimate a filtered diffusion log drift, continuous volatility and candidate jump frequency and magnitudes. Draw 12,000 terminal returns for the next 60 minutes from the Kou reference model. Estimate the positive-return probability from the draw fraction. Compare with an analytic pure-diffusion probability fitted at the same origin and a constant 0.5 forecast. The Monte Carlo random seed was fixed at 20260918 for the presentation study (forecast stream seeded one higher).

The jump split uses a Core-70 seed scale and a 3σ second-pass threshold. This is a declared study choice, not a claim of optimal calibration or a live setting. The log-return mean is used directly as log drift; the $\sigma^2/2$ adjustment is not applied twice.

## Result

| Forecast | Brier score |
| --- | ---: |
| Constant 0.5 | **0.2500** |
| Kou jump diffusion | 0.2561 |
| Pure diffusion | 0.2608 |

Lower is better. Neither fitted model improves on the constant baseline in this sample. The difference between the fitted models is descriptive; no confidence interval for the score difference or held-out tuning exercise is reported.

## Limits

The hourly outcomes are non-overlapping, but adjacent forecasts share most observations in their trailing fits. Reliability-bin Wilson intervals describe binomial frequencies and do not correct for all time dependence or parameter uncertainty. This study does not use official strikes, resolved sides, contemporaneous contract prices, fees or realized fills. Consequently it supports no inference about live contract calibration or trading edge.

The website's reproducibility record stores the sample SHA-256 (`e71f12e2edd1610fa24ba4197db65d0537f876c8dbf50623ae7059d15052d20e`), settings, plots and generation script. The raw input data are not published in this repository.
