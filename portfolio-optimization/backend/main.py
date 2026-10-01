# filename: main.py
# RiskLens research backend
import numpy as np
import pandas as pd
import yfinance as yf
import riskfolio as rp
import warnings
import os
import re
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, validator, Field
from typing import List, Dict, Optional, Any
from fastapi.middleware.cors import CORSMiddleware
from functools import lru_cache
from datetime import datetime

# Suppress warnings
warnings.filterwarnings("ignore")

# Initialize the API
app = FastAPI(title="RiskLens API", version="3.0")

# Allow the frontend (React) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("RISKLENS_CORS_ORIGINS", "https://portfoliolens.netlify.app,http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# UNIVERSAL SERIALIZER (The "Numpy Hunter")
# ==========================================================
def clean_payload(obj: Any) -> Any:
    """
    Recursively converts ALL numpy/pandas types to native Python types.
    This prevents the 'numpy.int32 is not iterable' error in FastAPI.
    """
    if isinstance(obj, dict):
        return {str(k): clean_payload(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, np.ndarray, pd.Index)):
        return [clean_payload(x) for x in obj]
    elif isinstance(obj, (np.floating, float)):
        if np.isnan(obj) or np.isinf(obj): return 0.0
        return float(round(float(obj), 4))
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.str_, str)):
        return str(obj)
    elif pd.isna(obj):
        return None
    return obj

# ==========================================================
# CACHING LAYER & DATA FETCHING
# ==========================================================
@lru_cache(maxsize=32)
def fetch_market_data(tickers_tuple: tuple, lookback_years: int):
    """
    Cached function to prevent hitting Yahoo Finance repeatedly.
    """
    tickers_list = list(tickers_tuple)
    print(f"[{datetime.now().time()}] Downloading data for: {tickers_list}")

    # Download data
    data = yf.download(tickers_list, period=f"{lookback_years}y", interval="1d", auto_adjust=True, threads=False)

    # Handle yfinance returning MultiIndex columns
    if isinstance(data.columns, pd.MultiIndex):
        # If 'Close' is in levels, check validity
        try:
            data = data['Close']
        except KeyError:
             # Fallback: sometimes single level but different structure
             pass

    # 1. Check for empty dataframe
    if data.empty:
        raise ValueError("Market data source returned empty result. Please check connection.")

    # 2. Check for "Fake" tickers (Columns that are all NaN)
    # yfinance often returns a column of NaNs for invalid tickers
    failed_cols = data.columns[data.isna().all()].tolist()
    if failed_cols:
         raise ValueError(f"Could not find data for ticker(s): {', '.join(failed_cols)}")

    # 3. Clean Data
    data = data.ffill().dropna()

    # 4. Check for sufficient history
    if data.shape[0] < 50:
         raise ValueError(f"Not enough historical data. Found {data.shape[0]} days, need 50+.")

    # 5. Check for remaining Columns (Did dropna kill everything?)
    if data.shape[1] < 2:
        raise ValueError("After cleaning data, fewer than 2 assets remain. Cannot build portfolio.")

    return data


# ==========================================================
# INPUT SANITIZATION (The Bouncer)
# ==========================================================
class PortfolioRequest(BaseModel):
    tickers: List[str] = Field(..., min_items=2, max_items=10)
    strategy: str = "smart_balance"
    force_min_weight: bool = False

    @validator('tickers')
    def sanitize_tickers(cls, v):
        # 1. Uppercase and Trim
        top_clean = [t.strip().upper() for t in v]
        
        # 2. Remove Duplicates (preserve order)
        seen = set()
        unique = [x for x in top_clean if not (x in seen or seen.add(x))]
        
        # 3. Check Constraints
        if len(unique) < 2:
            raise ValueError("Must provide at least 2 distinct tickers.")
        if len(unique) > 10:
            raise ValueError("Maximum 10 assets allowed.")
        if any(not re.fullmatch(r'[A-Z0-9.^=-]{1,15}', x) for x in unique):
            raise ValueError("One or more ticker symbols have an invalid format.")
            
        return unique

    @validator('strategy')
    def validate_strategy(cls, v):
        if v not in {'safety_first', 'smart_balance', 'aggressive_growth'}:
            raise ValueError("Unknown allocation method.")
        return v


# ==========================================================
# LOGIC CLASSES
# ==========================================================
class DataManager:
    def __init__(self, tickers, lookback_years=5):
        self.tickers = sorted(list(set(tickers)))

        try:
            self.data = fetch_market_data(tuple(self.tickers), lookback_years)
        except Exception as e:
            # Propagate specific ValueErrors from fetch_market_data
            raise ValueError(str(e))

        # Filter tickers to match what actually came back in data
        self.available_tickers = list(self.data.columns)
        
        if len(self.available_tickers) < 2:
             raise ValueError("Insufficient valid assets found to build portfolio.")

        # Calculate Returns and Sanitize
        self.returns = self.data.pct_change().dropna()
        
        # Final safety check for Infinite values
        if not np.isfinite(self.returns.values).all():
             self.returns = self.returns.replace([np.inf, -np.inf], np.nan).dropna()

        self.has_crypto = all(t.endswith('-USD') for t in self.available_tickers)
        self.trading_days = 365 if self.has_crypto else 252


