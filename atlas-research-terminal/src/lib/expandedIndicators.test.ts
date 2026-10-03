import { describe, expect, it } from "vitest";
import { calculateIndicator, INDICATOR_DEFINITIONS } from "./indicators";
import type { Bar, IndicatorConfig, IndicatorKind } from "./types";

const barsFor = (closes: number[]): Bar[] =>
  closes.map((close, index) => ({
    time: 1_700_000_000 + index * 86_400,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }));
const calculate = (
  kind: IndicatorKind,
  bars: Bar[],
  parameters: Record<string, number> = {},
) =>
  calculateIndicator(bars, {
    kind,
    id: kind,
    parameters,
    color: "#a698d1",
    visible: true,
  } satisfies IndicatorConfig);
const values = (
  kind: IndicatorKind,
  closes: number[],
  parameters: Record<string, number>,
  key?: string,
) => {
  const result = calculate(kind, barsFor(closes), parameters);
  return (key ? result.find((s) => s.key === key)! : result[0]).data.map(
    (p) => p.value,
  );
};
const rising = Array.from({ length: 80 }, (_, i) => i + 1);

describe("expanded indicator calculations", () => {
  it("weights recent closes and correctly seeds stacked EMA stages", () => {
    expect(values("WMA", [1, 2, 3, 4], { period: 3 })).toEqual([
      14 / 6,
      20 / 6,
    ]);
    const dema = calculate("DEMA", barsFor(rising), { period: 3 })[0].data;
    const tema = calculate("TEMA", barsFor(rising), { period: 3 })[0].data;
    expect(dema[0]).toEqual({ time: barsFor(rising)[4].time, value: 5 });
    expect(tema[0]).toEqual({ time: barsFor(rising)[6].time, value: 7 });
    expect(tema.at(-1)!.value).toBeCloseTo(80);
  });
  it("computes Hull’s two weighted stages without filling their warm-up gaps", () => {
    const data = calculate("HMA", barsFor([1, 2, 3, 4, 5, 6]), { period: 4 })[0]
      .data;
    expect(data[0].time).toBe(barsFor(rising)[4].time);
    expect(data.map((p) => p.value)).toEqual([5, 6]);
    expect(values("HMA", [2, 4, 8], { period: 1 })).toEqual([2, 4, 8]);
  });
  it("weights a rolling VWMA and omits windows without volume", () => {
    const bars = barsFor([10, 20, 40, 80]);
    bars[1].volume = 300;
    bars[2].volume = 0;
    bars[3].volume = 0;
    expect(
      calculate("VWMA", bars, { period: 2 })[0].data.map((p) => p.value),
    ).toEqual([17.5, 20]);
    expect(
      calculate(
        "VWMA",
        bars.map((b) => ({ ...b, volume: 0 })),
        { period: 2 },
      )[0].data,
    ).toEqual([]);
  });
  it("calculates all five Ichimoku lines from range midpoints and explicit offsets", () => {
    const bars = barsFor([1, 2, 3, 4, 5, 6]);
    const series = calculate("Ichimoku", bars, {
      conversion: 2,
      base: 3,
      spanB: 4,
      displacement: 2,
    });
    expect(
      series.find((s) => s.key === "conversion")!.data.map((p) => p.value),
    ).toEqual([1.5, 2.5, 3.5, 4.5, 5.5]);
    expect(
      series.find((s) => s.key === "base")!.data.map((p) => p.value),
    ).toEqual([2, 3, 4, 5]);
    expect(series.find((s) => s.key === "span-a")!.data[0]).toEqual({
      time: bars[2].time,
      value: 2.25,
    });
    expect(series.find((s) => s.key === "span-b")!.data[0]).toEqual({
      time: bars[3].time,
      value: 2.5,
    });
    expect(series.find((s) => s.key === "span-a")!.offset).toBe(2);
    expect(series.find((s) => s.key === "span-b")!.offset).toBe(2);
    expect(series.find((s) => s.key === "lagging")!.offset).toBe(-2);
    expect(
      series.find((s) => s.key === "lagging")!.data.map((p) => p.value),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("uses actual window extremes for Donchian and Wilder ATR for Keltner", () => {
    const bars = barsFor([10, 14, 11, 11]);
    [
      [12, 8],
      [15, 11],
      [13, 9],
      [12, 10],
    ].forEach(([high, low], i) => Object.assign(bars[i], { high, low }));
    const donchian = calculate("Donchian", bars, { period: 2 });
    expect(donchian[0].data.map((p) => p.value)).toEqual([15, 15, 13]);
    expect(donchian[2].data.map((p) => p.value)).toEqual([8, 9, 9]);
    const keltner = calculate("Keltner", bars, {
      period: 3,
      atrPeriod: 3,
      multiplier: 1.5,
    });
    expect(keltner[1].data[0].value).toBeCloseTo(35 / 3);
    expect(keltner[0].data[0].value).toBeCloseTo(35 / 3 + (1.5 * 14) / 3);
    expect(keltner[2].data[1].value).toBeCloseTo(34 / 3 - (1.5 * 34) / 9);
  });
  it("switches Supertrend at trailing bands without connecting separate regimes", () => {
    const bars = barsFor([10, 10, 13, 16, 8, 5, 14]).map((b) => ({
      ...b,
      high: b.close + 1,
      low: b.close - 1,
    }));
    const series = calculate("Supertrend", bars, { period: 2, multiplier: 1 });
    const up = series.find((s) => s.key === "up")!,
      down = series.find((s) => s.key === "down")!;
    expect(up.gaps).toBe(true);
    expect(down.gaps).toBe(true);
    expect(down.data.map((p) => p.time)).toEqual([
      bars[1].time,
      bars[4].time,
      bars[5].time,
    ]);
    expect(up.data.map((p) => p.time)).toEqual([
      bars[2].time,
      bars[3].time,
      bars[6].time,
    ]);
    expect(up.data[0].value).toBe(10);
    expect(up.data[1].value).toBe(12.5);
    expect(down.data[1].value).toBe(14.25);
    expect(down.data[2].value).toBe(10.125);
  });
  it("smooths %K and %D only after a complete stochastic window", () => {
    const bars = barsFor([2, 4, 6, 4, 3, 7]);
    const result = calculate("Stochastic", bars, {
      period: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(result[0].data[0].time).toBe(bars[3].time);
    expect(result[0].data[0].value).toBe(50);
    expect(result[1].data[0].time).toBe(bars[4].time);
    expect(result[1].data[0].value).toBe(25);
    const flat = values("Stochastic", [5, 5, 5, 5], {
      period: 2,
      kSmooth: 1,
      dSmooth: 1,
    });
    expect(flat).toEqual([50, 50, 50]);
  });
  it("applies the stochastic window to Wilder RSI before smoothing", () => {
    const bars = barsFor([10, 12, 11, 14, 10, 15, 13, 16]);
    const rsi = calculate("RSI", bars, { period: 2 })[0].data;
    const result = calculate("StochRSI", bars, {
      rsiPeriod: 2,
      period: 3,
      kSmooth: 1,
      dSmooth: 1,
    })[0].data;
    expect(result[0].time).toBe(bars[4].time);
    const window = rsi.slice(0, 3).map((p) => p.value);
    expect(result[0].value).toBeCloseTo(
      (100 * (window[2] - Math.min(...window))) /
        (Math.max(...window) - Math.min(...window)),
    );
    expect(
      values("StochRSI", rising, {
        rsiPeriod: 3,
        period: 3,
        kSmooth: 2,
        dSmooth: 2,
      }).every((v) => v === 50),
    ).toBe(true);
  });
  it("seeds directional movement from deltas and waits for a full ADX window", () => {
    const bars = barsFor(rising).map((b) => ({
      ...b,
      high: b.close + 1,
      low: b.close - 1,
    }));
    const result = calculate("ADX", bars, { period: 3 });
    expect(result[0].data[0]).toEqual({ time: bars[5].time, value: 100 });
    expect(result[1].data[0]).toEqual({ time: bars[3].time, value: 50 });
    expect(result[2].data.every((p) => p.value === 0)).toBe(true);
    const flat = calculate("ADX", barsFor(Array(20).fill(5)), { period: 3 });
    flat.forEach((s) => expect(s.data.every((p) => p.value === 0)).toBe(true));
  });
  it("calculates CCI, Williams %R, ROC and the median-price Awesome Oscillator", () => {
    values("CCI", [1, 2, 3, 4], { period: 3 }).forEach((v) =>
      expect(v).toBeCloseTo(100),
    );
    values("WilliamsR", [1, 2, 3, 2, 1], { period: 3 }).forEach((v, i) =>
      expect(v).toBeCloseTo([0, -100, -100][i]),
    );
    const roc = values("ROC", [10, 20, 30, 10], { period: 2 });
    expect(roc[0]).toBe(200);
    expect(roc[1]).toBe(-50);
    expect(values("ROC", [0, 20, 30], { period: 2 })).toEqual([]);
    expect(values("AO", [1, 2, 3, 4, 5], { fast: 2, slow: 3 })).toEqual([
      0.5, 0.5, 0.5,
    ]);
  });
  it("keeps OBV and A/D cumulative with clear flat-bar behavior", () => {
    const bars = barsFor([10, 12, 12, 8]);
    bars[2].volume = 50;
    bars[3].volume = 200;
    expect(calculate("OBV", bars)[0].data.map((p) => p.value)).toEqual([
      0, 100, 100, -100,
    ]);
    const flow = barsFor([12, 8, 10, 10]);
    flow.forEach((b, i) =>
      Object.assign(b, { high: i === 3 ? 10 : 12, low: i === 3 ? 10 : 8 }),
    );
    expect(calculate("ADL", flow)[0].data.map((p) => p.value)).toEqual([
      100, 0, 0, 0,
    ]);
    expect(
      calculate("CMF", flow, { period: 2 })[0].data.map((p) => p.value),
    ).toEqual([0, -0.5, 0]);
    expect(
      calculate(
        "CMF",
        flow.map((b) => ({ ...b, volume: 0 })),
        { period: 2 },
      )[0].data,
    ).toEqual([]);
  });
  it("uses directional typical-price flows in MFI and handles no-volume data", () => {
    const bars = barsFor([10, 20, 10, 15]);
    const result = calculate("MFI", bars, { period: 2 })[0].data;
    expect(result[0].time).toBe(bars[2].time);
    expect(result[0].value).toBeCloseTo((100 * 20) / 30);
    expect(result[1].value).toBe(60);
    expect(values("MFI", [1, 2, 3], { period: 2 })).toEqual([100]);
    expect(values("MFI", [3, 2, 1], { period: 2 })).toEqual([0]);
    expect(
      calculate(
        "MFI",
        bars.map((b) => ({ ...b, volume: 0 })),
        { period: 2 },
      )[0].data.map((p) => p.value),
    ).toEqual([50, 50]);
  });
  it("adds a configurable volume average in the same pane as up/down bars", () => {
    const bars = barsFor([10, 9, 10]);
    bars[0].volume = 100;
    bars[1].volume = 300;
    bars[2].volume = 200;
    bars[1].open = 10;
    const result = calculate("Volume", bars, { period: 2 });
    expect(result[1].data.map((p) => p.value)).toEqual([200, 250]);
    expect(result[0].data[0].color).not.toBe(result[0].data[1].color);
  });
  it("registers 28 unique indicators with finite results on long, flat and zero-volume data", () => {
    expect(INDICATOR_DEFINITIONS).toHaveLength(28);
    expect(new Set(INDICATOR_DEFINITIONS.map((d) => d.kind)).size).toBe(28);
    const histories = [
      barsFor(rising),
      barsFor(Array(80).fill(10)),
      barsFor(rising).map((b) => ({ ...b, volume: 0 })),
    ];
    for (const def of INDICATOR_DEFINITIONS)
      for (const bars of histories) {
        const before = structuredClone(bars);
        const series = calculate(def.kind, bars, def.defaults);
        for (const output of series) {
          expect(output.data.every((p) => Number.isFinite(p.value))).toBe(true);
          expect(
            output.data.every(
              (p, i) => i === 0 || p.time > output.data[i - 1].time,
            ),
          ).toBe(true);
        }
        expect(bars).toEqual(before);
      }
  });
});
