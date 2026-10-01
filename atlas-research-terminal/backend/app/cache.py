"""Small persistent cache. Connections are local to each operation/thread."""
from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
import time


@dataclass
class CacheEntry:
    payload: dict | list
    created_at: float
    expires_at: float

    @property
    def fresh(self) -> bool:
        return self.expires_at > time.time()


class SQLiteCache:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS cache_expiry ON cache(expires_at)")

    def _connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def get(self, key: str) -> CacheEntry | None:
        with self._connect() as db:
            row = db.execute("SELECT payload, created_at, expires_at FROM cache WHERE key = ?", (key,)).fetchone()
        return CacheEntry(json.loads(row[0]), row[1], row[2]) if row else None

    def set(self, key: str, payload: dict | list, ttl: float):
        now = time.time()
        encoded = json.dumps(payload, allow_nan=False, separators=(",", ":"))
        with self._connect() as db:
            db.execute("INSERT INTO cache VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at, expires_at=excluded.expires_at",
                       (key, encoded, now, now + ttl))
