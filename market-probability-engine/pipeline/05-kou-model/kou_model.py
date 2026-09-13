"""Kou (2002) Double-Exponential Jump Diffusion Probability Engine.

Implements the double-exponential jump-diffusion process for pricing short-horizon
digital/binary options (P(S_T >= K)):
    dS_t / S_t = mu dt + sigma dW_t + d(sum_{i=1}^{N_t} (V_i - 1))
where:
    W_t is a standard Brownian motion,
    N_t is a Poisson process with arrival rate lambda,
    Y_i = ln(V_i) has an asymmetric double-exponential density:
        f_Y(y) = p * eta1 * exp(-eta1 * y) * 1_{y >= 0}
               + (1-p) * eta2 * exp(eta2 * y) * 1_{y < 0}
               (with eta1 > 1 and eta2 > 0)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

EPS = 1e-12


def normal_cdf(x: float) -> float:
    """Standard normal cumulative distribution function Phi(x)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


@dataclass(frozen=True)
class KouParams:
    """Calibrated parameters of the Kou jump-diffusion process."""

    sigma: float  # Diffusive volatility per observation interval
    lam: float  # Jump arrival rate per observation interval
    p_up: float  # Probability of an upward jump (0 < p_up < 1)
    eta1: float  # Decay rate of upward jumps (eta1 > 1.0)
    eta2: float  # Decay rate of downward jumps (eta2 > 0.0)
    mu_diffusive: float  # Drift of the continuous diffusion part
    jump_count: int
    sample_count: int
    interval_seconds: float = 10.0

    @property
    def xi(self) -> float:
        """Expected relative jump size E[e^Y - 1]."""
        up_term = (
            self.p_up * self.eta1 / (self.eta1 - 1.0)
            if self.eta1 > 1.0
            else 0.0
        )
        down_term = (1.0 - self.p_up) * self.eta2 / (self.eta2 + 1.0)
        return up_term + down_term - 1.0

    @property
    def sigma_per_sqrt_second(self) -> float:
        """Normalized diffusive volatility per sqrt(second)."""
        return self.sigma / math.sqrt(max(self.interval_seconds, 1e-6))


class KouCalibrator:
    """Calibrates Kou parameters from fixed-interval return series or prices."""

    def __init__(
        self,
        min_samples: int = 30,
        interval_seconds: float = 10.0,
        cutoff_sigma: float = 3.0,
    ) -> None:
        self.min_samples = max(20, min_samples)
        self.interval_seconds = interval_seconds
        self.cutoff_sigma = cutoff_sigma

    def calibrate_from_returns(self, log_ret: np.ndarray) -> Optional[KouParams]:
        """Calibrate Kou parameters directly from a 1D array of log returns."""
        if log_ret.ndim != 1 or log_ret.size < self.min_samples:
            return None

        center0 = float(np.median(log_ret))
        abs_centered = np.abs(log_ret - center0)

        # Core-70 robust scale estimation
        quantile_70 = float(np.quantile(abs_centered, 0.70))
        core = log_ret[abs_centered <= quantile_70]
        sigma_seed = float(np.std(core, ddof=1)) if core.size >= 2 else 0.0
        mad = 1.4826 * float(np.median(abs_centered))
        if sigma_seed <= EPS:
            sigma_seed = mad
        if sigma_seed <= EPS:
            sigma_seed = float(np.std(log_ret, ddof=1))
        if sigma_seed <= EPS:
            return None

        # Filter initial jumps
        jump_mask = abs_centered > self.cutoff_sigma * sigma_seed
        body = log_ret[~jump_mask]

        if body.size >= 15:
            mu_diffusive = float(np.mean(body))
            sigma_diff = float(np.std(body, ddof=1))
            if sigma_diff <= EPS:
                sigma_diff = sigma_seed
        else:
            mu_diffusive = center0
            sigma_diff = sigma_seed

        # Re-evaluate jump mask relative to calibrated diffusive mean
        final_jump_mask = np.abs(log_ret - mu_diffusive) > self.cutoff_sigma * sigma_diff
        residuals = log_ret[final_jump_mask] - mu_diffusive
        jump_count = int(residuals.size)

        if jump_count < 3:
            return KouParams(
                sigma=sigma_diff,
                lam=max(jump_count / float(log_ret.size), 1e-6),
                p_up=0.5,
                eta1=12.0,
                eta2=12.0,
                mu_diffusive=mu_diffusive,
                jump_count=jump_count,
                sample_count=int(log_ret.size),
                interval_seconds=self.interval_seconds,
            )

        up_jumps = residuals[residuals > 0.0]
        down_jumps = -residuals[residuals < 0.0]

        if up_jumps.size == 0 or down_jumps.size == 0:
            return KouParams(
                sigma=sigma_diff,
                lam=jump_count / float(log_ret.size),
                p_up=0.98 if up_jumps.size > down_jumps.size else 0.02,
                eta1=12.0,
                eta2=12.0,
                mu_diffusive=mu_diffusive,
                jump_count=jump_count,
                sample_count=int(log_ret.size),
                interval_seconds=self.interval_seconds,
            )

        p_up = float(np.clip(up_jumps.size / jump_count, 0.02, 0.98))
        eta1 = float(np.clip(1.0 / np.mean(up_jumps), 1.01, 200.0))
        eta2 = float(np.clip(1.0 / np.mean(down_jumps), 0.1, 200.0))

        return KouParams(
            sigma=sigma_diff,
            lam=jump_count / float(log_ret.size),
            p_up=p_up,
            eta1=eta1,
            eta2=eta2,
            mu_diffusive=mu_diffusive,
            jump_count=jump_count,
            sample_count=int(log_ret.size),
            interval_seconds=self.interval_seconds,
        )

    def calibrate_from_prices(self, prices: Sequence[float]) -> Optional[KouParams]:
        """Compute log returns from prices and calibrate parameters."""
        arr = np.array(prices, dtype=float)
        if arr.size < self.min_samples + 1 or np.any(arr <= 0.0):
            return None
        log_ret = np.diff(np.log(arr))
        return self.calibrate_from_returns(log_ret)


