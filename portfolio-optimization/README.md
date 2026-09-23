# RiskLens — Portfolio Optimization

One of my first applied quantitative projects, RiskLens combines a React dashboard with a FastAPI analysis service. It fetches historical daily prices, estimates portfolio weights using HRP or NCO with a mean-variance fallback, and displays volatility, VaR/ES, correlations and a simple market-regime summary. These are exploratory outputs conditional on historical data and model choices, not validated live risk measures or investment advice.

## Structure

- `src/` contains the input form, allocation chart, correlation view and risk cards.
- `backend/main.py` handles ticker validation, data retrieval, allocation and risk calculations.
- The frontend calls `VITE_API_URL` if set and otherwise uses `http://127.0.0.1:8000`.
- The repository's `netlify.toml` builds this frontend from `portfolio-optimization/` and sets `VITE_API_URL` to the existing RiskLens API for the public Netlify demo. Vite embeds this public endpoint at build time.
- The backend uses `yfinance` and therefore needs network access to retrieve market data. It does not submit trades.

## Run locally

Install Node.js and Python. In `backend/`, install `requirements.txt`, then run `uvicorn main:app --reload --host 127.0.0.1 --port 8000`. From the project root, run `npm ci` and `npm run dev`. The default API CORS list permits the local Vite origins; set `RISKLENS_CORS_ORIGINS` to a comma-separated list for another frontend origin.

The prototype does not include authentication or a historical point-in-time evaluation. The Netlify configuration deploys the frontend only; backend hosting and data availability are separate. Financial statistics should be checked against their sampling assumptions before interpretation.

For a separately deployed API, set `RISKLENS_CORS_ORIGINS=https://portfoliolens.netlify.app` on the backend service. This keeps browser access limited to the published frontend origin.
