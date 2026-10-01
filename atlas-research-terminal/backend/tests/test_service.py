import asyncio
import time
import pytest
from fastapi.testclient import TestClient
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Asset, Bar, Quote
from backend.app.providers.base import AssetNotFound, ProviderError, ProviderRegistry
from backend.app.providers.demo import DemoProvider, SAMPLE_TIME, EQUITY_TIMEFRAMES, CRYPTO_TIMEFRAMES
from backend.app.service import MarketService, UnsupportedTimeframe


class FakeProvider:
    name = "fake"
    supported_timeframes = EQUITY_TIMEFRAMES

    def __init__(self):
        self.quote_calls = self.history_calls = self.asset_calls = self.search_calls = 0
        self.fail = False

    def get_quote(self, symbol):
        self.quote_calls += 1
        if self.fail:
            raise ProviderError("Rate limited")
        return Quote(symbol=symbol, price=100, previous_close=95, change=5,
                     change_percent=5 / 95 * 100, timestamp=1700000000, source=self.name)

    def get_history(self, symbol, timeframe, start=None, end=None):
        self.history_calls += 1
        if self.fail:
            raise ProviderError("Network unavailable")
        return [Bar(time=1700000000, open=98, high=101, low=97, close=100, volume=500)]

    def get_asset(self, symbol):
        self.asset_calls += 1
        if symbol == "NOVA":
            return Asset(symbol=symbol, name="Nova test asset", type="stock", exchange="TEST", currency="EUR")
        raise AssetNotFound(symbol)

    def search_symbols(self, query):
        self.search_calls += 1
        return [Asset(symbol="NOVA", name="Nova test asset", type="stock", exchange="TEST", currency="EUR")]

    def get_fundamentals(self, symbol):
        return {"symbol": symbol, "source": self.name, "available": False}


@pytest.fixture
def setup_service(tmp_path):
    services = []

    def make(mode="live", timeout=1):
        provider = FakeProvider()
        registry = ProviderRegistry()
        registry.register(provider, ("stock", "etf", "index", "crypto"))
        settings = Settings(mode=mode, cache_path=tmp_path / "cache.sqlite3", provider_timeout=timeout)
        service = MarketService(settings, registry)
        services.append(service)
        return service, provider, settings

    yield make
    for service in services:
        service.close()


def run(coroutine):
    return asyncio.run(coroutine)


def test_quote_cache_is_persistent_and_never_requests_history(setup_service):
    service, provider, _ = setup_service()
    assert run(service.quote("AAPL")).price == 100
    assert run(service.quote("AAPL")).price == 100
    second, second_provider, _ = setup_service()
    assert run(second.quote("AAPL")).price == 100
    assert provider.quote_calls == 1
    assert provider.history_calls == second_provider.history_calls == second_provider.quote_calls == 0


def test_history_cache_keeps_timeframes_separate(setup_service):
    service, provider, _ = setup_service()
    assert run(service.history("NVDA", "1D")).cached is False
    assert run(service.history("NVDA", "1D")).cached is True
    assert run(service.history("NVDA", "1h")).cached is False
    assert provider.history_calls == 2
    assert provider.quote_calls == 0


def test_history_refresh_bypasses_cache_once_and_populates_normal_cache(setup_service):
    service, provider, settings = setup_service()
    with TestClient(create_app(settings, service)) as client:
        path = "/api/history?symbol=NVDA&timeframe=1D"
        assert client.get(path).json()["cached"] is False
        assert client.get(path).json()["cached"] is True
        assert provider.history_calls == 1
        response = client.get(path + "&refresh=true")
        assert response.status_code == 200
        assert response.json()["cached"] is False
        assert provider.history_calls == 2
        assert client.get(path).json()["cached"] is True
        assert provider.history_calls == 2
        assert client.get(path + "&refresh=false").json()["cached"] is True
    assert provider.quote_calls == 0


