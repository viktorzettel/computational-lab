import { describe, expect, it } from "vitest";
import { countdown, segments, weighted } from "./lib";
import type { Position } from "./types";

const row = (
  id: string,
  value: number,
  previousValue: number,
  kind: Position["kind"] = "shares",
): Position => ({
  id,
  value,
  previousValue,
  kind,
  basis: "shares",
  symbol: id,
  issuer: id,
  class: "COM",
  cusip: id,
  quantity: 100,
  previousQuantity: 100,
  status: "unchanged",
  changePercent: 0,
  present: true,
  previousPresent: true,
  comparable: true,
});

describe("portfolio denominators", () => {
  it("keeps option values out of the default share weights", () => {
    const rows = weighted(
      [row("A", 300, 100), row("B", 100, 100), row("A-put", 1000, 2000, "put")],
      "shares",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].weight).toBe(75);
    expect(rows[0].previousWeight).toBe(50);
    expect(rows[0].weightChange).toBe(25);
  });
  it("includes exits in the previous denominator, not the current donut", () => {
    const exit = {
      ...row("EXIT", 0, 100),
      present: false,
      status: "exited" as const,
    };
    const rows = weighted([row("A", 100, 100), exit], "shares");
    expect(rows[0].weightChange).toBe(50);
    expect(rows[1].weightChange).toBe(-50);
    expect(segments(rows)).toHaveLength(1);
  });
  it("never invents a weight change without a prior filing", () => {
    expect(
      weighted([{ ...row("A", 100, 0), comparable: false }], "all")[0]
        .weightChange,
    ).toBeNull();
  });
  it("top ten and other add to the entire allocation", () => {
    const rows = weighted(
      Array.from({ length: 23 }, (_, i) => row(String(i), i + 1, i + 1)),
      "shares",
    );
    const pieces = segments(rows);
    expect(pieces).toHaveLength(11);
    expect(pieces.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(100);
    expect(pieces.at(-1)?.label).toBe("Other 13");
  });
  it("handles an empty option universe", () => {
    expect(weighted([row("A", 100, 100)], "call")).toEqual([]);
    expect(segments([])).toEqual([]);
  });
});

describe("deadline countdown", () => {
  it("uses the timezone offset on the deadline", () => {
    expect(
      countdown(
        "2026-11-16T17:30:00-05:00",
        Date.parse("2026-11-15T22:30:00Z"),
      ),
    ).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0, expired: false });
  });
  it("stops at zero rather than showing negative time", () => {
    expect(
      countdown("2026-11-16T17:30:00-05:00", Date.parse("2026-11-17T22:30:00Z"))
        .expired,
    ).toBe(true);
    expect(
      countdown("2026-11-16T17:30:00-05:00", Date.parse("2026-11-17T22:30:00Z"))
        .days,
    ).toBe(0);
  });
});
