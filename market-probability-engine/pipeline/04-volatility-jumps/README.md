# 04 · Volatility & Jump Estimation

Decomposes high-frequency return variation into a continuous Brownian diffusion component and a discrete jump-diffusion component.

## Theoretical Foundations

Standard Black-Scholes modeling assumes asset prices follow pure geometric Brownian motion:
$$
\frac{dS_t}{S_t} = \mu \, dt + \sigma \, dW_t
$$

Empirical short-horizon returns (e.g. 5-minute intervals) exhibit pronounced heavy tails, leptokurtosis, and sudden directional shocks. To capture this without model misspecification, total quadratic variation is decomposed into:
$$
[r, r]_t = \underbrace{\int_0^t \sigma_s^2 \, ds}_{\text{Continuous Diffusion}} + \underbrace{\sum_{0 < s \le t} (\Delta \ln S_s)^2}_{\text{Discrete Jumps}}
$$

### Estimators Implemented

1. **Realized Volatility ($RV$)**: Standard sample standard deviation across intervals.
2. **Parkinson Volatility ($\sigma_{\text{park}}$)**: Extreme-value estimator exploiting high/low prices:
   $$
   \sigma_{\text{park}} = \sqrt{\frac{1}{4 \ln(2) N} \sum_{i=1}^N \left(\ln \frac{H_i}{L_i}\right)^2}
   $$
3. **Bipower Variation ($BV$)**: Barndorff-Nielsen & Shephard (2004) estimator asymptotically robust to jumps:
   $$
   BV = \frac{\pi}{2} \frac{1}{N-1} \sum_{i=2}^N |r_i| |r_{i-1}|, \quad \sigma_{\text{diff}} = \sqrt{BV}
   $$
4. **Core-70 & MAD Thresholding**: Isolates jump innovations exceeding $k \cdot \sigma_{\text{robust}}$ from the return distribution.
5. **Kou Jump Parameter Calibration**:
   - $\lambda$: Jump arrival frequency per time unit.
   - $p_{\text{up}}$: Fraction of upward jumps.
   - $\eta_1, \eta_2$: Exponential decay rates of upward and downward jumps ($\mathbb{E}[Y^+] = 1/\eta_1, \mathbb{E}[Y^-] = 1/\eta_2$).

## Components

- **`volatility.py`**: Realized, Parkinson, Bipower Variation, EWMA, and EWBP estimators.
- **`jump_detection.py`**: Scale thresholding (`core70`, `mad`, `bipower`) and analytical MLE parameter fitting for asymmetric double-exponential jumps.

## Public vs. Private Boundaries

- **Public**: Volatility estimators, jump thresholding math, and parameter estimation formulas.
- **Private**: Production latency budgets, streaming sliding-window buffers, and proprietary filter tunings.