def test_failed_forced_refresh_retains_market_cache_with_warning(setup_service):
    service, provider, _ = setup_service()
    original = run(service.history("NVDA", "1D"))
    provider.fail = True
    response = run(service.history("NVDA", "1D", refresh=True))
    assert provider.history_calls == 2
    assert response.source == original.source == "fake"
    assert response.cached is True
    assert response.bars == original.bars
    assert "Network unavailable" in response.warning
    assert "previously cached" in response.warning
    # A failed manual refresh does not permanently force subsequent ordinary requests.
    assert run(service.history("NVDA", "1D")).bars == original.bars
    assert provider.history_calls == 2


def test_concurrent_quote_requests_share_one_provider_call(setup_service):
    service, provider, _ = setup_service()

    async def request():
        return await asyncio.gather(service.quote("AAPL"), service.quote("AAPL"), service.quote("AAPL"))

    assert len(run(request())) == 3
    assert provider.quote_calls == 1


def test_unsupported_timeframe_does_not_touch_provider(setup_service):
    service, provider, settings = setup_service()
    with pytest.raises(UnsupportedTimeframe):
        run(service.history("AAPL", "4h"))
    with TestClient(create_app(settings, service)) as client:
        response = client.get("/api/history?symbol=AAPL&timeframe=4h")
        assert response.status_code == 422
        assert "4h" not in response.json()["detail"]["supported_timeframes"]
    assert provider.history_calls == 0


def test_crypto_supported_intervals_are_provider_specific(setup_service):
    service, provider, _ = setup_service()
    provider.supported_timeframes = CRYPTO_TIMEFRAMES
    assert run(service.asset_detail("BTC")).symbol == "BTC-USD"
    with pytest.raises(UnsupportedTimeframe):
        run(service.history("BTC", "1W"))
    assert provider.history_calls == 0


def test_index_alias_metadata_and_quote_identify_the_same_index(setup_service):
    service, provider, _ = setup_service()
    asset = run(service.asset("NDX"))
    quote = run(service.quote("NDX"))
    assert asset.symbol == quote.symbol == "^NDX"
    assert asset.name == "NASDAQ 100 Index"
    assert run(service.asset("^IXIC")).name == "NASDAQ Composite"
    assert provider.history_calls == 0


def test_failed_provider_returns_explicit_consistent_samples(setup_service):
    service, provider, _ = setup_service()
    provider.fail = True
    quote = run(service.quote("NVDA"))
    history = run(service.history("NVDA", "1D"))
    assert quote.source == history.source == "demo"
    assert "not live" in quote.warning
    assert "Network unavailable" in history.warning
    assert quote.timestamp == SAMPLE_TIME
    assert history.bars[-1].close == quote.price
    assert len(history.bars) == 400
    assert all(a.time < b.time for a, b in zip(history.bars, history.bars[1:]))


def test_stale_live_cache_wins_over_sample_fallback(setup_service):
    service, provider, _ = setup_service()
    quote = run(service.quote("AAPL"))
    history = run(service.history("AAPL", "1D"))
    service.cache.set("live:quote:fake:AAPL", quote.model_dump(), -1)
    service.cache.set("live:history:fake:AAPL:1D", history.model_dump(), -1)
    provider.fail = True
    stale_quote = run(service.quote("AAPL"))
    stale_history = run(service.history("AAPL", "1D"))
    assert stale_quote.source == stale_history.source == "fake"
    assert stale_quote.timestamp == quote.timestamp
    assert "previously cached" in stale_quote.warning
    assert stale_history.cached is True
    assert stale_history.bars == history.bars


def test_demo_mode_never_contacts_network_and_does_not_reuse_live_cache(setup_service):
    live, live_provider, _ = setup_service()
    assert run(live.quote("AAPL")).source == "fake"
    demo, demo_provider, _ = setup_service(mode="demo")
    assert run(demo.quote("AAPL")).source == "demo"
    assert run(demo.history("NVDA", "1D")).source == "demo"
    assert run(demo.search("bitcoin"))["results"][0]["symbol"] == "BTC-USD"
    assert demo_provider.quote_calls == demo_provider.history_calls == demo_provider.search_calls == 0


