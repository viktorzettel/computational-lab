import { describe, expect, it } from "vitest";
import { calculateIndicator, INDICATOR_DEFINITIONS } from "./indicators";
import type { Bar, IndicatorConfig, IndicatorKind } from "./types";

const barsFor = (closes: number[]): Bar[] =>
  closes.map((close, index) => ({
    time: 1_700_000_000 + index * 300,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }));
const config = (
  kind: IndicatorKind,
  parameters: Record<string, number> = {},
): IndicatorConfig => ({
  id: `test-${kind}`,
  kind,
  parameters,
  color: "#a698d1",
  visible: true,
});

describe("local indicator calculations", () => {
  it("keeps each configured moving-average instance independent and omits warm-up", () => {
    const bars = barsFor([2, 4, 8, 10]);
    const first = calculateIndicator(bars, config("SMA", { period: 2 }))[0];
    const second = calculateIndicator(bars, config("SMA", { period: 3 }))[0];
    expect(first.data.map((point) => point.value)).toEqual([3, 6, 9]);
    expect(second.data.map((point) => point.value)).toEqual([14 / 3, 22 / 3]);
    expect(first.data[0].time).toBe(bars[1].time);
    const exponential = calculateIndicator(
      bars,
      config("EMA", { period: 3 }),
    )[0].data;
    expect(exponential[0].value).toBeCloseTo(14 / 3, 10);
    expect(exponential[1].value).toBeCloseTo(22 / 3, 10);
    expect(
      calculateIndicator(bars, config("EMA", { period: 200 }))[0].data,
    ).toEqual([]);
  });

  it("matches the published Wilder RSI example and smooths subsequent deltas", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41,
    ];
    const result = calculateIndicator(
      barsFor(closes),
      config("RSI", { period: 14 }),
    )[0].data;
    expect(result).toHaveLength(closes.length - 14);
    expect(result[0].value).toBeCloseTo(70.464135, 6);
    expect(result[1].value).toBeCloseTo(66.249619, 6);
    expect(result[2].value).toBeCloseTo(66.480942, 6);
  });

  it("handles flat, gain-only and loss-only RSI without NaN", () => {
    expect(
      calculateIndicator(barsFor([5, 5, 5, 5]), config("RSI", { period: 3 }))[0]
        .data[0].value,
    ).toBe(50);
    expect(
      calculateIndicator(barsFor([1, 2, 3, 4]), config("RSI", { period: 3 }))[0]
        .data[0].value,
    ).toBe(100);
    expect(
      calculateIndicator(barsFor([4, 3, 2, 1]), config("RSI", { period: 3 }))[0]
        .data[0].value,
    ).toBe(0);
    expect(
      calculateIndicator(barsFor([1, 2, 3]), config("RSI", { period: 3 }))[0]
        .data,
    ).toEqual([]);
  });

  it("computes MACD and its signal from seeded EMAs, including a price shock", () => {
    const bars = barsFor([1, 2, 3, 4, 5, 6, 7, 8, 9, 20]);
    const result = calculateIndicator(
      bars,
      config("MACD", { fast: 3, slow: 5, signal: 2 }),
    );
    const macd = result.find((series) => series.key === "macd")!;
    const signal = result.find((series) => series.key === "signal")!;
    const histogram = result.find((series) => series.key === "histogram")!;
    expect(macd.data[0]).toEqual({ time: bars[4].time, value: 1 });
    expect(signal.data[0]).toEqual({ time: bars[5].time, value: 1 });
    expect(macd.data.at(-1)!.value).toBeCloseTo(8 / 3, 10);
    expect(signal.data.at(-1)!.value).toBeCloseTo(19 / 9, 10);
    expect(histogram.data.at(-1)!.value).toBeCloseTo(5 / 9, 10);
  });

  it("uses population deviation for Bollinger Bands and rolls the complete window", () => {
    const result = calculateIndicator(
      barsFor([1, 2, 3, 4]),
      config("BB", { period: 3, stdDev: 2 }),
    );
    const upper = result.find((series) => series.key === "upper")!.data;
    const middle = result.find((series) => series.key === "middle")!.data;
    const lower = result.find((series) => series.key === "lower")!.data;
    expect(middle.map((point) => point.value)).toEqual([2, 3]);
    expect(upper[0].value).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 10);
    expect(lower[1].value).toBeCloseTo(3 - 2 * Math.sqrt(2 / 3), 10);
    const flat = calculateIndicator(
      barsFor([100, 100, 100, 100]),
      config("BB", { period: 2, stdDev: 2 }),
    );
    flat.forEach((series) =>
      expect(series.data.map((point) => point.value)).toEqual([100, 100, 100]),
    );
  });

  it("includes overnight gaps in true range and applies Wilder ATR smoothing", () => {
    const bars = barsFor([10, 14, 11, 11]);
    const ranges = [
      [12, 8],
      [15, 11],
      [13, 9],
      [12, 10],
    ];
    bars.forEach((bar, index) => {
      [bar.high, bar.low] = ranges[index];
    });
    const data = calculateIndicator(bars, config("ATR", { period: 3 }))[0].data;
    expect(data).toHaveLength(2);
    expect(data[0].time).toBe(bars[2].time);
    expect(data[0].value).toBeCloseTo(14 / 3, 10);
    expect(data[1].value).toBeCloseTo(34 / 9, 10);
    expect(
      calculateIndicator(bars, config("ATR", { period: 1 }))[0].data.map(
        (point) => point.value,
      ),
    ).toEqual([4, 5, 5, 2]);
  });

  it("resets VWAP at UTC midnight and weights by actual volume", () => {
    const firstTime = Date.UTC(2024, 0, 1, 23, 50) / 1000;
    const bars = barsFor([10, 20, 40, 50]);
    bars.forEach((bar, index) => {
      bar.time = firstTime + index * 300;
    });
    bars[1].volume = 300;
    bars[2].volume = 200;
    bars[3].volume = 0;
    const data = calculateIndicator(bars, config("VWAP"))[0].data;
    expect(data.map((point) => point.value)).toEqual([10, 17.5, 40, 40]);
    expect(
      calculateIndicator(
        barsFor([1, 2]).map((bar) => ({ ...bar, volume: 0 })),
        config("VWAP"),
      )[0].data,
    ).toEqual([]);
    const typicalPrice = [{ ...bars[0], high: 14, low: 8, close: 11 }];
    expect(
      calculateIndicator(typicalPrice, config("VWAP"))[0].data[0].value,
    ).toBe(11);
  });

  it("supports every registered indicator on empty history without mutating raw bars", () => {
    const bars = barsFor([2, 3, 1]);
    const before = structuredClone(bars);
    INDICATOR_DEFINITIONS.forEach((definition) => {
      const settings = config(definition.kind, definition.defaults);
      expect(
        calculateIndicator([], settings).every(
          (series) => series.data.length === 0,
        ),
      ).toBe(true);
      calculateIndicator(bars, settings);
    });
    expect(bars).toEqual(before);
  });
});
