import asyncio
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.analysts import (PublicAnalystProvider, make_call, parse_finviz,
                                  parse_stockanalysis, target_pair)
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.providers.base import ProviderError, ProviderRegistry
from backend.app.providers.demo import DemoProvider
from backend.app.service import MarketService


def stock_page(symbol="NVDA", target="$280 → $300", date="Sep 29, 2026"):
    # Match the public table's desktop/mobile duplicate cells. Test data is fictitious.
    return f'''<html><head><link rel="canonical" href="https://stockanalysis.com/stocks/{symbol.lower()}/ratings/"></head>
      <body><table><thead><tr><th>Analyst</th><th>Firm</th><th class="mobile-only">Rating</th><th>Rating</th><th>Action</th><th>Price Target</th><th>Upside</th><th>Date</th></tr></thead>
      <tbody><tr><td><div class="analyst-name"><a href="/analysts/test-analyst/">Test Analyst</a></div><div class="mobile-only">Example Research</div><div class="star-rating-wrap">5 stars</div></td>
      <td>Example Research</td><td class="mobile-only">Buy Maintains $300</td><td>Buy</td><td>Maintains</td><td>{target}</td><td>10%</td><td>{date}</td></tr></tbody></table>
      <script>ratings:[{{analyst:"Hidden Person",price:9999}}]</script></body></html>'''


def firm_page(symbol="NVDA", target="$290 → $310"):
    return f'''<title>{symbol} - Test Company Stock Price and Quote</title><table><tr><td>Date</td><td>Action</td><td>Analyst</td><td>Rating Change</td><td>Price Target Change</td></tr>
      <tr><td>Sep-28-26</td><td><span>Upgrade</span></td><td>Another Research</td><td>Hold → Buy</td><td>{target}</td></tr></table>'''


def test_named_parser_uses_only_public_table_and_ignores_mobile_duplicates():
    calls = parse_stockanalysis(stock_page(), "NVDA")
    assert len(calls) == 1
    call = calls[0]
    assert call.analyst == "Test Analyst"
    assert call.firm == "Example Research"
    assert call.date == "2026-09-29"
    assert (call.price_target, call.prior_target) == (300, 280)
    assert call.analyst_url == "https://stockanalysis.com/analysts/test-analyst/"
    assert call.source_url.endswith("/nvda/ratings/")


def test_firm_parser_never_presents_a_firm_as_a_person():
    call = parse_finviz(firm_page(), "NVDA")[0]
    assert call.analyst is None
    assert call.firm == "Another Research"
    assert (call.prior_rating, call.rating) == ("Hold", "Buy")
    assert (call.prior_target, call.price_target) == (290, 310)
    assert call.date == "2026-09-28"


def test_rating_with_no_target_remains_visible_and_does_not_invent_a_price():
    call = parse_stockanalysis(stock_page(target="n/a"), "NVDA")[0]
    assert call.rating == "Buy"
    assert call.price_target is call.prior_target is None


@pytest.mark.parametrize("parser,html", [(parse_stockanalysis, stock_page("AAPL")), (parse_finviz, firm_page("AAPL"))])
def test_parsers_reject_a_redirect_to_a_different_ticker(parser, html):
    with pytest.raises(ProviderError, match="different security"):
        parser(html, "NVDA")


@pytest.mark.parametrize("target", ["$0", "$-1", "NaN", "$inf", "$300 +20 (7%)", "$300 → garbage"])
def test_malformed_prices_are_not_silently_coerced(target):
    with pytest.raises(ValueError):
        target_pair(target)


def test_missing_table_and_invalid_dates_are_reported_as_unavailable():
    with pytest.raises(ProviderError, match="could not be read"):
        parse_stockanalysis(stock_page().replace("<th>Price Target</th>", "<th>Other</th>"), "NVDA")
    with pytest.raises(ProviderError, match="could not be read"):
        parse_stockanalysis(stock_page(date="Yesterday"), "NVDA")


def test_profile_links_are_restricted_to_the_published_analyst_site():
    html = stock_page().replace('/analysts/test-analyst/', 'javascript:alert(1)')
    assert parse_stockanalysis(html, "NVDA")[0].analyst_url is None


def test_http_restriction_is_respected_without_retrying_or_parsing_challenge():
    requests = []
    def blocked(request):
        requests.append(request)
        return httpx.Response(403, text="Challenge page")
    with httpx.Client(transport=httpx.MockTransport(blocked)) as client:
        provider = PublicAnalystProvider(1, client=client)
        with pytest.raises(ProviderError, match="HTTP 403"):
            provider.fetch("stockanalysis", "NVDA")
    assert len(requests) == 1


