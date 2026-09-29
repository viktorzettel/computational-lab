# RiskLens

RiskLens is an exploratory portfolio research workspace. It pairs a React/Vite interface with a FastAPI service that downloads historical adjusted prices, estimates an allocation, and displays daily risk measures and return correlations. No trades are placed and the output is not personalized advice.

## User flow

- **Propose a starting portfolio** preloads BIL and SHY, two U.S.-listed ETFs holding short-duration Treasury securities. Their outlined buttons can be toggled on or off. They are example inputs, not a guaranteed defensive allocation or a recommendation to buy.
- **Start from scratch** begins with an empty list. At least two and at most ten symbols are required.
- Both entry paths initially select the tail-risk method; users can switch methods. The current public API can fail to optimize some asset pairs under the risk-adjusted route, so the interface reports that failure instead of inventing weights.
- Asset search accepts a company name or ticker. A local snapshot of Nasdaq Trader's listed-symbol directory shows the matched name and symbol before adding (for example, Apple → AAPL and MU → Micron Technology). The directory is identification data, not a live price feed; the price source is checked only when analysis runs. Exact tickers outside the directory can still be added with an unverified label.
- Three allocation methods are exposed: HRP with CVaR risk (tail-risk focus), NCO with a Sharpe objective (risk-adjusted focus), and constrained mean–variance with a maximum-return objective and 60% per-asset cap (return focus). If the selected method fails, the API attempts a mean–variance fallback.
- One-day volatility, 95% VaR and 95% expected shortfall are empirical estimates from the selected portfolio's historical daily returns. Correlations use the same sample.

Treasury ETFs can lose value through interest-rate movements, fund risks and exchange-rate movements for non-USD investors. The app does not propose medium- or high-risk assets. Historical estimates can overfit and omit trading costs, tax and suitability.

## Run locally

```sh
npm ci
npm run dev
```

In another terminal, install `backend/requirements.txt` in a Python environment and run:

```sh
uvicorn backend.main:app --reload --port 8000
```

Set `VITE_API_URL=http://127.0.0.1:8000` for a local frontend. If unset, the interface uses the public Render API. The backend's `RISKLENS_CORS_ORIGINS` environment variable accepts a comma-separated list of allowed frontend origins; its default includes the Netlify site and local Vite origins.

`public/symbol-directory.json` is a dated snapshot from the Nasdaq Trader [Nasdaq-listed](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt) and [other-exchange-listed](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt) directories. To refresh it, download both files and run `python3 scripts/build_symbol_directory.py nasdaqlisted.txt otherlisted.txt`. The generator excludes test issues and symbols that the analysis API cannot accept.

## Checks

```sh
npm run lint
npm run build
python -m py_compile backend/main.py
```
