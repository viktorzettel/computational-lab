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
with parameters $\eta_1 > 1$ (upward jump decay, ensures finite expected price) and $\eta_2 > 0$ (downward jump decay).

The expected percentage jump size $\xi = \mathbb{E}[e^Y - 1]$ is:
$$
\xi = p \frac{\eta_1}{\eta_1 - 1} + (1-p) \frac{\eta_2}{\eta_2 + 1} - 1
$$

### Terminal Probability Evaluation

For binary prediction contracts with strike $K$ expiring at $T$:
$$
P(S_T \ge K) = P\left(\ln \frac{S_T}{S_0} \ge \ln \frac{K}{S_0}\right)
$$

The trajectory over remaining horizon $\Delta t = T - t$ combines:
1. **Continuous Drift & Diffusion**: $(\mu - \frac{1}{2}\sigma^2)\Delta t + \sigma \sqrt{\Delta t} Z$, where $Z \sim \mathcal{N}(0, 1)$.
2. **Compound Poisson Jumps**: $\sum_{i=1}^{N(\lambda \Delta t)} Y_i$.

A vectorized Monte Carlo simulation produces empirical terminal probabilities across $N_{\text{paths}}$ simulated trajectories, alongside the analytic Black-Scholes benchmark $\Phi(d_2)$ under pure diffusion.

## Components

- **`kou_model.py`**:
  - `KouParams`: Calibrated parameter tuple ($\sigma, \lambda, p_{\text{up}}, \eta_1, \eta_2, \mu, \xi$).
  - `KouCalibrator`: Calibrates jump-diffusion parameters from discrete return series.
  - `KouMonteCarloEngine`: High-performance vectorized path simulation engine.
  - `black_scholes_terminal_prob()`: Closed-form benchmark probability under geometric Brownian motion.

## Public vs. Private Boundaries

- **Public**: Core stochastic calculus formulas, calibration pipeline, and Monte Carlo terminal probability pricing.
- **Private**: Real-time microsecond pricing loops, low-level AVX-512 / CUDA acceleration kernels, and live trade signal generation.