class FakeAnalysts:
    def __init__(self):
        self.calls = []
        self.failed = set()
        self.empty = False
        self.delay = 0

    def fetch(self, source, symbol):
        self.calls.append((source, symbol))
        time.sleep(self.delay)
        if source in self.failed:
            raise ProviderError("Source rate limited")
        if self.empty:
            return []
        call = make_call(symbol, source, "Sep 29, 2026", "Test Research", "Buy", "Maintains", "$300",
                         "Test Person" if source == "stockanalysis" else None)
        return [call, call]  # Duplicated provider rows must not inflate the count.

    def close(self):
        pass


@pytest.fixture
def services(tmp_path):
    created = []
    def make(mode="live", timeout=1):
        registry = ProviderRegistry()
        registry.register(DemoProvider(), ("stock", "etf", "index", "crypto"))
        settings = Settings(mode=mode, cache_path=tmp_path / f"{mode}.sqlite3", provider_timeout=timeout)
        provider = FakeAnalysts()
        service = MarketService(settings, registry, analyst_provider=provider)
        created.append(service)
        return service, provider, settings
    yield make
    for service in created:
        service.close()


def run(awaitable):
    return asyncio.run(awaitable)


def test_endpoint_is_scoped_to_open_symbol_and_caches_without_market_history(services):
    service, provider, settings = services()
    with TestClient(create_app(settings, service)) as client:
        first = client.get("/api/analyst-targets/NVDA").json()
        assert first["symbol"] == "NVDA" and first["status"] == "available"
        assert len(first["records"]) == 2
        assert client.get("/api/analyst-targets/NVDA").json()["cached"] is True
        assert len(provider.calls) == 2
        refreshed = client.get("/api/analyst-targets/NVDA?refresh=true").json()
        assert not refreshed["cached"]
        assert len(provider.calls) == 4
        apple = client.get("/api/analyst-targets/AAPL").json()
        assert all(call["symbol"] == "AAPL" for call in apple["records"])
        assert client.get("/api/analyst-targets/NOTREAL123").status_code == 404


def test_concurrent_opening_shares_one_fetch_per_source(services):
    service, provider, _ = services()
    async def get():
        return await asyncio.gather(service.analyst_targets("NVDA"), service.analyst_targets("NVDA"))
    responses = run(get())
    assert len(provider.calls) == 2
    assert responses[1].cached


def test_failed_refresh_keeps_original_records_and_retrieval_date(services):
    service, provider, _ = services()
    original = run(service.analyst_targets("NVDA"))
    provider.failed = {"stockanalysis", "finviz"}
    stale = run(service.analyst_targets("NVDA", refresh=True))
    assert stale.cached and stale.stale
    assert stale.records == original.records
    assert stale.retrieved_at == original.retrieved_at
    assert "previously retrieved" in stale.warning
    assert all(source.status == "unavailable" for source in stale.sources)


def test_partial_failure_does_not_erase_complete_cache(services):
    service, provider, _ = services()
    original = run(service.analyst_targets("NVDA"))
    provider.failed = {"stockanalysis"}
    partial = run(service.analyst_targets("NVDA", refresh=True))
    assert len(partial.records) == 1
    assert partial.records[0].analyst is None
    assert partial.warning
    assert run(service.analyst_targets("NVDA")).records == original.records


def test_no_synthetic_calls_when_network_fails_or_source_is_empty(services):
    service, provider, _ = services()
    provider.failed = {"stockanalysis", "finviz"}
    response = run(service.analyst_targets("NVDA"))
    assert response.status == "unavailable" and response.records == []
    provider.failed = set()
    provider.empty = True
    empty = run(service.analyst_targets("NVDA", refresh=True))
    assert empty.status == "empty" and empty.records == []


def test_unsupported_assets_and_sample_mode_do_not_contact_sources(services):
    service, provider, _ = services()
    for symbol in ("BTC", "SPY", "NDX"):
        response = run(service.analyst_targets(symbol))
        assert response.status == "unsupported" and response.records == []
    assert provider.calls == []
    demo, demo_provider, _ = services(mode="demo")
    assert run(demo.analyst_targets("NVDA")).status == "demo"
    assert demo_provider.calls == []


def test_provider_deadline_returns_an_explicit_unavailable_response(services):
    service, provider, _ = services(timeout=0.01)
    provider.delay = 0.03
    response = run(service.analyst_targets("NVDA"))
    assert response.status == "unavailable" and response.records == []
    assert all("timeout" in source.message for source in response.sources)
