from __future__ import annotations
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Callable
from datetime import datetime, timezone, timedelta
from .cache import SQLiteCache
from .catalog import ASSETS, normalize_symbol, search_catalog
from .config import Settings
from .models import Asset, AssetDetail, Bar, HistoryResponse, Quote, Timeframe
from .providers.base import AssetNotFound, MarketDataProvider, ProviderError, ProviderRegistry
from .providers.demo import DemoProvider, DEMO_WARNING


class UnsupportedTimeframe(ValueError):
    def __init__(self, timeframe: str, supported: tuple[Timeframe, ...]):
        self.timeframe = timeframe
        self.supported = supported
        super().__init__(f"{timeframe} is not supported by this asset's provider")


class MarketService:
    def __init__(self, settings: Settings, registry: ProviderRegistry, cache: SQLiteCache | None = None):
        self.settings = settings
        self.registry = registry
        self.cache = cache or SQLiteCache(settings.cache_path)
        self.demo = DemoProvider()
        self._locks: dict[str, asyncio.Lock] = {}
        # Bounds background provider work even when a third-party library ignores cancellation.
        self._executor = ThreadPoolExecutor(max_workers=6, thread_name_prefix="atlas-provider")

    def _lock(self, key: str) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())

    async def _call(self, method: Callable, *args, timeout: float | None = None):
        future = asyncio.get_running_loop().run_in_executor(self._executor, method, *args)
        try:
            return await asyncio.wait_for(future, timeout=timeout or self.settings.provider_timeout)
        except TimeoutError as exc:
            raise ProviderError("Provider request exceeded the configured timeout") from exc

    async def asset(self, symbol: str) -> Asset:
        symbol = normalize_symbol(symbol)
        if symbol in ASSETS:
            return ASSETS[symbol]
        key = f"asset:{symbol}"
        cached = self.cache.get(key)
        if cached:
            return Asset.model_validate(cached.payload)
        if self.settings.mode == "demo":
            raise AssetNotFound(f"{symbol} is not in the sample catalog; use live mode for broader search")
        async with self._lock(key):
            cached = self.cache.get(key)
            if cached:
                return Asset.model_validate(cached.payload)
            providers = self.registry.providers
            if "-" in symbol:
                providers = sorted(providers, key=lambda p: p.name != "coinbase")
            for provider in providers:
                try:
                    asset = await self._call(provider.get_asset, symbol)
                    self.cache.set(key, asset.model_dump(), 86400)
                    return asset
                except (ProviderError, ValueError, KeyError):
                    continue
            raise AssetNotFound(f"No supported provider could resolve {symbol}; search for a valid ticker")

    async def asset_detail(self, symbol: str) -> AssetDetail:
        asset = await self.asset(symbol)
        provider = self.registry.for_asset(asset)
        return AssetDetail(**asset.model_dump(), provider=provider.name,
                           supported_timeframes=list(provider.supported_timeframes))

    async def search(self, query: str) -> dict:
        query = query.strip()
        local = search_catalog(query)
        if not query or self.settings.mode == "demo":
            return {"results": [a.model_dump() for a in local], "source": "catalog",
                    "warning": "Sample mode searches the built-in catalog. Switch to live mode for provider search." if self.settings.mode == "demo" else None}
        key = f"search:{query.upper()}"
        cached = self.cache.get(key)
        if cached and cached.fresh:
            return cached.payload
        async with self._lock(key):
            cached = self.cache.get(key)
            if cached and cached.fresh:
                return cached.payload
            results = await asyncio.gather(*[self._call(p.search_symbols, query) for p in self.registry.providers], return_exceptions=True)
            merged = {asset.symbol: asset for asset in local}
            failures = 0
            for result in results:
                if isinstance(result, BaseException):
                    failures += 1
                    continue
                for asset in result:
                    # Coinbase metadata takes priority over Yahoo's cryptocurrency representation.
                    if asset.symbol not in merged or asset.exchange == "COINBASE":
                        merged[asset.symbol] = asset
                    self.cache.set(f"asset:{asset.symbol}", asset.model_dump(), 86400)
            canonical = normalize_symbol(query)
            assets = sorted(merged.values(), key=lambda a: (a.symbol != canonical, not a.symbol.startswith(query.upper()), a.symbol))
            response = {"results": [a.model_dump() for a in assets], "source": "providers" if failures < len(results) else "catalog",
                        "warning": "Some provider searches are unavailable; built-in symbols remain available." if failures else None}
            self.cache.set(key, response, 30 if failures else 300)
            return response

    def _warning(self, error: Exception, cached: bool = False) -> str:
        reason = str(error) if isinstance(error, ProviderError) else f"Invalid provider response ({type(error).__name__})"
        return f"{reason}. {'Showing previously cached market data; check its original timestamp.' if cached else DEMO_WARNING}"

    async def quote(self, symbol: str) -> Quote:
        asset = await self.asset(symbol)
        provider = self.registry.for_asset(asset)
        key = f"{self.settings.mode}:quote:{provider.name}:{asset.symbol}"
        async with self._lock(key):
            cached = self.cache.get(key)
            if cached and cached.fresh:
                return Quote.model_validate(cached.payload)
            if self.settings.mode == "demo":
                quote = self.demo.get_quote(asset.symbol)
            else:
                try:
                    quote = await self._call(provider.get_quote, asset.symbol)
                    quote = Quote.model_validate(quote)
                except Exception as exc:
                    if cached and cached.payload.get("source") != "demo":
                        quote = Quote.model_validate(cached.payload)
                        quote.warning = self._warning(exc, cached=True)
                        return quote
                    quote = self.demo.get_quote(asset.symbol)
                    quote.warning = self._warning(exc)
            self.cache.set(key, quote.model_dump(), self.settings.quote_ttl)
            return quote

    async def quotes(self, symbols: list[str]) -> dict:
        symbols = list(dict.fromkeys(normalize_symbol(s) for s in symbols if s.strip()))
        results = await asyncio.gather(*[self.quote(symbol) for symbol in symbols], return_exceptions=True)
        quotes, errors = [], []
        for symbol, result in zip(symbols, results):
            if isinstance(result, BaseException):
                errors.append({"symbol": symbol, "message": str(result)})
            else:
                quotes.append(result.model_dump())
        return {"quotes": quotes, "errors": errors}

    async def history(self, symbol: str, timeframe: Timeframe, refresh: bool = False, lookback_years: int | None = None) -> HistoryResponse:
        asset = await self.asset(symbol)
        provider = self.registry.for_asset(asset)
        supported = provider.supported_timeframes
        if timeframe not in supported:
            raise UnsupportedTimeframe(timeframe, supported)
        if lookback_years is not None and timeframe != "1D":
            raise ValueError("Extended returns history requires daily candles")
        key = f"{self.settings.mode}:history:{provider.name}:{asset.symbol}:{timeframe}"
        if lookback_years is not None:
            key += f":years:{lookback_years}"
        async with self._lock(key):
            cached = self.cache.get(key)
            if cached and cached.fresh and not refresh:
                return HistoryResponse.model_validate(cached.payload).model_copy(update={"cached": True})
            source, warning = provider.name, None
            if self.settings.mode == "demo":
                bars, source, warning = self.demo.get_history(asset.symbol, timeframe), "demo", DEMO_WARNING
            else:
                try:
                    if lookback_years is None:
                        bars = await self._call(provider.get_history, asset.symbol, timeframe)
                    else:
                        now = datetime.now(timezone.utc)
                        # Include a baseline before the oldest calendar return, including holidays.
                        start = datetime(now.year - lookback_years, now.month, 1, tzinfo=timezone.utc) - timedelta(days=35)
                        bars = await self._call(provider.get_history, asset.symbol, timeframe, int(start.timestamp()), int(now.timestamp()),
                                                timeout=max(self.settings.provider_timeout, 40))
                    if not bars:
                        raise ProviderError("Provider returned an empty chart")
                    bars = [Bar.model_validate(bar) for bar in bars]
                    bars = sorted({bar.time: bar for bar in bars}.values(), key=lambda bar: bar.time)
                except Exception as exc:
                    if cached and cached.payload.get("source") != "demo":
                        response = HistoryResponse.model_validate(cached.payload)
                        response.cached = True
                        response.warning = self._warning(exc, cached=True)
                        return response
                    bars, source, warning = self.demo.get_history(asset.symbol, timeframe), "demo", self._warning(exc)
            response = HistoryResponse(symbol=asset.symbol, timeframe=timeframe, bars=bars,
                                       source=source, supported_timeframes=list(supported), warning=warning)
            ttl = self.settings.daily_ttl if timeframe in {"1D", "1W"} else self.settings.intraday_ttl
            self.cache.set(key, response.model_dump(), min(ttl, 30) if source == "demo" and self.settings.mode == "live" else ttl)
            return response

    async def fundamentals(self, symbol: str) -> dict:
        asset = await self.asset(symbol)
        provider = self.registry.for_asset(asset)
        key = f"{self.settings.mode}:fundamentals:{provider.name}:{asset.symbol}"
        cached = self.cache.get(key)
        if cached and cached.fresh:
            return cached.payload
        try:
            response = self.demo.get_fundamentals(asset.symbol) if self.settings.mode == "demo" else await self._call(provider.get_fundamentals, asset.symbol)
        except Exception as exc:
            response = {"symbol": asset.symbol, "source": provider.name, "available": False, "warning": str(exc),
                        "message": "Fundamentals are temporarily unavailable."}
        self.cache.set(key, response, 3600 if response.get("available") else 30)
        return response

    def close(self):
        self._executor.shutdown(wait=False, cancel_futures=True)
        for provider in self.registry.providers:
            close = getattr(provider, "close", None)
            if close:
                close()