class KouMonteCarloEngine:
    """Vectorized Monte Carlo engine for computing terminal probability P(S_T >= K)."""

    def __init__(self, n_paths: int = 25000, seed: Optional[int] = None) -> None:
        self.n_paths = max(100, int(n_paths))
        self.rng = np.random.default_rng(seed)

    def terminal_probability(
        self,
        current_price: float,
        strike_price: float,
        time_to_expiry_s: float,
        params: KouParams,
    ) -> float:
        """Estimate binary contract terminal probability P(S_T >= strike_price).

        Simulates paths over the remaining duration:
            ln(S_T / S_0) = (mu - 0.5 * sigma^2) * Delta_t
                          + sigma * sqrt(Delta_t) * Z
                          + sum_{i=1}^N Y_i
        """
        if current_price <= 0.0 or strike_price <= 0.0:
            return 0.5
        if time_to_expiry_s <= 0.0:
            return 1.0 if current_price >= strike_price else 0.0

        # Number of discrete interval periods remaining
        horizon = time_to_expiry_s / max(params.interval_seconds, 1e-6)
        sigma2_t = params.sigma * params.sigma * horizon
        lam_t = params.lam * horizon
        drift = params.mu_diffusive * horizon - 0.5 * sigma2_t
        diffusion = math.sqrt(max(sigma2_t, 0.0))

        # Standard normal draws for continuous diffusion
        diffusion_draws = self.rng.standard_normal(self.n_paths)

        # Poisson jump arrivals per path
        n_jumps = self.rng.poisson(lam_t, size=self.n_paths)
        total_jump = np.zeros(self.n_paths, dtype=float)

        max_jumps = int(n_jumps.max()) if self.n_paths > 0 else 0
        for jump_idx in range(max_jumps):
            active_idx = np.flatnonzero(n_jumps > jump_idx)
            if active_idx.size == 0:
                break
            up_mask = self.rng.random(active_idx.size) < params.p_up
            jump_sizes = np.empty(active_idx.size, dtype=float)
            n_up = int(np.sum(up_mask))

            if n_up > 0:
                jump_sizes[up_mask] = self.rng.exponential(
                    1.0 / params.eta1, size=n_up
                )
            if n_up != active_idx.size:
                jump_sizes[~up_mask] = -self.rng.exponential(
                    1.0 / params.eta2, size=active_idx.size - n_up
                )

            total_jump[active_idx] += jump_sizes

        terminal_log_return = drift + diffusion * diffusion_draws + total_jump
        log_threshold = math.log(strike_price / current_price)

        prob = float(np.mean(terminal_log_return >= log_threshold))
        return float(np.clip(prob, 0.0, 1.0))


def black_scholes_terminal_prob(
    current_price: float,
    strike_price: float,
    time_to_expiry_s: float,
    sigma_per_sqrt_second: float,
    drift_per_second: float = 0.0,
) -> float:
    """Analytical benchmark: terminal probability P(S_T >= K) under pure Brownian motion.

    Calculates Phi(d2):
        d2 = ( ln(S / K) + (mu - 0.5 * sigma^2) * T ) / (sigma * sqrt(T))
    """
    if current_price <= 0.0 or strike_price <= 0.0:
        return 0.5
    if time_to_expiry_s <= 0.0:
        return 1.0 if current_price >= strike_price else 0.0
    if sigma_per_sqrt_second <= EPS:
        return 1.0 if current_price >= strike_price else 0.0

    sigma_t = sigma_per_sqrt_second * math.sqrt(time_to_expiry_s)
    if sigma_t <= EPS:
        return 1.0 if current_price >= strike_price else 0.0

    drift_t = (drift_per_second - 0.5 * (sigma_per_sqrt_second**2)) * time_to_expiry_s
    d2 = (math.log(current_price / strike_price) + drift_t) / sigma_t
    return float(np.clip(normal_cdf(d2), 0.0, 1.0))
