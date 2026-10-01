import { describe, expect, it } from "vitest";
import {
  averagePosition,
  averageTrend,
  calculateChartIndicator,
  dailyBarsForChart,
  jordiApplied,
  projectDailyPoints,
  toggleJordi,
} from "./jordi";
import type { Bar, IndicatorConfig } from "./types";
const bar = (day: string, close: number): Bar => ({
  time: Date.parse(day) / 1000,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});
const config: IndicatorConfig = {
  id: "daily",
  kind: "SMA",
  basis: "daily",
  parameters: { period: 2 },
  color: "#75c5cf",
  visible: true,
};
const daily = [
  bar("2024-01-01", 10),
  bar("2024-01-02", 20),
  bar("2024-01-03", 30),
  bar("2024-01-04", 40),
];

describe("Jordi chart preset", () => {
  it("replaces other indicators with just the two daily averages", () => {
    const original: IndicatorConfig = {
      ...config,
      id: "native",
      basis: undefined,
      kind: "EMA",
      parameters: { period: 20 },
    };
    const result = toggleJordi([original]);
    expect(result).toHaveLength(2);
    expect(
      result.map((item) => [item.kind, item.basis, item.parameters.period]),
    ).toEqual([
      ["SMA", "daily", 50],
      ["SMA", "daily", 200],
    ]);
    expect(jordiApplied(result)).toBe(true);
  });
  it("toggles without duplicates and preserves custom colors and IDs", () => {
    const first = toggleJordi([]);
    first[0].color = "#123456";
    const off = toggleJordi(first);
    expect(jordiApplied(off)).toBe(false);
    expect(off.every((item) => !item.visible)).toBe(true);
    const again = toggleJordi(off);
    expect(again).toHaveLength(2);
    expect(again[0].id).toBe(first[0].id);
    expect(again[0].color).toBe("#123456");
    expect(jordiApplied(again)).toBe(true);
  });
  it("repairs a partial preset and removes custom and duplicate averages", () => {
    const first = toggleJordi([]);
    const partial = toggleJordi([first[0]]);
    expect(partial).toHaveLength(2);
    expect(jordiApplied(partial)).toBe(true);
    const custom = { ...first[0], parameters: { period: 100 } };
    const result = toggleJordi([
      custom,
      first[0],
      { ...first[0], id: "duplicate" },
    ]);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
    expect(result.map((item) => item.parameters.period)).toEqual([50, 200]);
    const renamed = { ...first[0], parameters: { period: 200 } };
    const repaired = toggleJordi([renamed]);
    expect(new Set(repaired.map((item) => item.id)).size).toBe(2);
    expect(repaired[1].id).toBe(renamed.id);
  });
  it("clears a mixed legacy preset when selected instead of hiding its averages", () => {
    const pair = toggleJordi([]);
    const ema = {
      ...config,
      id: "ema",
      kind: "EMA" as const,
      basis: undefined,
    };
    const mixed = [...pair, ema];
    expect(jordiApplied(mixed)).toBe(false);
    expect(toggleJordi(mixed)).toEqual(pair);
  });
  it("uses daily closes on an hourly chart and never uses that day's future close", () => {
    const hourly = [
      bar("2024-01-03T10:00:00Z", 1000),
      bar("2024-01-03T11:00:00Z", 2000),
      bar("2024-01-04T10:00:00Z", 3000),
    ];
    const output = calculateChartIndicator(hourly, daily, "1h", config)[0];
    expect(output.name).toBe("SMA 2D");
    expect(output.data.map((point) => point.value)).toEqual([15, 15, 25]);
    expect(output.data.map((point) => point.time)).toEqual(
      hourly.map((item) => item.time),
    );
    expect(
      calculateChartIndicator(hourly, daily, "1h", {
        ...config,
        basis: undefined,
      })[0].data.map((point) => point.value),
    ).toEqual([1500, 2500]);
  });
  it("maps each weekly candle to its final available daily average without extending history", () => {
    const points = [
      { time: bar("2024-01-05", 1).time, value: 11 },
      { time: bar("2024-01-12", 1).time, value: 12 },
      { time: bar("2024-01-16", 1).time, value: 999 },
    ];
    const weekly = [bar("2024-01-01", 100), bar("2024-01-08", 100)];
    expect(projectDailyPoints(points, weekly, "1W")).toEqual([
      { time: weekly[0].time, value: 11 },
      { time: weekly[1].time, value: 12 },
    ]);
  });
  it("uses the matching daily cutoff for status and preserves daily chart values", () => {
    const chart = [bar("2024-01-03T10:00:00Z", 100)];
    expect(
      dailyBarsForChart(daily, chart, "1h").map((item) => item.close),
    ).toEqual([10, 20]);
    expect(
      dailyBarsForChart(daily, chart, "1D").map((item) => item.close),
    ).toEqual([10, 20, 30]);
    expect(
      calculateChartIndicator(daily, daily, "1D", config)[0].data.map(
        (point) => point.value,
      ),
    ).toEqual([15, 25, 35]);
    expect(projectDailyPoints([], chart, "1h")).toEqual([]);
  });
  it("labels missing, equal, above, below and directional states accurately", () => {
    expect(averagePosition(101, 100)).toBe("Above");
    expect(averagePosition(99, 100)).toBe("Below");
    expect(averagePosition(100, 100)).toBe("At average");
    expect(averagePosition(100, null)).toBe("—");
    expect(averageTrend(0.1, 100)).toBe("Rising");
    expect(averageTrend(-0.1, 100)).toBe("Falling");
    expect(averageTrend(1e-14, 100)).toBe("Flat");
    expect(averageTrend(null, 100)).toBe("—");
  });
});
