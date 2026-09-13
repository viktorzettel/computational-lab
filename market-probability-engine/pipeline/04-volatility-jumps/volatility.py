"""Volatility Estimation Utilities for High-Frequency Return Series.

Implements realized volatility, Parkinson extreme-value estimator,
Barndorff-Nielsen & Shephard Bipower Variation (jump-robust),
and exponentially weighted moving average (EWMA) variants.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

EPS = 1e-12


def realized_volatility(
    log_returns: np.ndarray,
    annualize: bool = False,
    dt_seconds: float = 10.0,
) -> float:
    """Compute sample standard deviation of log returns.

    Args:
        log_returns: 1D array of log returns.
        annualize: If True, scales sigma to annual standard deviation.
        dt_seconds: Interval duration in seconds per observation.
    """
    if log_returns.size < 2:
        return 0.0
    sigma = float(np.std(log_returns, ddof=1))
    if annualize and dt_seconds > 0:
        seconds_per_year = 365.25 * 86400.0
        return sigma * math.sqrt(seconds_per_year / dt_seconds)
    return sigma


def parkinson_volatility(
    highs: np.ndarray,
    lows: np.ndarray,
    annualize: bool = False,
    dt_seconds: float = 10.0,
) -> float:
    """Compute Parkinson (1980) extreme-value volatility estimator from High/Low prices.

    The Parkinson estimator uses intraday range information, providing roughly
    5x greater statistical efficiency than close-to-close realized volatility:
        sigma_park = sqrt( (1 / (4 * ln(2) * N)) * sum( ln(H_i / L_i)^2 ) )
    """
    if highs.size != lows.size or highs.size < 2:
        return 0.0

    valid = (highs > 0.0) & (lows > 0.0) & (highs >= lows)
    h_valid = highs[valid]
    l_valid = lows[valid]

    if h_valid.size < 2:
        return 0.0

    # Avoid zero division inside log when high == low
    ratios = np.maximum(h_valid / l_valid, 1.0)
    log_hl_sq = np.log(ratios) ** 2

    variance = np.sum(log_hl_sq) / (4.0 * math.log(2.0) * h_valid.size)
    sigma = float(math.sqrt(max(variance, 0.0)))

    if annualize and dt_seconds > 0:
        seconds_per_year = 365.25 * 86400.0
        return sigma * math.sqrt(seconds_per_year / dt_seconds)
    return sigma


def bipower_variation_sigma(
    log_returns: np.ndarray,
    center_returns: bool = True,
) -> float:
    """Compute Barndorff-Nielsen & Shephard (2004) Bipower Variation scale.

    Bipower variation is asymptotically immune to rare jump discontinuities,
    isolating the continuous diffusive volatility component sigma_diff:
        BV = (pi / 2) * (1 / (N - 1)) * sum_{i=2}^N |r_i| * |r_{i-1}|
        sigma_bv = sqrt(BV)
    """
    if log_returns.ndim != 1 or log_returns.size < 2:
        return 0.0

    vals = log_returns
    if center_returns:
        vals = vals - float(np.median(vals))

    abs_r = np.abs(vals)
    bv = (math.pi / 2.0) * float(np.mean(abs_r[1:] * abs_r[:-1]))
    return float(math.sqrt(max(bv, EPS)))


def ewma_volatility(
    log_returns: np.ndarray,
    half_life_periods: float,
) -> float:
    """Compute exponentially weighted moving average (EWMA) volatility.

    Args:
        log_returns: 1D array of log returns.
        half_life_periods: Half-life expressed in number of candle periods.
    """
    if log_returns.size < 2:
        return 0.0

    decay = math.exp(math.log(0.5) / max(1.0, float(half_life_periods)))
    center = float(np.median(log_returns))
    variance = float(np.var(log_returns - center, ddof=1))

    for r in log_returns:
        variance = decay * variance + (1.0 - decay) * float((r - center) ** 2)

    return float(math.sqrt(max(variance, EPS)))


def ewma_bipower_volatility(
    log_returns: np.ndarray,
    half_life_periods: float,
) -> float:
    """Compute EWMA Bipower Variation (jump-robust dynamic scale)."""
    if log_returns.ndim != 1 or log_returns.size < 2:
        return 0.0

    decay = math.exp(math.log(0.5) / max(1.0, float(half_life_periods)))
    center = float(np.median(log_returns))
    abs_r = np.abs(log_returns - center)
    adjacent_products = abs_r[1:] * abs_r[:-1]

    mean_prod = float(np.mean(adjacent_products))
    var_bv = (math.pi / 2.0) * mean_prod

    for prod in adjacent_products:
        var_bv = decay * var_bv + (1.0 - decay) * (math.pi / 2.0) * float(prod)

    return float(math.sqrt(max(var_bv, EPS)))