def test_unknown_assets_are_not_fabricated(setup_service):
    service, provider, settings = setup_service(mode="demo")
    with TestClient(create_app(settings, service)) as client:
        assert client.get("/api/assets/NOTREAL123").status_code == 404
        result = client.get("/api/quotes?symbols=AAPL,NOTREAL123").json()
        assert len(result["quotes"]) == 1
        assert result["errors"][0]["symbol"] == "NOTREAL123"
    assert provider.asset_calls == 0


def test_broad_search_populates_asset_metadata_cache(setup_service):
    service, provider, _ = setup_service()
    assert run(service.search("nova"))["results"][0]["symbol"] == "NOVA"
    assert run(service.asset("NOVA")).currency == "EUR"
    assert provider.asset_calls == 0
    run(service.search("nova"))
    assert provider.search_calls == 1


def test_provider_timeout_falls_back_with_explicit_reason(setup_service):
    service, provider, _ = setup_service(timeout=.02)

    original = provider.get_quote

    def slow(symbol):
        time.sleep(.1)
        return original(symbol)

    provider.get_quote = slow
    started = time.monotonic()
    result = run(service.quote("AAPL"))
    assert result.source == "demo"
    assert "timeout" in result.warning
    assert time.monotonic() - started < .1


def test_research_models_use_the_history_cache(setup_service):
    service, provider, settings = setup_service(mode="demo")
    with TestClient(create_app(settings, service)) as client:
        assert client.get("/api/models").json()["models"][0]["id"] == "ewma-volatility"
        history = client.get("/api/history?symbol=NVDA&timeframe=1D").json()
        result = client.get("/api/models/ewma-volatility?symbol=NVDA&timeframe=1D").json()
        assert len(result["points"]) == len(history["bars"]) - 1
        assert result["points"][-1]["timestamp"] == history["bars"][-1]["time"]
        assert result["source"] == "demo"
        assert client.get("/api/models/ewma-volatility?decay=1").status_code == 422
        assert client.get("/api/models/ewma-volatility", params={"parameters": '{"decay": 0.97}'}).json()["parameters"]["decay"] == .97
        assert client.get("/api/models/ewma-volatility", params={"parameters": '{"decay": "bad"}'}).status_code == 422
    assert provider.history_calls == 0


def test_sample_quotes_and_candles_are_deterministic():
    provider = DemoProvider()
    quote = provider.get_quote("NVDA")
    for timeframe in EQUITY_TIMEFRAMES:
        first = provider.get_history("NVDA", timeframe)
        assert first == provider.get_history("NVDA", timeframe)
        assert first[-1].close == quote.price
        assert all(bar.low <= min(bar.open, bar.close) <= max(bar.open, bar.close) <= bar.high for bar in first)


def test_extended_returns_history_has_its_own_cache_and_explicit_daily_window(setup_service):
    service, provider, settings = setup_service()
    windows = []
    original = provider.get_history

    def capture(symbol, timeframe, start=None, end=None):
        windows.append((timeframe, start, end))
        return original(symbol, timeframe, start, end)

    provider.get_history = capture
    with TestClient(create_app(settings, service)) as client:
        regular = "/api/history?symbol=NVDA&timeframe=1D"
        extended = regular + "&lookback_years=10"
        assert client.get(regular).status_code == 200
        assert client.get(extended).json()["cached"] is False
        assert client.get(extended).json()["cached"] is True
        assert client.get(regular).json()["cached"] is True
        assert windows[0] == ("1D", None, None)
        assert windows[1][2] - windows[1][1] > 3650 * 86400
        assert provider.history_calls == 2
        assert client.get("/api/history?symbol=NVDA&timeframe=1h&lookback_years=10").status_code == 422
        assert client.get(regular + "&lookback_years=0").status_code == 422
        assert provider.history_calls == 2
