import type { Bar } from "./types";
import type { IndicatorSeries } from "./indicators";

/** Map offsets onto real trading bars, including markets with overnight gaps. */
export function projectIndicatorData(bars: Bar[], output: IndicatorSeries) {
  const indexes = new Map(bars.map((bar, index) => [bar.time, index]));
  const points = output.data.flatMap((point) => {
    const source = indexes.get(point.time);
    if (source === undefined) return [];
    const target = bars[source + (output.offset ?? 0)];
    return target ? [{ ...point, time: target.time }] : [];
  });
  if (!output.gaps) return points;
  const byTime = new Map(points.map((point) => [point.time, point]));
  return bars.map((bar) => byTime.get(bar.time) ?? { time: bar.time });
}

export interface CloudPoint {
  logical: number;
  a: number;
  b: number;
}
export interface CloudPolygon {
  bullish: boolean;
  points: { logical: number; value: number }[];
}
/** Split crossing cloud segments at their intersection, keeping each fill exact. */
export function cloudPolygons(
  left: CloudPoint,
  right: CloudPoint,
): CloudPolygon[] {
  const polygon = (l: CloudPoint, r: CloudPoint): CloudPolygon => ({
    bullish: (l.a + r.a) / 2 >= (l.b + r.b) / 2,
    points: [
      { logical: l.logical, value: l.a },
      { logical: r.logical, value: r.a },
      { logical: r.logical, value: r.b },
      { logical: l.logical, value: l.b },
    ],
  });
  const d0 = left.a - left.b,
    d1 = right.a - right.b;
  if (d0 * d1 >= 0) return [polygon(left, right)];
  const fraction = d0 / (d0 - d1);
  const value = left.a + fraction * (right.a - left.a);
  const cross = {
    logical: left.logical + fraction * (right.logical - left.logical),
    a: value,
    b: value,
  };
  return [polygon(left, cross), polygon(cross, right)];
}

/** Join neighboring cloud quads into contiguous fills and omit zero-area spans. */
export function cloudRuns(points: CloudPoint[]): CloudPolygon[] {
  const runs: {
    bullish: boolean;
    upper: CloudPolygon["points"];
    lower: CloudPolygon["points"];
  }[] = [];
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1],
      right = points[i];
    if (right.logical - left.logical !== 1) continue;
    for (const polygon of cloudPolygons(left, right)) {
      const [a0, a1, b1, b0] = polygon.points;
      // A collinear fill has no cloud area to shade.
      if (a0.value === b0.value && a1.value === b1.value) continue;
      const previous = runs.at(-1);
      if (
        previous &&
        previous.bullish === polygon.bullish &&
        previous.upper.at(-1)!.logical === a0.logical &&
        previous.upper.at(-1)!.value === a0.value &&
        previous.lower.at(-1)!.value === b0.value
      ) {
        previous.upper.push(a1);
        previous.lower.push(b1);
      } else
        runs.push({
          bullish: polygon.bullish,
          upper: [a0, a1],
          lower: [b0, b1],
        });
    }
  }
  return runs.map((run) => ({
    bullish: run.bullish,
    points: [...run.upper, ...run.lower.reverse()],
  }));
}

/** The chart coordinate API accepts integer indexes; interpolate cloud crossings. */
export function logicalCoordinate(
  logical: number,
  coordinateForBar: (index: number) => number | null,
): number | null {
  const index = Math.floor(logical),
    fraction = logical - index;
  const left = coordinateForBar(index);
  if (left === null || fraction === 0) return left;
  const right = coordinateForBar(index + 1);
  return right === null ? null : left + fraction * (right - left);
}
