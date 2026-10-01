import type { Bar } from "./types";

export const RETURN_PERIODS = [
  "1D",
  "1W",
  "1M",
  "6M",
  "YTD",
  "1Y",
  "2Y",
  "5Y",
  "10Y",
] as const;
export type ReturnPeriod = (typeof RETURN_PERIODS)[number];
export interface PeriodReturn {
  period: ReturnPeriod;
  percent: number | null;
  baselineTime: number | null;
}
const utcDay = (time: number) => {
  const date = new Date(time * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** Close-to-close change for the selected candle, including the current candle. */
export function candleReturn(
  bars: Bar[],
  time = bars.at(-1)?.time,
): number | null {
  const index = bars.findIndex((bar) => bar.time === time);
  if (index < 1 || bars[index - 1].close <= 0) return null;
  return (bars[index].close / bars[index - 1].close - 1) * 100;
}

function subtractMonths(day: number, months: number): number {
  const date = new Date(day);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const monthEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, monthEnd));
  return date.getTime();
}

/** Calendar returns use the last daily close on or before each anchor date.
 * Missing older history is unavailable, never replaced by a since-inception return.
 */
export function periodReturns(bars: Bar[]): PeriodReturn[] {
  const latest = bars.at(-1);
  return RETURN_PERIODS.map((period) => {
    const empty = { period, percent: null, baselineTime: null };
    if (!latest || bars.length < 2) return empty;
    const asOf = utcDay(latest.time);
    const anchor =
      period === "1W"
        ? asOf - 7 * 86400000
        : period === "YTD"
          ? Date.UTC(new Date(asOf).getUTCFullYear(), 0, 1) - 86400000
          : subtractMonths(
              asOf,
              period === "1M"
                ? 1
                : period === "6M"
                  ? 6
                  : Number.parseInt(period) * 12,
            );
    const baseline =
      period === "1D"
        ? bars[bars.length - 2]
        : bars
            .slice(0, -1)
            .reverse()
            .find((bar) => utcDay(bar.time) <= anchor);
    if (!baseline || baseline.close <= 0) return empty;
    return {
      period,
      percent: (latest.close / baseline.close - 1) * 100,
      baselineTime: baseline.time,
    };
  });
}
