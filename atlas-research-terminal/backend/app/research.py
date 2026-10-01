"""Model adapters return timestamped series independent of market-data adapters."""
from typing import Protocol
import math
from .models import Bar


class ResearchModel(Protocol):
    id: str
    name: str
    description: str
    unit: str
    defaults: dict[str, float]

    def evaluate(self, bars: list[Bar], parameters: dict[str, float]) -> list[dict]: ...


class EWMAVolatility:
    id = "ewma-volatility"
    name = "EWMA volatility"
    description = "Exponentially weighted log-return volatility per bar, expressed as a percentage."
    unit = "% per bar"
    defaults = {"decay": .94}

    def evaluate(self, bars: list[Bar], parameters: dict[str, float]) -> list[dict]:
        decay = parameters.get("decay", self.defaults["decay"])
        if not 0 < decay < 1:
            raise ValueError("decay must be between zero and one")
        variance = None
        points = []
        for previous, current in zip(bars, bars[1:]):
            squared_return = math.log(current.close / previous.close) ** 2
            variance = squared_return if variance is None else decay * variance + (1 - decay) * squared_return
            points.append({"timestamp": current.time, "value": math.sqrt(variance) * 100, "label": self.name})
        return points


class ModelRegistry:
    def __init__(self):
        self._models: dict[str, ResearchModel] = {}

    def register(self, model: ResearchModel):
        self._models[model.id] = model

    def get(self, model_id: str) -> ResearchModel:
        return self._models[model_id]

    def describe(self) -> list[dict]:
        return [{"id": model.id, "name": model.name, "description": model.description, "unit": model.unit, "parameters": model.defaults}
                for model in self._models.values()]
