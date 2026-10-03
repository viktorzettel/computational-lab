import type { Bar, IndicatorConfig, IndicatorKind } from "./types";

export const INDICATOR_CATEGORIES = [
  "Trend",
  "Momentum",
  "Volatility",
  "Volume",
] as const;
export type IndicatorCategory = (typeof INDICATOR_CATEGORIES)[number];
export interface IndicatorDefinition {
  kind: IndicatorKind;
  name: string;
  description: string;
  pane: "overlay" | "oscillator" | "volume";
  defaults: Record<string, number>;
  category: IndicatorCategory;
  shortName?: string;
  aliases?: string;
  bounds?: [number, number];
  format?: "volume";
}

export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  {
    kind: "SMA",
    category: "Trend",
    name: "Simple moving average",
    description: "Equal-weight average of closing prices.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "EMA",
    category: "Trend",
    name: "Exponential moving average",
    description: "Moving average with more weight on recent closes.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "RSI",
    category: "Momentum",
    bounds: [0, 100],
    name: "Relative strength index",
    description: "Wilder-smoothed momentum, from 0 to 100.",
    pane: "oscillator",
    defaults: { period: 14 },
  },
  {
    kind: "MACD",
    category: "Momentum",
    name: "MACD",
    description: "Fast and slow EMAs, signal line, and momentum histogram.",
    pane: "oscillator",
    defaults: { fast: 12, slow: 26, signal: 9 },
  },
  {
    kind: "BB",
    category: "Volatility",
    name: "Bollinger Bands",
    description:
      "Moving average plus and minus population standard deviations.",
    pane: "overlay",
    defaults: { period: 20, stdDev: 2 },
  },
  {
    kind: "ATR",
    category: "Volatility",
    name: "Average true range",
    description: "Wilder-smoothed true range in price units.",
    pane: "oscillator",
    defaults: { period: 14 },
  },
  {
    kind: "VWAP",
    category: "Volume",
    name: "Volume weighted average price",
    description: "Typical-price VWAP; sessions reset at 00:00 UTC.",
    pane: "overlay",
    defaults: {},
  },
  {
    kind: "Volume",
    category: "Volume",
    format: "volume",
    name: "Trading volume",
    description: "Up/down volume bars with a configurable moving average.",
    pane: "volume",
    defaults: { period: 20 },
  },
  {
    kind: "WMA",
    name: "Weighted moving average",
    category: "Trend",
    description: "Linear weights give recent closes more influence.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "DEMA",
    name: "Double exponential moving average",
    category: "Trend",
    description: "A combination of two EMAs that reduces smoothing lag.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "TEMA",
    name: "Triple exponential moving average",
    category: "Trend",
    description: "Three EMA stages combined into a faster trend line.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "HMA",
    name: "Hull moving average",
    category: "Trend",
    description: "Weighted averages balance responsiveness and smoothness.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "VWMA",
    name: "Volume weighted moving average",
    category: "Volume",
    description: "Rolling closing-price average weighted by traded volume.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "Ichimoku",
    name: "Ichimoku Cloud",
    aliases: "kumo tenkan kijun senkou chikou",
    category: "Trend",
    description:
      "Conversion, base and lagging lines with a shaded, projected cloud.",
    pane: "overlay",
    defaults: { conversion: 9, base: 26, spanB: 52, displacement: 26 },
  },
  {
    kind: "Donchian",
    name: "Donchian Channels",
    category: "Volatility",
    description: "Highest high, lowest low and midpoint of a rolling window.",
    pane: "overlay",
    defaults: { period: 20 },
  },
  {
    kind: "Keltner",
    name: "Keltner Channels",
    category: "Volatility",
    description: "An EMA surrounded by Wilder ATR volatility bands.",
    pane: "overlay",
    defaults: { period: 20, atrPeriod: 10, multiplier: 2 },
  },
  {
    kind: "Supertrend",
    name: "Supertrend",
    category: "Trend",
    description: "ATR-based trailing levels that switch with trend direction.",
    pane: "overlay",
    defaults: { period: 10, multiplier: 3 },
  },
  {
    kind: "Stochastic",
    name: "Stochastic oscillator",
    shortName: "Stoch",
    category: "Momentum",
    description: "Smoothed %K and %D locate the close within its recent range.",
    pane: "oscillator",
    defaults: { period: 14, kSmooth: 3, dSmooth: 3 },
    bounds: [0, 100],
  },
  {
    kind: "StochRSI",
    name: "Stochastic RSI",
    shortName: "Stoch RSI",
    category: "Momentum",
    description: "Stochastic momentum of RSI with smoothed %K and %D.",
    pane: "oscillator",
    defaults: { rsiPeriod: 14, period: 14, kSmooth: 3, dSmooth: 3 },
    bounds: [0, 100],
  },
  {
    kind: "ADX",
    name: "Average directional index",
    aliases: "DMI directional movement DI",
    category: "Trend",
    description:
      "Wilder trend strength with positive and negative directional lines.",
    pane: "oscillator",
    defaults: { period: 14 },
    bounds: [0, 100],
  },
  {
    kind: "CCI",
    name: "Commodity channel index",
    category: "Momentum",
    description: "Typical price relative to its average and mean deviation.",
    pane: "oscillator",
    defaults: { period: 20 },
  },
  {
    kind: "WilliamsR",
    name: "Williams %R",
    shortName: "%R",
    category: "Momentum",
    description: "Close position in the recent range, from −100 to 0.",
    pane: "oscillator",
    defaults: { period: 14 },
    bounds: [-100, 0],
  },
  {
    kind: "ROC",
    name: "Rate of change",
    category: "Momentum",
    description: "Percentage price change over a configurable number of bars.",
    pane: "oscillator",
    defaults: { period: 12 },
  },
  {
    kind: "AO",
    name: "Awesome oscillator",
    category: "Momentum",
    description:
      "Fast minus slow average of median prices, shown as a histogram.",
    pane: "oscillator",
    defaults: { fast: 5, slow: 34 },
  },
  {
    kind: "OBV",
    name: "On-balance volume",
    category: "Volume",
    description: "Cumulative volume added or subtracted by close direction.",
    pane: "oscillator",
    defaults: {},
    format: "volume",
  },
  {
    kind: "MFI",
    name: "Money flow index",
    category: "Volume",
    description: "Volume-weighted typical-price momentum, from 0 to 100.",
    pane: "oscillator",
    defaults: { period: 14 },
    bounds: [0, 100],
  },
  {
    kind: "CMF",
    name: "Chaikin money flow",
    category: "Volume",
    description:
      "Volume-weighted buying and selling pressure in a rolling window.",
    pane: "oscillator",
    defaults: { period: 20 },
    bounds: [-1, 1],
  },
  {
    kind: "ADL",
    name: "Accumulation / distribution",
    aliases: "A/D accumulation distribution line",
    shortName: "A/D",
    category: "Volume",
    description:
      "Cumulative money-flow volume based on each bar’s close position.",
    pane: "oscillator",
    defaults: {},
    format: "volume",
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
  /** Displace by trading bars, never by elapsed seconds or invented candles. */
  offset?: number;
  /** Insert whitespace at missing bars instead of connecting separate regimes. */
  gaps?: boolean;
  referenceLines?: { value: number; label: string }[];
}

