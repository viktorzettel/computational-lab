# 05 · Kou reference model

This module estimates a terminal event probability $P(S_T\ge K)$ from a double-exponential jump-diffusion distribution. It is a reference implementation for research; its defaults are not the current production calibration.

## Parameter and drift convention

`KouCalibrator` receives fixed-interval **log returns**. After a robust scale estimate, it computes the mean and standard deviation of a filtered return body. The legacy field `mu_diffusive` stores that **mean log return per observation interval**, not an arithmetic price drift. The simulator therefore uses

$$
\log(S_T/S_t)=mH+\sigma\sqrt{H}Z+\sum_{j=1}^{N_H}Y_j.
$$

$H$ is the number of observation intervals remaining; $N_H\sim\mathrm{Poisson}(\lambda H)$. Positive jump amplitudes are exponential with rate $\eta_1$ and probability $p_{up}$; negative amplitudes have exponential magnitude with rate $\eta_2$. The event threshold is $\log(K/S_t)$. The empirical return mean already includes the log-price convention: subtracting $\sigma^2H/2$ again would bias the simulated distribution downward.

`black_scholes_terminal_prob` is named for legacy compatibility but computes the analytic **diffusion terminal-event probability**, not an option value. Its drift argument is `mean_log_return_per_second` and follows the same log-return convention.

## Estimation and limits

The public calibrator uses a Core-70 seed scale, a second body estimate and threshold-based candidate jumps. It estimates jump frequency, sign frequency and exponential magnitude rates from those candidates. This is a model-fitting heuristic. Few jumps, synthetic flat candles, and nonstationary returns can make the parameters unstable. The simulation probability is conditional on the fitted parameters; it does not include parameter uncertainty.

Run the [regression checks](../../tests/test_log_drift.py) from the repository root with `python3 -m unittest discover -s market-probability-engine/tests -v`. The [research overview](../../README.md) defines the data and evaluation boundaries.
