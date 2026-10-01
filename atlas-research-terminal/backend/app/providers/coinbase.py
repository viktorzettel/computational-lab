from datetime import datetime, timezone
import threading
import time
import httpx
from ..catalog import ASSETS
from ..models import Asset, Bar, Quote, Timeframe
from .base import AssetNotFound, ProviderError
from .demo import CRYPTO_TIMEFRAMES

GRANULARITIES = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1D": 86400}


class CoinbaseProvider:
    name = "coinbase"
    supported_timeframes = CRYPTO_TIMEFRAMES

    def __init__(self, timeout: float = 8, client: httpx.Client | None = None):
        self.client = client or httpx.Client(base_url="https://api.exchange.coinbase.com", timeout=timeout,
                                            headers={"User-Agent": "AtlasLocalResearch/1.0", "Accept": "application/json"})
        self._products: tuple[float, list[dict]] | None = None
        self._lock = threading.Lock()

    def _get(self, path: str, params: dict | None = None):
        try:
            response = self.client.get(path, params=params)
            if response.status_code == 404:
                raise AssetNotFound("Coinbase does not list this trading pair")
            response.raise_for_status()
            return response.json()
        except AssetNotFound:
            raise
        except Exception as exc:
            raise ProviderError(f"Coinbase unavailable ({type(exc).__name__})") from exc

    def get_quote(self, symbol: str) -> Quote:
        ticker = self._get(f"/products/{symbol}/ticker")
        stats = self._get(f"/products/{symbol}/stats")
        price, previous = float(ticker["price"]), float(stats["open"])
        timestamp = int(datetime.fromisoformat(ticker["time"].replace("Z", "+00:00")).timestamp())
        return Quote(symbol=symbol, price=price, previous_close=previous, change=price - previous,
                     change_percent=(price / previous - 1) * 100, timestamp=timestamp, source=self.name,
                     market_state="24/7", warning="Crypto change is relative to the Coinbase 24-hour open, not an equity session close.")

    def get_history(self, symbol: str, timeframe: Timeframe, start: int | None = None, end: int | None = None) -> list[Bar]:
        granularity = GRANULARITIES[timeframe]
        end = end if end is not None else int(time.time())
        start = start if start is not None else end - granularity * 299
        if start >= end:
            raise ProviderError("Coinbase history start must precede end")
        if end - start > granularity * 299 and timeframe != "1D":
            raise ProviderError("Extended Coinbase history is available for daily returns only")
        encode = lambda timestamp: datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
        # Each native request stays below 300 candles. Daily returns page backwards;
        # empty windows before listing are allowed, while failed pages fail the request.
        bars: dict[int, Bar] = {}
        cursor = end
        while cursor > start:
            page_start = max(start, cursor - granularity * 299)
            rows = self._get(f"/products/{symbol}/candles", {"granularity": granularity, "start": encode(page_start), "end": encode(cursor)})
            for row in rows:
                if len(row) >= 6 and start <= int(row[0]) <= end:
                    bar = Bar(time=int(row[0]), low=float(row[1]), high=float(row[2]), open=float(row[3]), close=float(row[4]), volume=float(row[5]))
                    bars[bar.time] = bar
            cursor = page_start
        if not bars:
            raise ProviderError("Coinbase returned no candles for the requested interval")
        return sorted(bars.values(), key=lambda bar: bar.time)

    def get_asset(self, symbol: str) -> Asset:
        product = self._get(f"/products/{symbol}")
        if product.get("status") not in {None, "online"}:
            raise AssetNotFound("Coinbase trading pair is unavailable")
        return Asset(symbol=product["id"], name=ASSETS[symbol].name if symbol in ASSETS else product.get("display_name", product["id"]),
                     type="crypto", exchange="COINBASE", currency=product["quote_currency"])

    def search_symbols(self, query: str) -> list[Asset]:
        with self._lock:
            cached = self._products
        if not cached or cached[0] < time.time():
            products = self._get("/products")
            with self._lock:
                self._products = (time.time() + 86400, products)
        else:
            products = cached[1]
        query = query.upper()
        return [Asset(symbol=p["id"], name=ASSETS[p["id"]].name if p["id"] in ASSETS else p.get("display_name", p["id"]),
                      type="crypto", exchange="COINBASE", currency=p["quote_currency"])
                for p in products if p.get("status") == "online" and not p.get("trading_disabled")
                and (query in p["id"] or query in p.get("display_name", "").upper())][:20]

    def get_fundamentals(self, symbol: str) -> dict:
        return {"symbol": symbol, "source": self.name, "available": False,
                "message": "Equity fundamentals are not applicable to a crypto trading pair."}

    def close(self):
        self.client.close()
