import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware

from .calendar import filing_calendar
from .funds import BY_ID
from .provider import Cache, DataError, Provider
from .service import Service

app = FastAPI(title="WhaleWatch", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
service = Service(Provider(Cache(os.environ.get("WHALEWATCH_CACHE_DIR", str(Path(__file__).parent / "data")))))


@app.get("/api/health")
def health():
    return {"ok": True, "app": "WhaleWatch"}


@app.get("/api/calendar")
def calendar():
    return filing_calendar()


@app.get("/api/funds")
def funds(refresh: bool = False):
    return {"funds": service.catalog(refresh), "calendar": filing_calendar()}


@app.get("/api/funds/{fund_id}/portfolio")
def portfolio(fund_id: str, quarter: str | None = Query(None, pattern=r"^\d{4}-Q[1-4]$"), refresh: bool = False):
    if fund_id not in BY_ID:
        raise HTTPException(404, "Unknown manager.")
    try:
        return service.portfolio(BY_ID[fund_id], quarter, refresh)
    except DataError as error:
        raise HTTPException(422, str(error)) from error
    except Exception as error:
        raise HTTPException(503, "The public filing provider is unavailable. Please retry. No sample holdings have been substituted.") from error
