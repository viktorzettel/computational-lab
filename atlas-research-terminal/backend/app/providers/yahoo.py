"""Yahoo data via yfinance; get_info quote snapshots never request history."""
from datetime import datetime, timezone
import math
import threading
import time
import yfinance as yf
from ..models import Asset, Bar, Quote, Timeframe
from .base import AssetNotFound, ProviderError
from .demo import EQUITY_TIMEFRAMES

QUOTE_TYPES = {"EQUITY": "stock", "ETF": "etf", "INDEX": "index", "CRYPTOCURRENCY": "crypto"}
INTERVALS = {"1m": ("1m", "5d"), "5m": ("5m", "1mo"), "15m": ("15m", "1mo"),
             "1h": ("1h", "3mo"), "1D": ("1d", "2y"), "1W": ("1wk", "5y")}


class YahooProvider:
    name = "yahoo"
    supported_timeframes = EQUITY_TIMEFRAMES

    def __init__(self, timeout: float = 8):
        self.timeout = timeout
        self._info_cache: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def _info(self, symbol: str) -> dict:
        with self._lock:
            entry = self._info_cache.get(symbol)
        if entry and entry[0] > time.time():
            return entry[1]
        try:
            # Do not use fast_info: yfinance computes some fast_info fields from history.
            info = yf.Ticker(symbol).get_info()
        except Exception as exc:
            raise ProviderError(f"Yahoo quote unavailable ({type(exc).__name__})") from exc
        if not info or not info.get("regularMarketPrice", info.get("currentPrice")):
            raise AssetNotFound(f"No Yahoo quote for {symbol}")
        with self._lock:
            self._info_cache[symbol] = (time.time() + 30, info)
        return info

    def get_quote(self, symbol: str) -> Quote:
        info = self._info(symbol)
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        previous = info.get("regularMarketPreviousClose") or info.get("previousClose")
        timestamp = info.get("regularMarketTime")
        if not previous or not timestamp:
            raise ProviderError("Yahoo did not provide a previous close and quote timestamp")
        return Quote(symbol=symbol, price=price, previous_close=previous, change=price - previous,
                     change_percent=(price / previous - 1) * 100, timestamp=int(timestamp),
                     source=self.name, market_state=info.get("marketState", "DELAYED"),
                     warning="Yahoo Finance quotes may be delayed; timestamps are supplied by the provider.")

    def get_asset(self, symbol: str) -> Asset:
        info = self._info(symbol)
        asset_type = QUOTE_TYPES.get(info.get("quoteType"))
        if not asset_type:
            raise AssetNotFound(f"Unsupported Yahoo asset type for {symbol}")
        return Asset(symbol=symbol, name=info.get("longName") or info.get("shortName") or symbol,
                     type=asset_type, exchange=info.get("fullExchangeName") or info.get("exchange") or "YAHOO",
                     currency=info.get("currency") or "—")

    def search_symbols(self, query: str) -> list[Asset]:
        try:
            quotes = yf.Search(query, max_results=18, news_count=0, timeout=self.timeout).quotes
        except Exception as exc:
            raise ProviderError(f"Yahoo search unavailable ({type(exc).__name__})") from exc
        assets = []
        for quote in quotes:
            asset_type = QUOTE_TYPES.get(quote.get("quoteType"))
            if asset_type and quote.get("symbol"):
                assets.append(Asset(symbol=quote["symbol"], name=quote.get("longname") or quote.get("shortname") or quote["symbol"],
                                    type=asset_type, exchange=quote.get("exchDisp") or quote.get("exchange") or "YAHOO",
                                    currency=quote.get("currency") or "—"))
        return assets

    def get_history(self, symbol: str, timeframe: Timeframe, start: int | None = None, end: int | None = None) -> list[Bar]:
        interval, period = INTERVALS[timeframe]
        arguments = {"interval": interval, "timeout": self.timeout, "auto_adjust": False, "actions": False}
        if start is not None or end is not None:
            if start is not None:
                arguments["start"] = datetime.fromtimestamp(start, timezone.utc)
            if end is not None:
                arguments["end"] = datetime.fromtimestamp(end, timezone.utc)
        else:
            arguments["period"] = period
        try:
            frame = yf.Ticker(symbol).history(**arguments)
        except Exception as exc:
            raise ProviderError(f"Yahoo history unavailable ({type(exc).__name__})") from exc
        bars = []
        for timestamp, row in frame.iterrows():
            values = [float(row[key]) for key in ("Open", "High", "Low", "Close", "Volume")]
            if not all(math.isfinite(v) for v in values) or min(values[:4]) <= 0:
                continue
            bars.append(Bar(time=int(timestamp.timestamp()), open=values[0], high=values[1], low=values[2],
                            close=values[3], volume=max(0, values[4])))
        if not bars:
            raise ProviderError("Yahoo returned no candles in the requested interval")
        return sorted({b.time: b for b in bars}.values(), key=lambda b: b.time)

    def get_fundamentals(self, symbol: str) -> dict:
        info = self._info(symbol)
        fields = ("marketCap", "trailingPE", "forwardPE", "priceToBook", "dividendYield", "beta", "sector", "industry", "longBusinessSummary")
        values = {key: value for key in fields if (value := info.get(key)) is not None and not (isinstance(value, float) and not math.isfinite(value))}
        return {"symbol": symbol, "source": self.name, "available": bool(values), "fields": values,
                "timestamp": int(time.time()), "warning": "Provider fundamentals may be delayed; snapshot retrieval time is shown."}
