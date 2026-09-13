# 05 · Kou Jump-Diffusion Probability Engine

Implements the **Kou (2002)** double-exponential jump-diffusion stochastic model for computing terminal probabilities $P(S_T \ge K)$ in short-horizon prediction contracts.

## Mathematical Formulation

Under the Kou model, the risk asset price $S_t$ satisfies the stochastic differential equation:
$$
\frac{dS_t}{S_t^-} = \mu \, dt + \sigma \, dW_t + d\left(\sum_{i=1}^{N_t} (V_i - 1)\right)
$$

where:
- $W_t$ is standard Brownian motion capturing continuous diffusive price fluctuations ($\sigma > 0$).
- $N_t$ is an independent Poisson process with constant jump arrival intensity $\lambda \ge 0$.
- $Y_i = \ln(V_i)$ are independent and identically distributed asymmetric double-exponential random variables with probability density:
$$
f_Y(y) = p \cdot \eta_1 e^{-\eta_1 y} \mathbf{1}_{\{y \ge 0\}} + (1-p) \cdot \eta_2 e^{\eta_2 y} \mathbf{1}_{\{y < 0\}}
$$
with parameters $\eta_1 > 1$ and $\eta_2 > 0$.

The expected percentage jump size $\xi = \mathbb{E}[e^Y - 1]$ is:
$$
\xi = p \frac{\eta_1}{\eta_1 - 1} + (1-p) \frac{\eta_2}{\eta_2 + 1} - 1
$$

### Terminal Probability Evaluation

For binary prediction contracts with strike $K$ expiring at $T$:
$$
P(S_T \ge K) = P\left(\ln \frac{S_T}{S_0} \ge \ln \frac{K}{S_0}\right)
$$

The simulated terminal distribution combines:
1. **Continuous Drift & Diffusion**
2. **Compound Poisson Jumps** drawn from the asymmetric double-exponential jump distribution.

A vectorized Monte Carlo simulation then estimates the fraction of terminal paths satisfying $S_T \ge K$. A pure-diffusion terminal-probability calculation is included as a benchmark.

## Components

- **`kou_model.py`**:
  - `KouParams`: parameter container for the jump-diffusion process.
  - `KouCalibrator`: calibrates reference parameters from discrete return series.
  - `KouMonteCarloEngine`: vectorized terminal-distribution simulation.
  - `black_scholes_terminal_prob()`: pure-diffusion benchmark probability.

## Reference Calibration

The numerical defaults visible in the public implementation — including sampling interval, path count, thresholding defaults, and regularization/fallback values — are **reference settings for the open research implementation**.

They are not intended to document the current live production configuration. The private calibration can differ as additional testing and model development continue.

## Public vs. Private Boundaries

- **Public**: Core model formulation, baseline calibration approach, Monte Carlo probability calculation, and reproducible reference settings.
- **Private**: Current production calibration, model refinements, signal integration, decision filters, risk controls, and live execution stack.
