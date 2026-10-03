from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .analysts import AnalystTargetsResponse
from .models import AssetDetail, HistoryResponse, Timeframe
from .providers.base import AssetNotFound, ProviderRegistry
from .providers.coinbase import CoinbaseProvider
from .providers.yahoo import YahooProvider
from .research import EWMAVolatility, ModelRegistry
from .service import MarketService, UnsupportedTimeframe
import yfinance as yf
import json
import math


def create_app(settings: Settings | None = None, service: MarketService | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if service is None:
        yf.set_tz_cache_location(str(settings.cache_path.parent / "yfinance"))
        providers = ProviderRegistry()
        providers.register(YahooProvider(settings.provider_timeout), ("stock", "etf", "index"))
        providers.register(CoinbaseProvider(settings.provider_timeout), ("crypto",))
        service = MarketService(settings, providers)
    models = ModelRegistry()
    models.register(EWMAVolatility())

    @asynccontextmanager
    async def lifespan(_app):
        yield
        service.close()

    app = FastAPI(title="FinanceBro — Local Research Terminal", version="0.1.0", lifespan=lifespan)
    app.state.market_service = service
    app.state.model_registry = models
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
                       allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "mode": settings.mode, "providers": [p.name for p in service.registry.providers],
                "cache": "sqlite", "quote_refresh_seconds": settings.quote_ttl,
                "message": "Synthetic historical samples are active." if settings.mode == "demo" else "Live providers with explicit cached/sample fallback."}

    @app.get("/api/search")
    async def search(q: str = Query("", max_length=128)):
        return await service.search(q)

    @app.get("/api/quotes")
    async def quotes(symbols: str = "NVDA,AAPL,BTC-USD"):
        return await service.quotes(symbols.split(","))

    @app.get("/api/assets/{symbol}", response_model=AssetDetail)
    async def asset(symbol: str):
        try:
            return await service.asset_detail(symbol)
        except AssetNotFound as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/history", response_model=HistoryResponse)
    async def history(symbol: str = "NVDA", timeframe: Timeframe = "1D", refresh: bool = False,
                      lookback_years: int | None = Query(None, ge=1, le=10)):
        try:
            return await service.history(symbol, timeframe, refresh=refresh, lookback_years=lookback_years)
        except AssetNotFound as exc:
            raise HTTPException(404, str(exc)) from exc
        except UnsupportedTimeframe as exc:
            raise HTTPException(422, {"message": str(exc), "supported_timeframes": list(exc.supported)}) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/fundamentals/{symbol}")
    async def fundamentals(symbol: str):
        try:
            return await service.fundamentals(symbol)
        except AssetNotFound as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/models")
    async def model_list():
        return {"models": models.describe()}

    @app.get("/api/analyst-targets/{symbol}", response_model=AnalystTargetsResponse)
    async def analyst_targets(symbol: str, refresh: bool = False):
        try:
            return await service.analyst_targets(symbol, refresh=refresh)
        except AssetNotFound as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/models/{model_id}")
    async def model_series(model_id: str, symbol: str = "NVDA", timeframe: Timeframe = "1D", decay: float | None = None,
                           parameters: str | None = Query(None, max_length=2000, description="JSON object of numeric model parameters")):
        try:
            model = models.get(model_id)
        except KeyError as exc:
            raise HTTPException(404, "Unknown research model") from exc
        try:
            model_parameters = dict(model.defaults)
            if parameters is not None:
                overrides = json.loads(parameters)
                if not isinstance(overrides, dict) or any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in overrides.values()):
                    raise ValueError("parameters must be a JSON object containing finite numbers")
                model_parameters.update(overrides)
            if decay is not None:
                model_parameters["decay"] = decay
            data = await service.history(symbol, timeframe)
            return {"model": model.id, "symbol": data.symbol, "timeframe": data.timeframe, "source": data.source,
                    "warning": data.warning, "parameters": model_parameters, "unit": model.unit,
                    "points": model.evaluate(data.bars, model_parameters)}
        except AssetNotFound as exc:
            raise HTTPException(404, str(exc)) from exc
        except (UnsupportedTimeframe, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc

    return app


app = create_app()
