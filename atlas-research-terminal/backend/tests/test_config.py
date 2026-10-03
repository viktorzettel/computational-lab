from pathlib import Path

from backend.app.config import Settings


def test_financebro_environment_precedes_legacy_aliases(monkeypatch):
    for key, old, new in (("DATA_MODE", "live", "demo"),
                          ("CACHE_PATH", "/tmp/old.sqlite3", "/tmp/new.sqlite3"),
                          ("PROVIDER_TIMEOUT", "8", "12.5")):
        monkeypatch.setenv(f"ATLAS_{key}", old)
        monkeypatch.setenv(f"FINANCEBRO_{key}", new)
    settings = Settings.from_env()
    assert settings.mode == "demo"
    assert settings.cache_path == Path("/tmp/new.sqlite3")
    assert settings.provider_timeout == 12.5


def test_legacy_environment_still_works(monkeypatch):
    for key, value in (("DATA_MODE", "demo"), ("CACHE_PATH", "/tmp/legacy.sqlite3"),
                       ("PROVIDER_TIMEOUT", "7.5")):
        monkeypatch.delenv(f"FINANCEBRO_{key}", raising=False)
        monkeypatch.setenv(f"ATLAS_{key}", value)
    settings = Settings.from_env()
    assert settings.mode == "demo"
    assert settings.cache_path == Path("/tmp/legacy.sqlite3")
    assert settings.provider_timeout == 7.5
