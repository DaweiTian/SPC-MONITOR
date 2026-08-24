"""Shared TTL cache utility."""

import time


class TTLCache:
    """Simple in-memory TTL cache with automatic eviction."""

    def __init__(self, ttl: int = 300, max_size: int = 200):
        self._store: dict[str, tuple[float, object]] = {}
        self._ttl = ttl
        self._max_size = max_size

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and time.time() - entry[0] < self._ttl:
            return entry[1]
        self._store.pop(key, None)
        return None

    def set(self, key: str, value):
        if len(self._store) > self._max_size:
            now = time.time()
            self._store = {k: v for k, v in self._store.items() if now - v[0] < self._ttl}
        self._store[key] = (time.time(), value)
