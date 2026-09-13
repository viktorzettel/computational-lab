"""Jump Detection and Asymmetric Jump Parameter Estimation.

Isolates discrete discontinuous jump innovations from continuous diffusion
in high-frequency return series using threshold techniques (Core-70, MAD, Bipower)
and estimates Kou double-exponential jump parameters (lambda, p_up, eta1, eta2).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np

try:
    from .volatility import bipower_variation_sigma
except ImportError:
    from volatility import bipower_variation_sigma  # type: ignore

EPS = 1e-12


@dataclass(frozen=True)
class JumpEstimates:
    """Estimated parameters of the compound Poisson jump process."""

    lam: float  # Jump intensity per observation period
    p_up: float  # Probability that a jump is positive
    eta1: float  # Exponential decay parameter for positive jumps (mean = 1/eta1)
    eta2: float  # Exponential decay parameter for negative jumps (mean = 1/eta2)
    jump_count: int
    sample_count: int


def detect_jumps(
    log_returns: np.ndarray,
    method: Literal["core70", "mad", "bipower"] = "core70",
    cutoff_sigma: float = 3.0,
) -> tuple[float, float, np.ndarray]:
    """Detect jump innovations by filtering against a robust scale estimator.

    Args:
        log_returns: 1D array of log returns.
        method: Scale estimator to use ('core70', 'mad', or 'bipower').
        cutoff_sigma: Number of robust sigmas defining the jump threshold.

    Returns:
        (center, sigma_diffusive, jump_mask)
        where jump_mask is a boolean numpy array (True indicates a jump).
    """
    if log_returns.ndim != 1 or log_returns.size < 20:
        raise ValueError("At least 20 log return observations required for jump detection.")

    center0 = float(np.median(log_returns))
    abs_centered = np.abs(log_returns - center0)

    if method == "core70":
        # Core-70: estimate scale from the inter-quantile 70% body to drop tails
        quantile_70 = float(np.quantile(abs_centered, 0.70))
        core = log_returns[abs_centered <= quantile_70]
        sigma_seed = float(np.std(core, ddof=1)) if core.size >= 2 else 0.0
        mad = 1.4826 * float(np.median(abs_centered))
        if sigma_seed <= EPS:
            sigma_seed = mad
        provisional_mask = abs_centered > cutoff_sigma * max(sigma_seed, EPS)
        body = log_returns[~provisional_mask]
        if body.size >= 15:
            center = float(np.mean(body))
            sigma = float(np.std(body, ddof=1))
        else:
            center, sigma = center0, sigma_seed

    elif method == "mad":
        center = center0
        sigma = 1.4826 * float(np.median(abs_centered))

    elif method == "bipower":
        center = center0
        sigma = bipower_variation_sigma(log_returns, center_returns=True)

    else:
        raise ValueError(f"Unknown detection method: {method}")

    sigma = max(float(sigma), EPS)
    jump_mask = np.abs(log_returns - center) > cutoff_sigma * sigma
    return center, sigma, jump_mask


def estimate_jump_parameters(
    log_returns: np.ndarray,
    jump_mask: np.ndarray,
    diffusive_center: float = 0.0,
    eta_min: float = 1.01,
    eta_max: float = 200.0,
) -> JumpEstimates:
    """Estimate asymmetric double-exponential jump parameters from detected jumps.

    In the Kou model, jump sizes Y follow:
        f_Y(y) = p * eta1 * exp(-eta1 * y) * 1_{y >= 0}
               + (1-p) * eta2 * exp(eta2 * y) * 1_{y < 0}

    Maximum likelihood estimators on detected jump residuals:
        eta1_hat = 1 / mean(Y | Y > 0)
        eta2_hat = 1 / mean(-Y | Y < 0)
        p_up_hat = count(Y > 0) / count(Y)
    """
    total_samples = log_returns.size
    residuals = log_returns[jump_mask] - diffusive_center
    count = int(residuals.size)

    if count < 3:
        # Default regularized prior for low-jump regimes
        return JumpEstimates(
            lam=max(count / float(total_samples), 1e-6),
            p_up=0.5,
            eta1=12.0,
            eta2=12.0,
            jump_count=count,
            sample_count=total_samples,
        )

    up_jumps = residuals[residuals > 0.0]
    down_jumps = -residuals[residuals < 0.0]

    # Symmetric fallback if jumps are strictly one-sided
    if up_jumps.size == 0 or down_jumps.size == 0:
        return JumpEstimates(
            lam=count / float(total_samples),
            p_up=0.98 if up_jumps.size > down_jumps.size else 0.02,
            eta1=12.0,
            eta2=12.0,
            jump_count=count,
            sample_count=total_samples,
        )

    p_up = float(np.clip(up_jumps.size / count, 0.02, 0.98))
    eta1 = float(np.clip(1.0 / np.mean(up_jumps), eta_min, eta_max))
    eta2 = float(np.clip(1.0 / np.mean(down_jumps), eta_min, eta_max))

    return JumpEstimates(
        lam=count / float(total_samples),
        p_up=p_up,
        eta1=eta1,
        eta2=eta2,
        jump_count=count,
        sample_count=total_samples,
    )
