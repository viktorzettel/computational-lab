import type { Bar, IndicatorConfig, IndicatorKind } from "./types";

export interface IndicatorDefinition {
  kind: IndicatorKind;
  name: string;
  description: string;
  pane: "overlay" | "oscillator" | "volume";
  defaults: Record<string, number>;
}

export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  {
    kind: "SMA",
    name: "Simple moving average",
    description: "Equal-weight average of closing prices.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "EMA",
    name: "Exponential moving average",
    description: "Moving average with more weight on recent closes.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "RSI",
    name: "Relative strength index",
    description: "Wilder-smoothed momentum, from 0 to 100.",
    pane: "oscillator",
    defaults: { period: 14 },
  },
  {
    kind: "MACD",
    name: "MACD",
    description: "Fast and slow EMAs, signal line, and momentum histogram.",
    pane: "oscillator",
    defaults: { fast: 12, slow: 26, signal: 9 },
  },
  {
    kind: "BB",
    name: "Bollinger Bands",
    description:
      "Moving average plus and minus population standard deviations.",
    pane: "overlay",
    defaults: { period: 20, stdDev: 2 },
  },
  {
    kind: "ATR",
    name: "Average true range",
    description: "Wilder-smoothed true range in price units.",
    pane: "oscillator",
    defaults: { period: 14 },
  },
  {
    kind: "VWAP",
    name: "Volume weighted average price",
    description: "Typical-price VWAP; sessions reset at 00:00 UTC.",
    pane: "overlay",
    defaults: {},
  },
  {
    kind: "Volume",
    name: "Trading volume",
    description: "Reported traded volume for each bar.",
    pane: "volume",
    defaults: {},
  },
];

export interface IndicatorPoint {
  time: number;
  value: number;
  color?: string;
}
export interface IndicatorSeries {
  key: string;
  name: string;
  type: "line" | "histogram";
  color: string;
  data: IndicatorPoint[];
  dashed?: boolean;
  referenceLines?: { value: number; label: string }[];
}

type MaybeValues = (number | null)[];
const period = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.max(1, Math.round(value!)) : fallback;

function sma(values: number[], length: number): MaybeValues {
  const output: MaybeValues = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) output[i] = sum / length;
  }
  return output;
}

/** Seed with a full-window SMA, so no fabricated warm-up values are plotted. */
function ema(values: number[], length: number): MaybeValues {
  const output: MaybeValues = Array(values.length).fill(null);
  if (values.length < length) return output;
  let average =
    values.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  output[length - 1] = average;
  const alpha = 2 / (length + 1);
  for (let i = length; i < values.length; i++) {
    average += alpha * (values[i] - average);
    output[i] = average;
  }
  return output;
}

function toPoints(bars: Bar[], values: MaybeValues): IndicatorPoint[] {
  return values.flatMap((value, index) =>
    value !== null && Number.isFinite(value)
      ? [{ time: bars[index].time, value }]
      : [],
  );
}

function line(
  bars: Bar[],
  key: string,
  name: string,
  color: string,
  values: MaybeValues,
): IndicatorSeries {
  return { key, name, type: "line", color, data: toPoints(bars, values) };
}

type Calculator = (bars: Bar[], config: IndicatorConfig) => IndicatorSeries[];

