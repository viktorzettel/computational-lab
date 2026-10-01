import { calculateIndicator } from "./indicators";
import type { IndicatorPoint } from "./indicators";
import type { Bar, IndicatorConfig, Timeframe } from "./types";

export const JORDI_PERIODS = [50, 200] as const;
export const utcDay = (time: number) => {
  const date = new Date(time * 1000);
  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
    1000
  );
};
export const isDailyAverage = (config: IndicatorConfig) =>
  config.kind === "SMA" && config.basis === "daily";
export const jordiApplied = (configs: IndicatorConfig[]) =>
  configs.length === JORDI_PERIODS.length &&
  JORDI_PERIODS.every((period) =>
    configs.some(
      (config) =>
        isDailyAverage(config) &&
        config.parameters.period === period &&
        config.visible,
    ),
  );

/** Replace the indicator set with the daily pair, reusing its colors and IDs. */
export function toggleJordi(configs: IndicatorConfig[]): IndicatorConfig[] {
  if (jordiApplied(configs))
    return configs.map((config) => ({ ...config, visible: false }));
  const existingPair = JORDI_PERIODS.map((period) =>
    configs.find(
      (config) => isDailyAverage(config) && config.parameters.period === period,
    ),
  );
  const reservedIds = new Set(existingPair.map((config) => config?.id));
  return JORDI_PERIODS.map((period) => {
    const existing = existingPair.find(
      (config) => config?.parameters.period === period,
    );
    if (existing) return { ...existing, visible: true };
    let id = `jordi-sma-${period}`;
    for (let suffix = 1; reservedIds.has(id); suffix++)
      id = `jordi-sma-${period}-${suffix}`;
    reservedIds.add(id);
    return {
      id,
      kind: "SMA",
      basis: "daily",
      parameters: { period },
      color: period === 50 ? "#75c5cf" : "#e18ba2",
      visible: true,
    };
  });
}

/** Intraday charts use completed UTC daily closes, avoiding future daily closes.
 * Weekly candles use the last daily average inside their week. Values are always
 * projected onto existing candle timestamps, so overlays cannot extend the chart.
 */
export function projectDailyPoints(
  points: IndicatorPoint[],
  bars: Bar[],
  timeframe: Timeframe,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cursor = 0;
  let latest: IndicatorPoint | undefined;
  for (const bar of bars) {
    const boundary =
      utcDay(bar.time) +
      (timeframe === "1D" ? 86400 : timeframe === "1W" ? 7 * 86400 : 0);
    while (cursor < points.length && utcDay(points[cursor].time) < boundary)
      latest = points[cursor++];
    if (latest) result.push({ ...latest, time: bar.time });
  }
  return result;
}

export function calculateChartIndicator(
  bars: Bar[],
  dailyBars: Bar[],
  timeframe: Timeframe,
  config: IndicatorConfig,
) {
  if (!isDailyAverage(config)) return calculateIndicator(bars, config);
  return calculateIndicator(dailyBars, config).map((series) => ({
    ...series,
    name: `${series.name}D`,
    data: projectDailyPoints(series.data, bars, timeframe),
  }));
}

/** Daily data used for the current chart's status follows the same time cutoff. */
export function dailyBarsForChart(
  dailyBars: Bar[],
  chartBars: Bar[],
  timeframe: Timeframe,
): Bar[] {
  const last = chartBars.at(-1);
  if (!last) return [];
  const boundary =
    utcDay(last.time) +
    (timeframe === "1D" ? 86400 : timeframe === "1W" ? 7 * 86400 : 0);
  return dailyBars.filter((bar) => utcDay(bar.time) < boundary);
}

export function averagePosition(
  price: number | undefined,
  average: number | null,
): string {
  if (price === undefined || average === null) return "—";
  const delta = price - average;
  const epsilon = Math.max(Math.abs(price), Math.abs(average)) * 1e-12;
  return delta > epsilon ? "Above" : delta < -epsilon ? "Below" : "At average";
}
export function averageTrend(
  change: number | null,
  average: number | null,
): string {
  if (change === null || average === null) return "—";
  const epsilon = Math.abs(average) * 1e-12;
  return change > epsilon ? "Rising" : change < -epsilon ? "Falling" : "Flat";
}
