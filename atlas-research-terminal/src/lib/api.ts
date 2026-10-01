import type { Asset, HistoryResponse, Quote, Timeframe } from "./types";

const historyCache = new Map<
  string,
  { value: HistoryResponse; expires: number }
>();

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.message || `Data request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  search: (query: string, signal?: AbortSignal) =>
    request<{ results: Asset[] }>(
      `/search?q=${encodeURIComponent(query)}`,
      signal,
    ),
  quotes: (symbols: string[], signal?: AbortSignal) =>
    request<{
      quotes: Quote[];
      errors?: { symbol: string; message: string }[];
    }>(
      `/quotes?symbols=${encodeURIComponent([...new Set(symbols)].join(","))}`,
      signal,
    ),
  asset: (symbol: string, signal?: AbortSignal) =>
    request<Asset & { provider: string; supported_timeframes: Timeframe[] }>(
      `/assets/${encodeURIComponent(symbol)}`,
      signal,
    ),
  health: (signal?: AbortSignal) =>
    request<{ status: string; mode: string; providers?: unknown[] }>(
      "/health",
      signal,
    ),
  models: (signal?: AbortSignal) => request<unknown>("/models", signal),
  async history(
    symbol: string,
    timeframe: Timeframe,
    signal?: AbortSignal,
    force = false,
    lookbackYears?: number,
  ) {
    const key = `${symbol}:${timeframe}:${lookbackYears ?? "default"}`;
    const cached = historyCache.get(key);
    if (!force && cached && cached.expires > Date.now())
      return { ...cached.value, cached: true };
    const value = await request<HistoryResponse>(
      `/history?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}${force ? "&refresh=true" : ""}${lookbackYears ? `&lookback_years=${lookbackYears}` : ""}`,
      signal,
    );
    historyCache.set(key, { value, expires: Date.now() + 60_000 });
    return value;
  },
};