class MarketRegime:
    """Market regime detection using Mahalanobis distance."""
    def __init__(self, data_manager):
        try:
            self.returns = data_manager.data.resample('W').last().pct_change().dropna()
        except:
             # Fallback to daily if weekly fails (e.g. short history)
             self.returns = data_manager.returns

    def get_status(self):
        try:
            mu = self.returns.mean()
            cov = self.returns.cov()
            cov_inv = np.linalg.pinv(cov)

            latest_ret = self.returns.iloc[-1]
            diff = latest_ret - mu
            score = diff.values.dot(cov_inv).dot(diff.values.T)
            score = float(score)

            # Heuristic thresholds
            if score < 12:
                return {"score": float(score), "color": "Green", "message": "Calm"}
            elif score < 25:
                return {"score": float(score), "color": "Yellow", "message": "Choppy"}
            else:
                return {"score": float(score), "color": "Red", "message": "Turbulent"}
        except Exception:
             # Safe fallback
             return {"score": 0.0, "color": "Green", "message": "Unknown"}


class PortfolioArchitect:
    """
    Optimizes portfolio with Cascading Fallback Strategy.
    1. HRP (Primary)
    2. Mean-Variance (Constraint-based Fallback)
    """
    def __init__(self, data_manager, force_min_weight=False):
        self.returns = data_manager.returns
        self.n_assets = len(self.returns.columns)
        self.tickers = list(self.returns.columns)
        self.force_min_weight = force_min_weight
        self.cluster_order = None
        self.method_used = None

    def build_portfolio(self, objective):
        # Path 1: Safety First -> HRP (Hierarchical Risk Parity)
        if objective == 'safety_first':
            try:
                print("Strategy: Safety First -> Attempting HRP")
                return self._build_hrp(objective)
            except Exception as e:
                print(f"HRP Optimization Failed: {e}")
        
        # Path 2: Risk-adjusted allocation -> NCO with a Sharpe objective.
        elif objective == 'smart_balance':
            try:
                print(f"Strategy: {objective} -> Attempting NCO")
                return self._build_nco(objective)
            except Exception as e:
                print(f"NCO Optimization Failed: {e}")

        # Path 3: Return-seeking allocation -> constrained mean-variance.
        elif objective == 'aggressive_growth':
            try:
                return self._build_mean_variance(objective)
            except Exception as e:
                print(f"Mean-Variance Optimization Failed: {e}")

        # Fallback: Mean-Variance (Constraint-based)
        try:
            print("Fallback Strategy: Mean-Variance")
            return self._build_mean_variance(objective)
        except Exception as e:
            print(f"Mean-Variance Optimization Failed: {e}")
            
        # No Fallback 3 (Equal Weights) per user request
        raise ValueError("Portfolio optimization failed for all methods. Please check input data.")

    def _build_hrp(self, objective):
        port = rp.HCPortfolio(returns=self.returns)
        
        # Safety First = CVaR (Tail Risk), Ward Linkage
        weights = port.optimization(
            model='HRP',
            codependence='pearson',
            rm='CVaR', 
            rf=0.0,
            linkage='ward',
            leaf_order=True
        )
        result = self._process_weights(weights, objective, port)
        self.method_used = 'HRP / CVaR'
        return result

    def _build_nco(self, objective):
        port = rp.HCPortfolio(returns=self.returns)
        weights = port.optimization(
            model='NCO',
            codependence='pearson',
            obj='Sharpe',
            rm='MV',
            rf=0.0,
            linkage='ward',
            leaf_order=True
        )
        result = self._process_weights(weights, objective, port)
        self.method_used = 'NCO / Sharpe'
        return result

    def _process_weights(self, weights, objective, port):
        if weights is None or weights.empty:
            raise ValueError("Optimization returned empty weights")

        # Safer column access
        w_series = weights.iloc[:, 0]
        weights_dict = w_series.to_dict()
        
        weights_dict = self._apply_constraints(weights_dict, objective)
        self._set_cluster_order(port)
        
        return weights_dict, self.cluster_order

    def _build_mean_variance(self, objective):
        port = rp.Portfolio(returns=self.returns)
        port.assets_stats(method_mu='hist', method_cov='hist')

        min_w = 0.05 if self.force_min_weight else 0.0
        max_w = 0.60 if objective == 'aggressive_growth' else 1.0
        
        port.lowerret = None
        port.upperlng = max_w
        port.lowerlng = min_w
        
        obj_map = {'safety_first': 'MinRisk', 'smart_balance': 'Sharpe', 'aggressive_growth': 'MaxRet'}
        
        weights = port.optimization(
            model='Classic',
            rm='MV',
            obj=obj_map.get(objective, 'Sharpe'),
            rf=0.0
        )

        if weights is None or weights.empty:
            raise ValueError("Mean-Variance returned empty weights")

        w_series = weights.iloc[:, 0]
        weights_dict = w_series.to_dict()
        
        # Normalize just in case
        total = sum(weights_dict.values())
        weights_dict = {k: v/total for k, v in weights_dict.items()}
        
        self.cluster_order = self.tickers
        self.method_used = 'Mean–variance / ' + obj_map.get(objective, 'Sharpe')
        return weights_dict, self.cluster_order

    def _apply_constraints(self, weights_dict, objective):
        """Manually apply min/max constraints for HRP outputs"""
        # (Simplified Logic for HRP post-processing constraint)
        if self.force_min_weight:
             keys = list(weights_dict.keys())
             vals = np.maximum(np.array(list(weights_dict.values()), dtype=float), 0)
             # Reserve the 5% floor first, then distribute the remaining
             # weight in proportion to the unconstrained allocation.
             floor = 0.05
             room = 1.0 - len(vals) * floor
             vals = np.full(len(vals), floor) + room * vals / vals.sum()
             weights_dict = dict(zip(keys, vals))

        return {k: float(v) for k,v in weights_dict.items()}

    def _set_cluster_order(self, port):
        try:
             # Try various attribute names for robustness across versions
             if hasattr(port, 'sort_order') and port.sort_order is not None:
                 self.cluster_order = list(port.sort_order)
             elif hasattr(port, 'clusters') and port.clusters is not None:
                 self.cluster_order = list(port.clusters)
             else:
                 self.cluster_order = self.tickers
        except:
             self.cluster_order = self.tickers


