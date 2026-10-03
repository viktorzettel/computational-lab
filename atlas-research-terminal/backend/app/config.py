from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    mode: str = "live"
    cache_path: Path = Path(__file__).resolve().parents[1] / "data" / "atlas.sqlite3"
    provider_timeout: float = 8.0
    quote_ttl: int = 30
    intraday_ttl: int = 60
    daily_ttl: int = 300

    @classmethod
    def from_env(cls) -> "Settings":
        mode = os.getenv("FINANCEBRO_DATA_MODE", os.getenv("ATLAS_DATA_MODE", "live")).strip().lower()
        if mode not in {"live", "demo"}:
            raise ValueError("FINANCEBRO_DATA_MODE must be live or demo")
        timeout = float(os.getenv("FINANCEBRO_PROVIDER_TIMEOUT", os.getenv("ATLAS_PROVIDER_TIMEOUT", "8")))
        if not 0.1 <= timeout <= 120:
            raise ValueError("FINANCEBRO_PROVIDER_TIMEOUT must be between 0.1 and 120 seconds")
        return cls(mode=mode, cache_path=Path(os.getenv("FINANCEBRO_CACHE_PATH", os.getenv("ATLAS_CACHE_PATH", str(cls.cache_path)))),
                   provider_timeout=timeout)
