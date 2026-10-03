import { describe, expect, it } from "vitest";
import {
  cloudPolygons,
  cloudRuns,
  logicalCoordinate,
  projectIndicatorData,
} from "./indicatorProjection";
import type { Bar } from "./types";
import type { IndicatorSeries } from "./indicators";
const bars: Bar[] = [100, 200, 900, 1000].map((time) => ({
  time,
  open: 1,
  high: 2,
  low: 1,
  close: 2,
  volume: 1,
}));
const output: IndicatorSeries = {
  key: "a",
  name: "A",
  type: "line",
  color: "#abc",
  data: [
    { time: 100, value: 3 },
    { time: 900, value: 4 },
  ],
  offset: 1,
};
describe("trading-bar projection and cloud geometry", () => {
  it("shifts by actual bars through session gaps and drops out-of-history targets", () => {
    expect(projectIndicatorData(bars, output)).toEqual([
      { time: 200, value: 3 },
      { time: 1000, value: 4 },
    ]);
    expect(projectIndicatorData(bars, { ...output, offset: -1 })).toEqual([
      { time: 200, value: 4 },
    ]);
    expect(projectIndicatorData(bars, { ...output, offset: 26 })).toEqual([]);
  });
  it("adds whitespace for missing regime bars without invented values", () => {
    expect(projectIndicatorData(bars, { ...output, gaps: true })).toEqual([
      { time: 100 },
      { time: 200, value: 3 },
      { time: 900 },
      { time: 1000, value: 4 },
    ]);
  });
  it("splits crossings exactly and switches fill from bullish to bearish", () => {
    const polygons = cloudPolygons(
      { logical: 10, a: 4, b: 2 },
      { logical: 11, a: 1, b: 3 },
    );
    expect(polygons).toHaveLength(2);
    expect(polygons.map((p) => p.bullish)).toEqual([true, false]);
    expect(polygons[0].points[1]).toEqual({ logical: 10.5, value: 2.5 });
    expect(polygons[1].points[0]).toEqual({ logical: 10.5, value: 2.5 });
  });
  it("keeps noncrossing and flat clouds as a single bounded polygon", () => {
    expect(
      cloudPolygons({ logical: 1, a: 4, b: 2 }, { logical: 2, a: 5, b: 3 }),
    ).toHaveLength(1);
    expect(
      cloudPolygons({ logical: 1, a: 2, b: 2 }, { logical: 2, a: 2, b: 2 }),
    ).toHaveLength(1);
  });
});

describe("contiguous cloud fills", () => {
  it("joins same-direction segments and excludes collinear empty fills", () => {
    const runs = cloudRuns([
      { logical: 0, a: 3, b: 1 },
      { logical: 1, a: 4, b: 2 },
      { logical: 2, a: 5, b: 3 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].points.map((p) => p.logical)).toEqual([0, 1, 2, 2, 1, 0]);
    expect(
      cloudRuns([
        { logical: 0, a: 3, b: 3 },
        { logical: 1, a: 3, b: 3 },
      ]),
    ).toEqual([]);
  });
  it("keeps crossings and missing trading bars as separate fills", () => {
    const runs = cloudRuns([
      { logical: 0, a: 4, b: 2 },
      { logical: 1, a: 1, b: 3 },
      { logical: 3, a: 4, b: 2 },
      { logical: 4, a: 5, b: 2 },
    ]);
    expect(runs.map((p) => p.bullish)).toEqual([true, false, true]);
    expect(runs[0].points[1]).toEqual({ logical: 0.5, value: 2.5 });
  });
});

describe("fractional cloud coordinates", () => {
  it("interpolates crossings using only integer API calls", () => {
    const calls: number[] = [];
    const coordinate = (index: number) => {
      calls.push(index);
      return Number.isInteger(index) ? index * 10 + 5 : 0;
    };
    expect(logicalCoordinate(80.5, coordinate)).toBe(810);
    expect(calls).toEqual([80, 81]);
    expect(logicalCoordinate(-0.25, coordinate)).toBe(2.5);
    expect(logicalCoordinate(500, coordinate)).toBe(5005);
  });
  it("does not invent coordinates for an empty chart", () => {
    expect(logicalCoordinate(26.5, () => null)).toBeNull();
  });
});
