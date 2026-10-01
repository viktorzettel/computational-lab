from typing import Literal
import math
from pydantic import BaseModel, ConfigDict, Field, model_validator

AssetType = Literal["stock", "etf", "index", "crypto"]
Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1D", "1W"]


class Asset(BaseModel):
    symbol: str
    name: str
    type: AssetType
    exchange: str
    currency: str


class AssetDetail(Asset):
    provider: str
    supported_timeframes: list[Timeframe]


class Quote(BaseModel):
    symbol: str
    price: float = Field(gt=0, allow_inf_nan=False)
    change: float = Field(allow_inf_nan=False)
    change_percent: float = Field(allow_inf_nan=False)
    previous_close: float = Field(gt=0, allow_inf_nan=False)
    timestamp: int
    source: str
    market_state: str | None = None
    warning: str | None = None


class Bar(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    time: int
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(ge=0)

    @model_validator(mode="after")
    def valid_candle(self):
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close):
            raise ValueError("Invalid OHLC range")
        return self


class HistoryResponse(BaseModel):
    symbol: str
    timeframe: Timeframe
    bars: list[Bar]
    source: str
    cached: bool = False
    warning: str | None = None
    supported_timeframes: list[Timeframe]


def finite_number(value) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value)
