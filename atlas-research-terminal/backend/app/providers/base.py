from typing import Protocol
from ..models import Asset, Bar, Quote, Timeframe


class ProviderError(Exception):
    """Unavailable, malformed, or rate-limited provider response."""


class AssetNotFound(ProviderError):
    pass


class MarketDataProvider(Protocol):
    name: str
    supported_timeframes: tuple[Timeframe, ...]

    def get_quote(self, symbol: str) -> Quote: ...
    def get_history(self, symbol: str, timeframe: Timeframe, start: int | None = None, end: int | None = None) -> list[Bar]: ...
    def search_symbols(self, query: str) -> list[Asset]: ...
    def get_asset(self, symbol: str) -> Asset: ...
    def get_fundamentals(self, symbol: str) -> dict: ...


class ProviderRegistry:
    def __init__(self):
        self._providers: dict[str, MarketDataProvider] = {}
        self._routes: dict[str, str] = {}

    def register(self, provider: MarketDataProvider, asset_types: tuple[str, ...]):
        self._providers[provider.name] = provider
        self._routes.update({asset_type: provider.name for asset_type in asset_types})

    def for_asset(self, asset: Asset) -> MarketDataProvider:
        return self._providers[self._routes[asset.type]]

    @property
    def providers(self) -> list[MarketDataProvider]:
        return list(self._providers.values())
