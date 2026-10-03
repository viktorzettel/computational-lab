# FinanceBro data service

FastAPI serves provider-independent assets, snapshots, and OHLCV. Start from the repository root:

```sh
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Use `FINANCEBRO_DATA_MODE=demo` for an offline preview. The default is `live`; provider failure first returns stale live cache with its original timestamp and a warning, then falls back to deterministic, clearly labeled synthetic samples when no live cache exists. Samples are fixed at **2026-09-29 20:00 UTC**, never presented as current prices. Quotes and the latest candle agree across sample intervals. Unknown tickers are not silently invented.

`FINANCEBRO_CACHE_PATH` overrides `backend/data/atlas.sqlite3`. `FINANCEBRO_PROVIDER_TIMEOUT` controls the request deadline in seconds (default 8). Quotes expire after 30 seconds, intraday charts after 60 seconds, and daily/weekly charts after 300 seconds. A mode/provider/symbol/timeframe key isolates datasets. Request locks share simultaneous loads; a six-worker executor bounds outstanding provider work. A timed-out yfinance request can finish in the background because its library calls cannot be forcibly cancelled. Coinbase HTTP requests also have a transport timeout.

## API

| Route | Result |
| --- | --- |
| `GET /api/health` | Service status, configured data mode, providers, cache type |
| `GET /api/search?q=apple` | `{results: Asset[], source, warning}`; cached Yahoo and Coinbase search merged with built-in assets |
| `GET /api/assets/NVDA` | Asset fields, provider, supported timeframes |
| `GET /api/quotes?symbols=AAPL,NVDA,BTC-USD` | `{quotes: Quote[], errors: []}`; per-symbol errors preserve valid results |
| `GET /api/history?symbol=NVDA&timeframe=1D` | Symbol, timeframe, OHLCV bars, source, cache status, warning, supported timeframes |
| `GET /api/fundamentals/AAPL` | Available Yahoo metadata fields; never synthetic fundamentals |
| `GET /api/models` | Research model registry and default numeric parameters |
| `GET /api/models/ewma-volatility?symbol=NVDA&timeframe=1D` | Timestamped model output using the shared historical cache |

All timestamps are Unix seconds. OHLCV is sorted, deduplicated, and uses unadjusted equity prices. Unsupported intervals return HTTP 422 and a list of supported intervals. `BTC` and `ETH` aliases resolve to `BTC-USD` and `ETH-USD`; `SPX` resolves to `^GSPC`. Foreign stock currencies can appear as `—` in search results when the search provider supplies no currency; no USD denomination is invented.

Add `lookback_years=10` to a **1D** history request for calendar returns. Accepted lookbacks are 1–10 years. Extended windows include baseline padding, use separate cache keys, and have a service deadline of at least 40 seconds to allow Coinbase daily pagination. Each Coinbase request stays below its 300-candle limit; empty pre-listing windows are allowed, failed pages fail the entire load, and unavailable dates remain missing. Defaults remain unchanged.

Add `refresh=true` to a history request to bypass its current cache once and update the stored result. Subsequent normal requests use the refreshed cache. A failed forced refresh retains previously cached live history with its original bar timestamps and an explicit warning.

| Provider | Assets | Native timeframes | Default history |
| --- | --- | --- | --- |
| Yahoo / yfinance | Stocks, ETFs, indices | 1m, 5m, 15m, 1h, 1D, 1W | Full provider window: 5 days, 1 month, 1 month, 3 months, 2 years, 5 years |
| Coinbase Exchange | Listed crypto pairs | 1m, 5m, 15m, 1h, 1D | Latest approximately 300 bars |

`4h` is not advertised because neither adapter currently supplies it natively. Coinbase weekly history is not advertised. Trading activity gaps are preserved rather than filled with invented prices. Crypto quote changes use the rolling 24-hour open; equity quote changes use previous session close. Yahoo data can be delayed. This is snapshot polling, not a streaming tick feed.

The quote path is separate from the history path. Coinbase requests ticker and stats snapshots; Yahoo uses `Ticker.get_info()`. It deliberately avoids yfinance `fast_info`, which can download historical prices internally. Full OHLCV is fetched only for an opened chart, the user-opened Returns tab, or a requested research model.

## Provider and model extensions

Implement `MarketDataProvider` in `app/providers/base.py`, then register it in `create_app` for the appropriate asset types. Its methods are `get_quote(symbol)`, `get_history(symbol, timeframe, start, end)`, `search_symbols(query)`, `get_asset(symbol)`, and `get_fundamentals(symbol)`. A future OpenBB adapter fits this interface without changing the frontend contract. No OpenBB installation is required for the MVP.

Implement `ResearchModel` in `app/research.py` and register it with `app.state.model_registry`. A model declares its ID, name, description, unit, and numeric defaults, and evaluates already-loaded bars into `{timestamp, value, label}` points. The example is EWMA log-return volatility **per bar**, not an annualized estimate. Generic parameters are a URL-encoded JSON object: `parameters={"decay":0.97}`. The `decay` query parameter also works for the example.

Future alternative datasets such as Polymarket, Deribit, order-book data, and macro series can use additional provider/model implementations. They are extension points; no account integration or external database connection is claimed in this MVP.

## Checks

```sh
.venv/bin/python -m pytest backend/tests -q
```

Tests cover snapshot isolation from history requests, persistent caching, simultaneous request deduplication, stale and synthetic fallback, demo mode isolation, supported intervals, broad symbol metadata, deadline handling, provider candle parsing, and research output.

Provider implementation references: [yfinance API](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.html), [yfinance search](https://ranaroussi.github.io/yfinance/reference/yfinance.search.html), [Coinbase candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles), [Coinbase ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker), and [Coinbase stats](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats).

The default SQLite filename is kept for cache continuity. `ATLAS_DATA_MODE`, `ATLAS_CACHE_PATH` and `ATLAS_PROVIDER_TIMEOUT` remain supported aliases; the corresponding `FINANCEBRO_*` setting takes precedence.