type MaybeValues = (number | null)[];
const period = (value: number | undefined, fallback: number) =>
  Number.isFinite(value)
    ? Math.min(5000, Math.max(1, Math.round(value!)))
    : fallback;

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

/** Full-window rolling averages also work on delayed or interrupted inputs. */
function rollingMean(
  values: MaybeValues,
  length: number,
  weighted = false,
): MaybeValues {
  let sum = 0,
    weights = 0,
    count = 0;
  return values.map((value, i) => {
    const old = i >= length ? values[i - length] : null;
    weights += length * (value ?? 0) - sum;
    sum += (value ?? 0) - (old ?? 0);
    count += Number(value !== null) - Number(old !== null);
    return i >= length - 1 && count === length
      ? weighted
        ? weights / ((length * (length + 1)) / 2)
        : sum / length
      : null;
  });
}
function smooth(
  values: MaybeValues,
  length: number,
  wilder = false,
): MaybeValues {
  let average: number | null = null,
    sum = 0,
    count = 0;
  return values.map((value) => {
    if (value === null) {
      average = null;
      sum = 0;
      count = 0;
      return null;
    }
    if (average === null) {
      sum += value;
      count++;
      if (count < length) return null;
      average = sum / length;
    } else
      average += (wilder ? 1 / length : 2 / (length + 1)) * (value - average);
    return average;
  });
}
function extrema(
  values: MaybeValues,
  length: number,
  maximum: boolean,
): MaybeValues {
  const queue: number[] = [];
  let head = 0,
    run = 0;
  return values.map((value, i) => {
    if (value === null) {
      queue.length = 0;
      head = 0;
      run = 0;
      return null;
    }
    run++;
    while (queue.length > head && queue[head] <= i - length) head++;
    while (
      queue.length > head &&
      (maximum
        ? values[queue.at(-1)!]! <= value
        : values[queue.at(-1)!]! >= value)
    )
      queue.pop();
    queue.push(i);
    if (head > 1024) {
      queue.splice(0, head);
      head = 0;
    }
    return run >= length ? values[queue[head]] : null;
  });
}
const closesOf = (bars: Bar[]) => bars.map((b) => b.close);
const typicalOf = (bars: Bar[]) =>
  bars.map((b) => (b.high + b.low + b.close) / 3);
