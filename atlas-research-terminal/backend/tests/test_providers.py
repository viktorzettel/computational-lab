from datetime import datetime, timezone
import httpx
import pandas as pd
import pytest
from backend.app.providers.coinbase import CoinbaseProvider
from backend.app.providers.yahoo import YahooProvider


def test_coinbase_quote_does_not_request_candles():
    paths = []

    def respond(request):
        paths.append(request.url.path)
        if request.url.path.endswith("ticker"):
            return httpx.Response(200, json={"price": "102", "time": "2026-09-29T20:00:00Z"})
        return httpx.Response(200, json={"open": "100"})

    client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(respond))
    provider = CoinbaseProvider(client=client)
    quote = provider.get_quote("BTC-USD")
    assert quote.change_percent == pytest.approx(2)
    assert paths == ["/products/BTC-USD/ticker", "/products/BTC-USD/stats"]
    assert "24-hour" in quote.warning
    client.close()


def test_coinbase_maps_candle_schema_and_orders_timestamps():
    def respond(request):
        assert request.url.params["granularity"] == "60"
        return httpx.Response(200, json=[[180, 98, 103, 100, 102, 12], [120, 97, 102, 99, 100, 15]])

    client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(respond))
    bars = CoinbaseProvider(client=client).get_history("BTC-USD", "1m", start=120, end=200)
    assert [bar.time for bar in bars] == [120, 180]
    assert bars[-1].open == 100
    assert bars[-1].close == 102
    assert bars[-1].volume == 12
    client.close()


def test_yahoo_quote_does_not_use_history_or_fast_info(monkeypatch):
    class Ticker:
        def __init__(self, symbol):
            self.symbol = symbol

        def get_info(self):
            return {"regularMarketPrice": 101, "regularMarketPreviousClose": 100, "regularMarketTime": 1700000000}

        def history(self, **kwargs):
            raise AssertionError("Quote request downloaded history")

        @property
        def fast_info(self):
            raise AssertionError("fast_info can download history")

    monkeypatch.setattr("backend.app.providers.yahoo.yf.Ticker", Ticker)
    quote = YahooProvider().get_quote("AAPL")
    assert quote.price == 101
    assert quote.timestamp == 1700000000


def test_yahoo_history_requests_native_interval_and_unadjusted_prices(monkeypatch):
    class Ticker:
        def __init__(self, symbol):
            assert symbol == "NVDA"

        def history(self, **kwargs):
            assert kwargs["interval"] == "1d"
            assert kwargs["period"] == "2y"
            assert kwargs["auto_adjust"] is False
            return pd.DataFrame({"Open": [100], "High": [102], "Low": [99], "Close": [101], "Volume": [1000]},
                                index=pd.DatetimeIndex([datetime(2026, 9, 29, tzinfo=timezone.utc)]))

    monkeypatch.setattr("backend.app.providers.yahoo.yf.Ticker", Ticker)
    bars = YahooProvider().get_history("NVDA", "1D")
    assert bars[0].close == 101
    assert bars[0].volume == 1000


def test_yahoo_retains_the_entire_requested_provider_window(monkeypatch):
    count = 1801
    timestamps = pd.date_range("2026-09-23T13:30:00Z", periods=count, freq="min")

    class Ticker:
        def __init__(self, symbol):
            assert symbol == "NVDA"

        def history(self, **kwargs):
            assert kwargs["period"] == "5d"
            return pd.DataFrame({"Open": [100] * count, "High": [102] * count, "Low": [99] * count,
                                 "Close": [101] * count, "Volume": [1000] * count}, index=timestamps)

    monkeypatch.setattr("backend.app.providers.yahoo.yf.Ticker", Ticker)
    bars = YahooProvider().get_history("NVDA", "1m")
    assert len(bars) == count
    assert bars[0].time == int(timestamps[0].timestamp())
    assert bars[-1].time == int(timestamps[-1].timestamp())


def test_coinbase_extended_daily_history_pages_deduplicates_and_accepts_empty_windows():
    requests = []

    def respond(request):
        start = int(datetime.fromisoformat(request.url.params["start"]).timestamp())
        end = int(datetime.fromisoformat(request.url.params["end"]).timestamp())
        requests.append((start, end))
        assert end - start <= 299 * 86400
        # The first historical window is before listing; later pages overlap.
        rows = [] if end < 86400 * 500 else [[end, 98, 103, 100, 102, 12], [start, 97, 102, 99, 100, 15]]
        return httpx.Response(200, json=rows)

    client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(respond))
    bars = CoinbaseProvider(client=client).get_history("BTC-USD", "1D", start=86400, end=86400 * 1000)
    assert len(requests) == 4
    assert len({bar.time for bar in bars}) == len(bars)
    assert all(left.time < right.time for left, right in zip(bars, bars[1:]))
    assert bars[-1].time == 86400 * 1000
    client.close()
