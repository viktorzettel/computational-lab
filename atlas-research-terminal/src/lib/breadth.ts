import type { Bar } from "./types";

export const BREADTH_MEASURES = [
  { key: "above50", label: "Price above 50-day average" },
  { key: "above200", label: "Price above 200-day average" },
  { key: "rising50", label: "50-day average rising" },
  { key: "rising200", label: "200-day average rising" },
] as const;
export type BreadthKey = (typeof BREADTH_MEASURES)[number]["key"];
export type BreadthSignals = Record<BreadthKey, boolean | null>;
export interface BreadthObservation {
  close: number | null;
  time: number | null;
  sma50: number | null;
  sma200: number | null;
  sma50Change: number | null;
  sma200Change: number | null;
  signals: BreadthSignals;
}

function average(bars: Bar[], period: number, offset = 0): number | null {
  const end = bars.length - offset;
  if (end < period) return null;
  const window = bars.slice(end - period, end);
  if (window.some((bar) => !Number.isFinite(bar.close) || bar.close <= 0))
    return null;
  return window.reduce((sum, bar) => sum + bar.close, 0) / period;
}

// Ignore floating-point roundoff when the price or two averages are equal.
const greaterThan = (value: number, reference: number) =>
  value - reference > Math.max(Math.abs(value), Math.abs(reference)) * 1e-12;

/** Uses daily OHLCV, independently of the currently displayed chart timeframe. */
export function dailyBreadth(
  bars: Bar[],
  risingLookback = 1,
): BreadthObservation {
  if (!Number.isInteger(risingLookback) || risingLookback < 1)
    throw new Error("Rising comparison must be at least one daily bar");
  const last = bars.at(-1);
  const close =
    last && Number.isFinite(last.close) && last.close > 0 ? last.close : null;
  const sma50 = average(bars, 50);
  const sma200 = average(bars, 200);
  const prior50 = average(bars, 50, risingLookback);
  const prior200 = average(bars, 200, risingLookback);
  return {
    close,
    time: last?.time ?? null,
    sma50,
    sma200,
    sma50Change: sma50 === null || prior50 === null ? null : sma50 - prior50,
    sma200Change:
      sma200 === null || prior200 === null ? null : sma200 - prior200,
    signals: {
      above50:
        close === null || sma50 === null ? null : greaterThan(close, sma50),
      above200:
        close === null || sma200 === null ? null : greaterThan(close, sma200),
      rising50:
        sma50 === null || prior50 === null ? null : greaterThan(sma50, prior50),
      rising200:
        sma200 === null || prior200 === null
          ? null
          : greaterThan(sma200, prior200),
    },
  };
}

export function breadthSummary(observations: BreadthObservation[]) {
  return BREADTH_MEASURES.map((measure) => {
    const eligible = observations.filter(
      (item) => item.signals[measure.key] !== null,
    );
    const passing = eligible.filter(
      (item) => item.signals[measure.key] === true,
    ).length;
    return {
      ...measure,
      passing,
      eligible: eligible.length,
      percentage: eligible.length ? (passing / eligible.length) * 100 : null,
    };
  });
}