const volumesOf = (bars: Bar[]) => bars.map((b) => Math.max(0, b.volume));
function rangeMid(bars: Bar[], length: number): MaybeValues {
  const high = extrema(
    bars.map((b) => b.high),
    length,
    true,
  );
  const low = extrema(
    bars.map((b) => b.low),
    length,
    false,
  );
  return high.map((h, i) => (h === null ? null : (h + low[i]!) / 2));
}
function atrValues(bars: Bar[], length: number): MaybeValues {
  return smooth(
    bars.map((b, i) =>
      i === 0
        ? b.high - b.low
        : Math.max(
            b.high - b.low,
            Math.abs(b.high - bars[i - 1].close),
            Math.abs(b.low - bars[i - 1].close),
          ),
    ),
    length,
    true,
  );
}
const multiplierOf = (config: IndicatorConfig, fallback: number) =>
  Number.isFinite(config.parameters.multiplier)
    ? Math.min(100, Math.max(0.1, config.parameters.multiplier))
    : fallback;
function withLevels(
  output: IndicatorSeries,
  levels: number[],
): IndicatorSeries {
  return {
    ...output,
    referenceLines: levels.map((value) => ({ value, label: String(value) })),
  };
}
function stochasticLines(
  bars: Bar[],
  values: MaybeValues,
  config: IndicatorConfig,
): IndicatorSeries[] {
  const k = rollingMean(values, period(config.parameters.kSmooth, 3));
  const d = rollingMean(k, period(config.parameters.dSmooth, 3));
  return [
    withLevels(line(bars, "k", "%K", config.color, k), [20, 80]),
    line(bars, "d", "%D", "#d8ba77", d),
  ];
}
function moneyMultiplier(bar: Bar) {
  return bar.high === bar.low
    ? 0
    : (2 * bar.close - bar.high - bar.low) / (bar.high - bar.low);
}
const expandedCalculators: Record<
  Exclude<
    IndicatorKind,
    "SMA" | "EMA" | "RSI" | "MACD" | "BB" | "ATR" | "VWAP" | "Volume"
  >,
  Calculator
