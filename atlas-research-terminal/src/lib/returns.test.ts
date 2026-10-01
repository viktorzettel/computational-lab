import { describe, expect, it } from "vitest";
import { candleReturn, periodReturns } from "./returns";
import type { Bar } from "./types";
const bar = (date: string, close: number): Bar => ({
  time: Date.parse(date) / 1000,
  open: close,
  close,
  high: close,
  low: close,
  volume: 1,
});
const value = (bars: Bar[], period: string) =>
  periodReturns(bars).find((result) => result.period === period)!;

describe("candle return", () => {
  it("uses the previous candle close for the latest or crosshair candle", () => {
    const bars = [
      bar("2026-09-25", 100),
      bar("2026-09-28", 110),
      bar("2026-09-29", 99),
    ];
    expect(candleReturn(bars)).toBeCloseTo(-10);
    expect(candleReturn(bars, bars[1].time)).toBeCloseTo(10);
    expect(candleReturn(bars, bars[0].time)).toBeNull();
    expect(candleReturn([])).toBeNull();
  });
});

describe("calendar price returns", () => {
  it("uses the prior trading close for 1D across a weekend", () => {
    expect(
      value([bar("2026-09-25", 100), bar("2026-09-28", 110)], "1D").percent,
    ).toBeCloseTo(10);
  });
  it("uses a close on or before the anchor, irrespective of session hour", () => {
    const bars = [
      bar("2026-09-17T13:30:00Z", 100),
      bar("2026-09-18T13:30:00Z", 120),
      bar("2026-09-24T13:30:00Z", 150),
    ];
    expect(value(bars, "1W").percent).toBeCloseTo(50);
    expect(value(bars, "1W").baselineTime).toBe(bars[0].time);
  });
  it("uses the prior year final close for YTD, including a closed Dec 31", () => {
    const bars = [
      bar("2023-12-29", 100),
      bar("2024-01-02", 110),
      bar("2024-09-30", 150),
    ];
    expect(value(bars, "YTD").percent).toBeCloseTo(50);
  });
  it("clamps month ends and leap years", () => {
    const month = [
      bar("2024-02-29", 100),
      bar("2024-03-01", 200),
      bar("2024-03-31", 150),
    ];
    expect(value(month, "1M").percent).toBeCloseTo(50);
    const year = [
      bar("2023-02-28", 100),
      bar("2023-03-01", 200),
      bar("2024-02-29", 150),
    ];
    expect(value(year, "1Y").percent).toBeCloseTo(50);
  });
  it("never relabels a shorter history as a 2, 5 or 10 year return", () => {
    const bars = [bar("2025-09-30", 100), bar("2026-09-30", 125)];
    expect(value(bars, "1Y").percent).toBeCloseTo(25);
    for (const period of ["2Y", "5Y", "10Y"])
      expect(value(bars, period).percent).toBeNull();
  });
  it("returns all nine periods with no values for empty or one-bar history", () => {
    expect(periodReturns([])).toHaveLength(9);
    expect(
      periodReturns([bar("2026-09-30", 100)]).every(
        (result) => result.percent === null,
      ),
    ).toBe(true);
  });
});
