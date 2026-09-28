# RiskLens

RiskLens is an exploratory portfolio research workspace. It pairs a React/Vite interface with a FastAPI service that downloads historical adjusted prices, estimates an allocation, and displays daily risk measures and return correlations. No trades are placed and the output is not personalized advice.

## User flow

- **Propose a starting portfolio** preloads SGOV and SHY, two U.S.-listed ETFs holding short-duration Treasury securities. They are example inputs, not a guaranteed defensive allocation or a recommendation to buy. Users can remove either one and research additional assets themselves.
- **Start from scratch** begins with an empty list. At least two and at most ten symbols are required.
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

## Checks

```sh
npm run lint
npm run build
python -m py_compile backend/main.py
```
