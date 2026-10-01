"""Deterministic samples, never represented as current market prices."""
from datetime import datetime, timedelta, timezone
import hashlib
import math
import random
from ..catalog import ASSETS, search_catalog
from ..models import Asset, Bar, Quote, Timeframe
from .base import AssetNotFound

SAMPLE_TIME = int(datetime(2026, 9, 29, 20, tzinfo=timezone.utc).timestamp())
DEMO_WARNING = "Synthetic sample data, fixed at 2026-09-29 20:00 UTC. These are not live market prices."
EQUITY_TIMEFRAMES: tuple[Timeframe, ...] = ("1m", "5m", "15m", "1h", "1D", "1W")
CRYPTO_TIMEFRAMES: tuple[Timeframe, ...] = ("1m", "5m", "15m", "1h", "1D")
INTERVALS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1D": 86400, "1W": 604800}
SAMPLE_PRICES = {"AAPL": 228.37, "NVDA": 181.26, "MU": 152.48, "MRVL": 84.16,
                 "MSFT": 514.28, "AMZN": 239.72, "GOOGL": 218.13, "META": 742.11,
                 "TSLA": 346.88, "AMD": 168.94, "AVGO": 327.65, "PLTR": 158.21,
                 "SPY": 654.91, "QQQ": 593.72, "IWM": 241.29, "VTI": 316.16,
                 "GLD": 338.24, "TLT": 89.32, "^GSPC": 6538.76, "^IXIC": 22189.32, "^NDX": 24391.74,
                 "^DJI": 46218.44, "^VIX": 17.82, "BTC-USD": 112846.5, "ETH-USD": 4182.73,
                 "SOL-USD": 218.94, "XRP-USD": 2.86, "DOGE-USD": 0.2481,
                 "ADA-USD": 0.8125, "LINK-USD": 24.36, "AVAX-USD": 37.62, "LTC-USD": 121.47}


def _seed(symbol: str, timeframe: str) -> int:
    return int.from_bytes(hashlib.sha256(f"atlas-v1:{symbol}:{timeframe}".encode()).digest()[:8], "big")


def _path(symbol: str, timeframe: str, count: int) -> list[float]:
    rng = random.Random(_seed(symbol, timeframe))
    volatility = {"1m": .0011, "5m": .0025, "15m": .004, "1h": .007, "1D": .019, "1W": .032}[timeframe]
    log_prices = [0.0]
    for i in range(1, count):
        drift = .0014 if timeframe in {"1D", "1W"} else .00013
        cycle = math.sin(i / 17) * volatility * .16
        log_prices.append(log_prices[-1] + rng.gauss(drift + cycle, volatility))
    # Every timeframe ends at the same sample quote; switching intervals cannot invent a new price.
    base = SAMPLE_PRICES.get(symbol, 40 + _seed(symbol, "price") % 250)
    return [base * math.exp(value - log_prices[-1]) for value in log_prices]


class DemoProvider:
    name = "demo"
    supported_timeframes = EQUITY_TIMEFRAMES

    def get_asset(self, symbol: str) -> Asset:
        if symbol not in ASSETS:
            raise AssetNotFound(f"Unknown asset: {symbol}")
        return ASSETS[symbol]

    def search_symbols(self, query: str) -> list[Asset]:
        return search_catalog(query)

    def get_quote(self, symbol: str) -> Quote:
        closes = _path(symbol, "1D", 400)
        price, previous = closes[-1], closes[-2]
        return Quote(symbol=symbol, price=round(price, 6), previous_close=round(previous, 6),
                     change=round(price - previous, 6), change_percent=(price / previous - 1) * 100,
                     timestamp=SAMPLE_TIME, source=self.name, market_state="SAMPLE", warning=DEMO_WARNING)

    def get_history(self, symbol: str, timeframe: Timeframe, start: int | None = None, end: int | None = None) -> list[Bar]:
        interval = INTERVALS[timeframe]
        count = 400 if timeframe == "1D" else 260 if timeframe == "1W" else 420
        closes = _path(symbol, timeframe, count)
        rng = random.Random(_seed(symbol, timeframe) + 1)
        timestamps = []
        instant = datetime.fromtimestamp(SAMPLE_TIME, timezone.utc)
        if timeframe in {"1D", "1W"}:
            instant = instant.replace(hour=0)
        else:
            instant -= timedelta(seconds=interval)
        is_crypto = "-" in symbol and not symbol.startswith("^")
        while len(timestamps) < count:
            if is_crypto or instant.weekday() < 5:
                if timeframe in {"1D", "1W"} or is_crypto or (13 * 60 + 30 <= instant.hour * 60 + instant.minute < 20 * 60):
                    timestamps.append(int(instant.timestamp()))
            instant -= timedelta(seconds=interval)
        timestamps.reverse()
        bars = []
        for i, close in enumerate(closes):
            opening = closes[i - 1] if i else close * .998
            wick = abs(rng.gauss(.0025, .0018)) * close
            volume = rng.uniform(500_000, 7_500_000) if not is_crypto else rng.uniform(60, 1800)
            if timeframe not in {"1D", "1W"}:
                volume *= interval / 23400
            bar = Bar(time=timestamps[i], open=round(opening, 6), close=round(close, 6),
                      high=round(max(opening, close) + wick, 6), low=round(max(.000001, min(opening, close) - wick), 6),
                      volume=round(volume, 4))
            if (start is None or bar.time >= start) and (end is None or bar.time <= end):
                bars.append(bar)
        return bars

    def get_fundamentals(self, symbol: str) -> dict:
        return {"symbol": symbol, "source": self.name, "warning": DEMO_WARNING, "available": False,
                "message": "Fundamentals are not fabricated for sample mode."}