> = {
  WMA: (bars, c) => [
    line(
      bars,
      "average",
      `WMA ${period(c.parameters.period, 20)}`,
      c.color,
      rollingMean(closesOf(bars), period(c.parameters.period, 20), true),
    ),
  ],
  DEMA: (bars, c) => {
    const n = period(c.parameters.period, 20),
      first = ema(closesOf(bars), n),
      second = smooth(first, n);
    return [
      line(
        bars,
        "average",
        `DEMA ${n}`,
        c.color,
        first.map((v, i) => (second[i] === null ? null : 2 * v! - second[i]!)),
      ),
    ];
  },
  TEMA: (bars, c) => {
    const n = period(c.parameters.period, 20),
      first = ema(closesOf(bars), n),
      second = smooth(first, n),
      third = smooth(second, n);
    return [
      line(
        bars,
        "average",
        `TEMA ${n}`,
        c.color,
        first.map((v, i) =>
          third[i] === null ? null : 3 * v! - 3 * second[i]! + third[i]!,
        ),
      ),
    ];
  },
  HMA: (bars, c) => {
    const n = period(c.parameters.period, 20),
      closes = closesOf(bars);
    const half = rollingMean(closes, Math.max(1, Math.floor(n / 2)), true),
      full = rollingMean(closes, n, true);
    const difference = full.map((v, i) =>
      v === null ? null : 2 * half[i]! - v,
    );
    return [
      line(
        bars,
        "average",
        `HMA ${n}`,
        c.color,
        rollingMean(difference, Math.max(1, Math.round(Math.sqrt(n))), true),
      ),
    ];
  },
  VWMA: (bars, c) => {
    const n = period(c.parameters.period, 20),
      volume = volumesOf(bars),
      denominator = sma(volume, n);
    const numerator = sma(
      bars.map((b, i) => b.close * volume[i]),
      n,
    );
    return [
      line(
        bars,
        "average",
        `VWMA ${n}`,
        c.color,
        numerator.map((v, i) =>
          v === null || !denominator[i] ? null : v / denominator[i]!,
        ),
      ),
    ];
  },
  Ichimoku: (bars, c) => {
    const conversion = rangeMid(bars, period(c.parameters.conversion, 9));
    const base = rangeMid(bars, period(c.parameters.base, 26));
    const spanB = rangeMid(bars, period(c.parameters.spanB, 52));
    const offset = Math.min(200, period(c.parameters.displacement, 26));
    return [
      line(bars, "conversion", "Conversion", "#75c5cf", conversion),
      line(bars, "base", "Base", "#e18ba2", base),
      {
        ...line(
          bars,
          "span-a",
          "Leading span A",
          "#6ca998",
          conversion.map((v, i) =>
            v === null || base[i] === null ? null : (v + base[i]!) / 2,
          ),
        ),
        offset,
      },
      { ...line(bars, "span-b", "Leading span B", "#cc727a", spanB), offset },
      {
        ...line(bars, "lagging", "Lagging close", c.color, closesOf(bars)),
        offset: -offset,
      },
    ];
  },
  Donchian: (bars, c) => {
    const n = period(c.parameters.period, 20),
      high = extrema(
        bars.map((b) => b.high),
        n,
        true,
      ),
      low = extrema(
        bars.map((b) => b.low),
        n,
        false,
      );
    return [
      line(bars, "upper", `Donchian high ${n}`, c.color, high),
      {
        ...line(
          bars,
          "middle",
          "Donchian midpoint",
          c.color,
          high.map((h, i) => (h === null ? null : (h + low[i]!) / 2)),
        ),
        dashed: true,
      },
      line(bars, "lower", `Donchian low ${n}`, c.color, low),
    ];
  },
  Keltner: (bars, c) => {
    const n = period(c.parameters.period, 20),
      middle = ema(closesOf(bars), n),
      atr = atrValues(bars, period(c.parameters.atrPeriod, 10)),
      mult = multiplierOf(c, 2);
    const band = (direction: number) =>
      middle.map((v, i) =>
        v === null || atr[i] === null ? null : v + direction * mult * atr[i]!,
      );
    return [
      line(bars, "upper", `Keltner upper ${n}`, c.color, band(1)),
      {
        ...line(bars, "middle", `Keltner EMA ${n}`, c.color, middle),
        dashed: true,
      },
      line(bars, "lower", `Keltner lower ${n}`, c.color, band(-1)),
    ];
  },
  Supertrend: (bars, c) => {
    const atr = atrValues(bars, period(c.parameters.period, 10)),
      mult = multiplierOf(c, 3);
    const up: MaybeValues = Array(bars.length).fill(null),
      down: MaybeValues = Array(bars.length).fill(null);
    let upper = 0,
      lower = 0,
      bullish = false,
      initialized = false;
    bars.forEach((bar, i) => {
      if (atr[i] === null) return;
      const midpoint = (bar.high + bar.low) / 2,
        basicUpper = midpoint + mult * atr[i]!,
        basicLower = midpoint - mult * atr[i]!;
      if (!initialized) {
        upper = basicUpper;
        lower = basicLower;
        initialized = true;
      } else {
        upper =
          basicUpper < upper || bars[i - 1].close > upper ? basicUpper : upper;
        lower =
          basicLower > lower || bars[i - 1].close < lower ? basicLower : lower;
        bullish = bullish ? bar.close >= lower : bar.close > upper;
      }
      (bullish ? up : down)[i] = bullish ? lower : upper;
    });
    return [
      { ...line(bars, "up", "Supertrend up", "#6ca998", up), gaps: true },
      { ...line(bars, "down", "Supertrend down", "#cc727a", down), gaps: true },
    ];
  },
  Stochastic: (bars, c) => {
    const n = period(c.parameters.period, 14),
      high = extrema(
        bars.map((b) => b.high),
        n,
        true,
      ),
      low = extrema(
        bars.map((b) => b.low),
        n,
        false,
      );
    return stochasticLines(
      bars,
      high.map((h, i) =>
        h === null
          ? null
          : h === low[i]
            ? 50
            : (100 * (bars[i].close - low[i]!)) / (h - low[i]!),
      ),
      c,
    );
  },
  StochRSI: (bars, c) => {
    const rsiConfig = {
      ...c,
      parameters: { period: period(c.parameters.rsiPeriod, 14) },
    };
    const rsiMap = new Map(
      calculators.RSI(bars, rsiConfig)[0].data.map((p) => [p.time, p.value]),
    );
    const rsi = bars.map((b) => rsiMap.get(b.time) ?? null),
      n = period(c.parameters.period, 14);
    const high = extrema(rsi, n, true),
      low = extrema(rsi, n, false);
    return stochasticLines(
      bars,
      high.map((h, i) =>
        h === null
          ? null
          : h === low[i]
            ? 50
            : (100 * (rsi[i]! - low[i]!)) / (h - low[i]!),
      ),
      c,
    );
  },
  ADX: (bars, c) => {
    const n = period(c.parameters.period, 14);
    const trueRange: MaybeValues = [null],
      plus: MaybeValues = [null],
      minus: MaybeValues = [null];
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i],
        prev = bars[i - 1],
        rise = b.high - prev.high,
        fall = prev.low - b.low;
      trueRange[i] = Math.max(
        b.high - b.low,
        Math.abs(b.high - prev.close),
        Math.abs(b.low - prev.close),
      );
      plus[i] = rise > fall && rise > 0 ? rise : 0;
      minus[i] = fall > rise && fall > 0 ? fall : 0;
    }
    if (!bars.length) {
      trueRange.length = 0;
      plus.length = 0;
      minus.length = 0;
    }
    const tr = smooth(trueRange, n, true),
      positive = smooth(plus, n, true),
      negative = smooth(minus, n, true);
    const di = (values: MaybeValues) =>
      tr.map((v, i) =>
        v === null ? null : v === 0 ? 0 : (100 * values[i]!) / v,
      );
    const pdi = di(positive),
      mdi = di(negative),
      dx = pdi.map((v, i) =>
        v === null
          ? null
          : v + mdi[i]! === 0
            ? 0
            : (100 * Math.abs(v - mdi[i]!)) / (v + mdi[i]!),
      );
    return [
      withLevels(
        line(bars, "adx", `ADX ${n}`, c.color, smooth(dx, n, true)),
        [25],
      ),
      line(bars, "plus-di", "+DI", "#6ca998", pdi),
      line(bars, "minus-di", "−DI", "#cc727a", mdi),
    ];
  },
  CCI: (bars, c) => {
    const n = period(c.parameters.period, 20),
      typical = typicalOf(bars),
      mean = sma(typical, n);
    const values = mean.map((v, i) => {
      if (v === null) return null;
      let deviation = 0;
      for (let j = i - n + 1; j <= i; j++)
        deviation += Math.abs(typical[j] - v) / n;
      return deviation === 0 ? 0 : (typical[i] - v) / (0.015 * deviation);
    });
    return [
      withLevels(line(bars, "cci", `CCI ${n}`, c.color, values), [-100, 100]),
    ];
  },
  WilliamsR: (bars, c) => {
    const n = period(c.parameters.period, 14),
      high = extrema(
        bars.map((b) => b.high),
        n,
        true,
      ),
      low = extrema(
        bars.map((b) => b.low),
        n,
        false,
      );
    return [
      withLevels(
        line(
          bars,
          "williams",
          `Williams %R ${n}`,
          c.color,
          high.map((h, i) =>
            h === null
              ? null
              : h === low[i]
                ? -50
                : (-100 * (h - bars[i].close)) / (h - low[i]!),
          ),
        ),
        [-80, -20],
      ),
    ];
  },
  ROC: (bars, c) => {
    const n = period(c.parameters.period, 12);
    return [
      withLevels(
        line(
          bars,
          "roc",
          `ROC ${n} %`,
          c.color,
          bars.map((b, i) =>
            i < n || bars[i - n].close === 0
              ? null
              : 100 * (b.close / bars[i - n].close - 1),
          ),
        ),
        [0],
      ),
    ];
  },
  AO: (bars, c) => {
    const median = bars.map((b) => (b.high + b.low) / 2),
      fast = sma(median, period(c.parameters.fast, 5)),
      slow = sma(median, period(c.parameters.slow, 34));
    const output = withLevels(
      line(
        bars,
        "ao",
        "Awesome oscillator",
        c.color,
        fast.map((v, i) =>
          v === null || slow[i] === null ? null : v - slow[i]!,
        ),
      ),
      [0],
    );
    return [
      {
        ...output,
        type: "histogram",
        data: output.data.map((p, i, data) => ({
          ...p,
          color:
            i === 0 || p.value >= data[i - 1].value ? "#6ca998" : "#cc727a",
        })),
      },
    ];
  },
  OBV: (bars, c) => {
    let total = 0;
    return [
      line(
        bars,
        "obv",
        "OBV",
        c.color,
        bars.map((b, i) => {
          if (i > 0)
            total +=
              Math.sign(b.close - bars[i - 1].close) * Math.max(0, b.volume);
          return total;
        }),
      ),
    ];
  },
  MFI: (bars, c) => {
    const n = period(c.parameters.period, 14),
      typical = typicalOf(bars),
      volume = volumesOf(bars);
    const positive: MaybeValues = typical.map((v, i) =>
      i === 0 ? null : v > typical[i - 1] ? v * volume[i] : 0,
    );
    const negative: MaybeValues = typical.map((v, i) =>
      i === 0 ? null : v < typical[i - 1] ? v * volume[i] : 0,
    );
    const gain = rollingMean(positive, n),
      loss = rollingMean(negative, n);
    return [
      withLevels(
        line(
          bars,
          "mfi",
          `MFI ${n}`,
          c.color,
          gain.map((v, i) =>
            v === null
              ? null
              : loss[i] === 0
                ? v === 0
                  ? 50
                  : 100
                : 100 - 100 / (1 + v / loss[i]!),
          ),
        ),
        [20, 80],
      ),
    ];
  },
  CMF: (bars, c) => {
    const n = period(c.parameters.period, 20),
      volume = volumesOf(bars),
      denominator = sma(volume, n),
      numerator = sma(
        bars.map((b, i) => moneyMultiplier(b) * volume[i]),
        n,
      );
    return [
      withLevels(
        line(
          bars,
          "cmf",
          `CMF ${n}`,
          c.color,
          numerator.map((v, i) =>
            v === null || !denominator[i] ? null : v / denominator[i]!,
          ),
        ),
        [0],
      ),
    ];
  },
  ADL: (bars, c) => {
    let total = 0;
    return [
      line(
        bars,
        "adl",
        "A/D",
        c.color,
        bars.map((b) => (total += moneyMultiplier(b) * Math.max(0, b.volume))),
      ),
    ];
  },
};