const calculators: Record<IndicatorKind, Calculator> = {
  SMA: (bars, config) => {
    const length = period(config.parameters.period, 20);
    return [
      line(
        bars,
        "average",
        `SMA ${length}`,
        config.color,
        sma(
          bars.map((bar) => bar.close),
          length,
        ),
      ),
    ];
  },
  EMA: (bars, config) => {
    const length = period(config.parameters.period, 20);
    return [
      line(
        bars,
        "average",
        `EMA ${length}`,
        config.color,
        ema(
          bars.map((bar) => bar.close),
          length,
        ),
      ),
    ];
  },
  RSI: (bars, config) => {
    const length = period(config.parameters.period, 14);
    const values: MaybeValues = Array(bars.length).fill(null);
    let gain = 0;
    let loss = 0;
    const relativeStrength = () =>
      loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
    for (let i = 1; i < bars.length; i++) {
      const change = bars[i].close - bars[i - 1].close;
      if (i <= length) {
        gain += Math.max(0, change) / length;
        loss += Math.max(0, -change) / length;
        if (i === length) values[i] = relativeStrength();
      } else {
        gain = (gain * (length - 1) + Math.max(0, change)) / length;
        loss = (loss * (length - 1) + Math.max(0, -change)) / length;
        values[i] = relativeStrength();
      }
    }
    return [
      {
        ...line(bars, "rsi", `RSI ${length}`, config.color, values),
        referenceLines: [
          { value: 30, label: "30" },
          { value: 70, label: "70" },
        ],
      },
    ];
  },
  MACD: (bars, config) => {
    const fast = period(config.parameters.fast, 12);
    const slow = period(config.parameters.slow, 26);
    const signalLength = period(config.parameters.signal, 9);
    const closes = bars.map((bar) => bar.close);
    const fastAverage = ema(closes, fast);
    const slowAverage = ema(closes, slow);
    const values = fastAverage.map((value, index) =>
      value === null || slowAverage[index] === null
        ? null
        : value - slowAverage[index]!,
    );
    const first = values.findIndex((value) => value !== null);
    const signalValues: MaybeValues = Array(bars.length).fill(null);
    if (first >= 0)
      ema(values.slice(first) as number[], signalLength).forEach(
        (value, index) => {
          signalValues[first + index] = value;
        },
      );
    const histogram = values.map((value, index) =>
      value === null || signalValues[index] === null
        ? null
        : value - signalValues[index]!,
    );
    return [
      {
        ...line(bars, "histogram", "MACD histogram", config.color, histogram),
        type: "histogram",
        data: toPoints(bars, histogram).map((point) => ({
          ...point,
          color: point.value >= 0 ? "#6ca99899" : "#cc727a99",
        })),
      },
      {
        ...line(bars, "macd", `MACD ${fast}, ${slow}`, config.color, values),
        referenceLines: [{ value: 0, label: "0" }],
      },
      line(bars, "signal", `Signal ${signalLength}`, "#d8ba77", signalValues),
    ];
  },
  BB: (bars, config) => {
    const length = period(config.parameters.period, 20);
    const multiplier = Number.isFinite(config.parameters.stdDev)
      ? Math.max(0, config.parameters.stdDev)
      : 2;
    const closes = bars.map((bar) => bar.close);
    const middle = sma(closes, length);
    const upper: MaybeValues = Array(bars.length).fill(null);
    const lower: MaybeValues = Array(bars.length).fill(null);
    // Welford's rolling variance avoids loss of precision in nearly flat series.
    let mean = 0;
    let m2 = 0;
    let count = 0;
    for (let i = 0; i < closes.length; i++) {
      if (i >= length) {
        const removed = closes[i - length];
        if (count === 1) {
          mean = 0;
          m2 = 0;
          count = 0;
        } else {
          const nextMean = (count * mean - removed) / (count - 1);
          m2 -= (removed - mean) * (removed - nextMean);
          mean = nextMean;
          count--;
        }
      }
      count++;
      const delta = closes[i] - mean;
      mean += delta / count;
      m2 += delta * (closes[i] - mean);
      if (count === length) {
        const width = multiplier * Math.sqrt(Math.max(0, m2 / length));
        upper[i] = middle[i]! + width;
        lower[i] = middle[i]! - width;
      }
    }
    return [
      line(bars, "upper", `BB upper ${length}`, config.color, upper),
      {
        ...line(bars, "middle", `BB middle ${length}`, config.color, middle),
        dashed: true,
      },
      line(bars, "lower", `BB lower ${length}`, config.color, lower),
    ];
  },
  ATR: (bars, config) => {
    const length = period(config.parameters.period, 14);
    const values: MaybeValues = Array(bars.length).fill(null);
    let average = 0;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      // The first bar has no previous close; its true range is high minus low.
      const trueRange =
        i === 0
          ? bar.high - bar.low
          : Math.max(
              bar.high - bar.low,
              Math.abs(bar.high - bars[i - 1].close),
              Math.abs(bar.low - bars[i - 1].close),
            );
      if (i < length) {
        average += trueRange / length;
        if (i === length - 1) values[i] = average;
      } else {
        average = (average * (length - 1) + trueRange) / length;
        values[i] = average;
      }
    }
    return [line(bars, "atr", `ATR ${length}`, config.color, values)];
  },
  VWAP: (bars, config) => {
    let session = -1;
    let weightedPrice = 0;
    let totalVolume = 0;
    const values = bars.map((bar) => {
      const nextSession = Math.floor(bar.time / 86_400);
      if (nextSession !== session) {
        session = nextSession;
        weightedPrice = 0;
        totalVolume = 0;
      }
      const volume = Math.max(0, bar.volume);
      weightedPrice += ((bar.high + bar.low + bar.close) / 3) * volume;
      totalVolume += volume;
      return totalVolume > 0 ? weightedPrice / totalVolume : null;
    });
    return [line(bars, "vwap", "VWAP · UTC session", config.color, values)];
  },
  Volume: (bars, config) => [
    {
      key: "volume",
      name: "Volume",
      type: "histogram",
      color: config.color,
      data: bars.map((bar) => ({
        time: bar.time,
        value: Math.max(0, bar.volume),
        color: bar.close >= bar.open ? `${config.color}66` : "#cc727a66",
      })),
    },
  ],
};

/** Pure local calculation. Each instance is identified by its own config.id. */
export function calculateIndicator(
  bars: Bar[],
  config: IndicatorConfig,
): IndicatorSeries[] {
  return calculators[config.kind](bars, config);
}