class RiskEngine:
    """Calculates risk metrics and handles serialization."""
    def __init__(self, data_manager, weights):
        self.returns = data_manager.returns
        # Ensure weights align with returns columns
        self.weights = np.array([weights.get(t, 0.0) for t in self.returns.columns])
        self.weights_dict = weights
        self.cov = self.returns.cov() * data_manager.trading_days

    def calculate_diversification_ratio(self):
        try:
            individual_vols = np.sqrt(np.diag(self.cov))
            weighted_sum_vols = np.sum(self.weights * individual_vols)
            portfolio_vol = np.sqrt(np.dot(self.weights.T, np.dot(self.cov, self.weights)))
            
            if portfolio_vol > 0:
                return float(weighted_sum_vols / portfolio_vol)
            return 1.0
        except:
            return 1.0

    def run_stress_test(self):
        portfolio_series = self.returns.dot(self.weights).dropna() * 100
        if portfolio_series.empty:
            raise ValueError("Insufficient returns to estimate portfolio risk.")
        # Empirical one-day risk estimates. The 5th percentile need not be a
        # loss; in that case the reported loss threshold is zero.
        lower_quantile = float(np.percentile(portfolio_series, 5))
        tail = portfolio_series[portfolio_series <= lower_quantile]
        vol = float(portfolio_series.std())
        VaR_95 = max(0.0, -lower_quantile)
        ES_95 = max(0.0, -float(tail.mean())) if len(tail) else VaR_95

        return {
            "volatility": float(vol),
            "VaR_95": float(VaR_95),
            "ES_95": float(ES_95),
            "diversification_ratio": float(self.calculate_diversification_ratio()),
            "method": "historical_empirical_daily",
            #"risk_contribution": self._calc_risk_contribution() # Kept simple for now
        }


# ==========================================================
# ENDPOINTS
# ==========================================================
@app.get("/")
def home():
    return {"message": "RiskLens API active", "version": "3.0"}

@app.post("/analyze")
def analyze_portfolio(request: PortfolioRequest):
    try:
        # 1. Load Data
        dm = DataManager(request.tickers)

        # 2. Market Regime
        regime = MarketRegime(dm)
        market_status = regime.get_status()

        # 3. Build Portfolio (HRP -> MV -> Error)
        architect = PortfolioArchitect(dm, force_min_weight=request.force_min_weight)
        weights_dict, cluster_order = architect.build_portfolio(request.strategy)

        # 4. Correlation Matrix
        corr_matrix = dm.returns.corr().round(4)
        corr_data = {
            "labels": list(corr_matrix.columns),
            # Convert to list of lists of floats
            "values": corr_matrix.values.tolist()
        }

        # 5. Risk Metrics
        risk_engine = RiskEngine(dm, weights_dict)
        risk_metrics = risk_engine.run_stress_test()
        
        # 6. Construct Safe Response
        # Clean entire dictionary to ensure no numpy types leak
        response_payload = {
            "market_status": market_status,
            "weights": weights_dict,
            "risk_metrics": risk_metrics,
            "optimization_method": architect.method_used,
            "sample": {
                "observations": len(dm.returns),
                "start": str(dm.returns.index[0].date()),
                "end": str(dm.returns.index[-1].date()),
            },
            "cluster_order": cluster_order,
            "correlation_matrix": corr_data
        }
        
        return clean_payload(response_payload)

    except ValueError as e:
        # Expected business logic errors (e.g. bad inputs)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected server errors
        print(f"CRITICAL SERVER ERROR: {str(e)}")
        # In production, you'd log stack trace here
        raise HTTPException(status_code=500, detail="Internal Calculation Error. Please check inputs and try again.")
