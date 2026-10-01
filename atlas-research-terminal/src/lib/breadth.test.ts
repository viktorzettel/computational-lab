import { describe, expect, it } from "vitest";
import { breadthSummary, dailyBreadth } from "./breadth";
import type { Bar } from "./types";
const bars = (closes: number[]): Bar[] =>
  closes.map((close, index) => ({
    time: 1_700_000_000 + index * 86400,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
const ascending = (length: number) =>
  bars(Array.from({ length }, (_, index) => index + 1));

describe("watchlist breadth", () => {
  it("recognizes rising prices and averages with full daily history", () => {
    const result = dailyBreadth(ascending(201));
    expect(result.close).toBe(201);
    expect(result.sma50).toBe(176.5);
    expect(result.sma200).toBe(101.5);
    expect(Object.values(result.signals)).toEqual([true, true, true, true]);
  });
  it("recognizes declining prices and averages", () => {
    const result = dailyBreadth(
      bars(Array.from({ length: 201 }, (_, index) => 201 - index)),
    );
    expect(Object.values(result.signals)).toEqual([false, false, false, false]);
  });
  it("does not call equal prices or flat averages above or rising, including decimal roundoff", () => {
    const result = dailyBreadth(bars(Array(220).fill(0.1)));
    expect(Object.values(result.signals)).toEqual([false, false, false, false]);
  });
  it("requires distinct warm-up windows for price and slope measures", () => {
    expect(dailyBreadth(ascending(49)).signals.above50).toBeNull();
    expect(dailyBreadth(ascending(50)).signals).toEqual({
      above50: true,
      above200: null,
      rising50: null,
      rising200: null,
    });
    expect(dailyBreadth(ascending(51)).signals.rising50).toBe(true);
    expect(dailyBreadth(ascending(200)).signals).toEqual({
      above50: true,
      above200: true,
      rising50: true,
      rising200: null,
    });
  });
  it("uses the chosen prior daily bar without fetching another series", () => {
    const prices = Array(201).fill(100);
    prices[150] = 200;
    for (let index = 196; index < 200; index++) prices[index] = 150;
    prices[200] = 150;
    expect(dailyBreadth(bars(prices), 1).signals.rising50).toBe(false);
    expect(dailyBreadth(bars(prices), 5).signals.rising50).toBe(true);
    expect(dailyBreadth(ascending(219), 20).signals.rising200).toBeNull();
    expect(dailyBreadth(ascending(220), 20).signals.rising200).toBe(true);
  });
  it("does not turn missing or invalid prices into failed signals", () => {
    expect(Object.values(dailyBreadth([]).signals)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    const invalid = ascending(201);
    invalid[200].close = NaN;
    expect(Object.values(dailyBreadth(invalid).signals)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(() => dailyBreadth(ascending(201), 0)).toThrow();
  });
  it("uses each measure's eligible names as its own denominator", () => {
    const summary = breadthSummary([
      dailyBreadth(ascending(201)),
      dailyBreadth(bars(Array(50).fill(100))),
    ]);
    expect(summary[0]).toMatchObject({
      passing: 1,
      eligible: 2,
      percentage: 50,
    });
    expect(summary[1]).toMatchObject({
      passing: 1,
      eligible: 1,
      percentage: 100,
    });
    expect(summary[2]).toMatchObject({
      passing: 1,
      eligible: 1,
      percentage: 100,
    });
    expect(
      breadthSummary([]).every(
        (row) => row.eligible === 0 && row.percentage === null,
      ),
    ).toBe(true);
  });
  it("matches the supplied 44/46 and 40/46 percentages without fixing the counts", () => {
    const observations = Array.from({ length: 46 }, (_, index) => ({
      ...dailyBreadth(ascending(201)),
      signals: {
        above50: index < 44,
        above200: index < 40,
        rising50: index < 44,
        rising200: null,
      },
    }));
    const summary = breadthSummary(observations);
    expect(summary[0].percentage?.toFixed(1)).toBe("95.7");
    expect(summary[1].percentage?.toFixed(1)).toBe("87.0");
    expect(summary[2].percentage?.toFixed(1)).toBe("95.7");
    expect(summary[3].percentage).toBeNull();
  });
});
