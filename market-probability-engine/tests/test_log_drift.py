"""Regression checks for the public model's log-return drift convention."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

MODULE = Path(__file__).parents[1] / 'pipeline/05-kou-model/kou_model.py'
spec = importlib.util.spec_from_file_location('kou_model', MODULE)
module = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class LogDriftTests(unittest.TestCase):
    def test_kou_and_diffusion_agree_without_jumps(self):
        # A nonzero mean log return detects an erroneous second -sigma²/2 term.
        mu, sigma, horizon = 0.0012, 0.025, 12
        params = module.KouParams(sigma, 0, .5, 12, 12, mu, 0, 100, 10)
        simulated = module.KouMonteCarloEngine(n_paths=200_000, seed=13).terminal_probability(
            100, 101, horizon * 10, params
        )
        analytic = module.black_scholes_terminal_prob(
            100, 101, horizon * 10, sigma / np.sqrt(10), mu / 10
        )
        self.assertAlmostEqual(simulated, analytic, delta=.004)

    def test_calibrator_reports_log_return_mean(self):
        rng = np.random.default_rng(4)
        returns = rng.normal(.0006, .012, 5000)
        params = module.KouCalibrator(min_samples=100).calibrate_from_returns(returns)
        self.assertIsNotNone(params)
        self.assertAlmostEqual(params.mu_diffusive, np.mean(returns), delta=.0005)


if __name__ == '__main__':
    unittest.main()
