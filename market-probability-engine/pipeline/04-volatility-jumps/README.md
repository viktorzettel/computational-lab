# 04 · Volatility & Jump Estimation

Estimates the continuous volatility component of high-frequency returns and identifies discrete return innovations that may be better represented by a jump component.

## Theoretical Foundations

A pure geometric Brownian-motion benchmark assumes:
$$
\frac{dS_t}{S_t} = \mu \, dt + \sigma \, dW_t
$$

At short horizons, crypto returns can exhibit heavy tails and abrupt price moves. The project therefore uses robust volatility and jump-detection estimators to separate typical diffusive variation from unusually large return innovations.

For semimartingale models with jumps, quadratic variation can be written as:
$$
[r, r]_t = \underbrace{\int_0^t \sigma_s^2 \, ds}_{\text{Continuous Diffusion}} + \underbrace{\sum_{0 < s \le t} (\Delta \ln S_s)^2}_{\text{Discrete Jumps}}
$$

### Estimators Implemented

1. **Realized Volatility ($RV$)**: Standard sample standard deviation across intervals.
2. **Parkinson Volatility ($\sigma_{\text{park}}$)**: Range-based estimator using high/low prices:
   $$
   \sigma_{\text{park}} = \sqrt{\frac{1}{4 \ln(2) N} \sum_{i=1}^N \left(\ln \frac{H_i}{L_i}\right)^2}
   $$
3. **Bipower Variation ($BV$)**: Barndorff-Nielsen & Shephard estimator designed to be robust to finite-activity jumps:
   $$
   BV = \frac{\pi}{2} \frac{1}{N-1} \sum_{i=2}^N |r_i| |r_{i-1}|, \quad \sigma_{\text{diff}} = \sqrt{BV}
   $$
4. **Core-70 & MAD Thresholding**: Robust scale-based methods for flagging unusually large return innovations.
5. **Kou Jump Parameter Estimation**:
   - $\lambda$: estimated jump arrival frequency.
   - $p_{\text{up}}$: estimated share of positive jumps.
   - $\eta_1, \eta_2$: exponential decay parameters for positive and negative jump magnitudes.

## Components

- **`volatility.py`**: Realized, Parkinson, Bipower Variation, EWMA, and EW bipower estimators.
- **`jump_detection.py`**: Robust thresholding and estimation of asymmetric double-exponential jump parameters.

## Reference Calibration

The public code includes explicit defaults so the methods can be run independently. These are **baseline research settings** and may differ from the current private production calibration as the project develops.

## Public vs. Private Boundaries

- **Public**: Volatility estimators, jump-detection methodology, parameter-estimation formulas, and baseline defaults.
- **Private**: Current production windows, tuned thresholds, signal integration, and live streaming configuration.