const calculators: Record<IndicatorKind, Calculator> = {
  ...expandedCalculators,
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
    line(
      bars,
      "average",
      `Volume SMA ${period(config.parameters.period, 20)}`,
      config.color,
      sma(
        bars.map((bar) => Math.max(0, bar.volume)),
        period(config.parameters.period, 20),
      ),
    ),
  ],
};

/** Pure local calculation. Each instance is identified by its own config.id. */
export function calculateIndicator(
  bars: Bar[],
  config: IndicatorConfig,
): IndicatorSeries[] {
  return calculators[config.kind](bars, config);
}

export function indicatorParameter(key: string) {
  const labels: Record<string, string> = {
    period: "Period",
    stdDev: "Std. dev.",
    fast: "Fast",
    slow: "Slow",
    signal: "Signal",
    conversion: "Conversion",
    base: "Base",
    spanB: "Span B",
    displacement: "Displacement",
    atrPeriod: "ATR period",
    multiplier: "Multiplier",
    kSmooth: "%K smoothing",
    dSmooth: "%D smoothing",
    rsiPeriod: "RSI period",
  };
  const fractional = key === "stdDev" || key === "multiplier";
  return {
    label: labels[key] ?? key,
    min: fractional ? 0.1 : 1,
    max: key === "displacement" ? 200 : fractional ? 100 : 5000,
    step: fractional ? 0.1 : 1,
  };
}
export function indicatorName(kind: IndicatorKind) {
  const definition = INDICATOR_DEFINITIONS.find((d) => d.kind === kind);
  return definition?.shortName ?? (kind === "BB" ? "Bollinger Bands" : kind);
}
