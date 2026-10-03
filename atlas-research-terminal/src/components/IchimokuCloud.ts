import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import {
  cloudRuns,
  logicalCoordinate,
  type CloudPolygon,
} from "../lib/indicatorProjection";
import type { IndicatorSeries } from "../lib/indicators";
import type { Bar } from "../lib/types";

/** Draw projected spans in logical bar space without adding fictional timestamps. */
export class IchimokuCloud implements ISeriesPrimitive {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Line" | "Histogram", Time> | null = null;
  private readonly spans: { logical: number; value: number }[][];
  private readonly fills: CloudPolygon[];
  private readonly views: IPrimitivePaneView[];

  constructor(
    bars: Bar[],
    private a: IndicatorSeries,
    private b: IndicatorSeries,
  ) {
    const indexes = new Map(bars.map((bar, i) => [bar.time, i]));
    this.spans = [a, b].map((output) =>
      output.data.flatMap((point) => {
        const index = indexes.get(point.time);
        return index === undefined
          ? []
          : [{ logical: index + (output.offset ?? 0), value: point.value }];
      }),
    );
    const second = new Map(
      this.spans[1].map((point) => [point.logical, point.value]),
    );
    const cloud = this.spans[0].flatMap((point) => {
      const value = second.get(point.logical);
      return value === undefined
        ? []
        : [{ logical: point.logical, a: point.value, b: value }];
    });
    this.fills = cloudRuns(cloud);
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => this.draw(target),
    };
    this.views = [{ zOrder: () => "bottom", renderer: () => renderer }];
  }
  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart;
    this.series = series as ISeriesApi<"Line" | "Histogram", Time>;
    requestUpdate();
  }
  detached() {
    this.chart = null;
    this.series = null;
  }
  paneViews() {
    return this.views;
  }
  autoscaleInfo(start: Logical, end: Logical) {
    // Library data bounds end at the final real candle; the visible cloud extends beyond it.
    const visible = this.chart?.timeScale().getVisibleLogicalRange();
    const from = visible?.from ?? start,
      to = visible?.to ?? end;
    let min = Infinity,
      max = -Infinity;
    for (const span of this.spans)
      for (const point of span) {
        if (point.logical >= from - 1 && point.logical <= to + 1) {
          min = Math.min(min, point.value);
          max = Math.max(max, point.value);
        }
      }
    return min === Infinity
      ? null
      : { priceRange: { minValue: min, maxValue: max } };
  }
  private draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    const chart = this.chart,
      series = this.series;
    if (!chart || !series) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const coordinate = (logical: number, value: number) => ({
      x: logicalCoordinate(logical, (index) =>
        chart.timeScale().logicalToCoordinate(index as Logical),
      ),
      y: series.priceToCoordinate(value),
    });
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      const clip = new Path2D();
      clip.rect(0, 0, mediaSize.width, mediaSize.height);
      context.clip(clip);
      for (const polygon of this.fills) {
        // The first half follows Span A; the second half returns along Span B.
        const start = polygon.points[0].logical;
        const end = polygon.points[polygon.points.length / 2 - 1].logical;
        if (end < range.from || start > range.to) continue;
        const points = polygon.points.map((p) =>
          coordinate(p.logical, p.value),
        );
        if (points.some((p) => p.x === null || p.y === null)) continue;
        context.fillStyle = polygon.bullish
          ? "rgba(108,169,152,0.19)"
          : "rgba(204,114,122,0.19)";
        const shape = new Path2D();
        points.forEach((p, index) =>
          index === 0 ? shape.moveTo(p.x!, p.y!) : shape.lineTo(p.x!, p.y!),
        );
        shape.closePath();
        context.fill(shape);
      }
      this.spans.forEach((span, index) => {
        context.strokeStyle = index === 0 ? this.a.color : this.b.color;
        context.lineWidth = 1;
        context.setLineDash([]);
        const boundary = new Path2D();
        let previous: number | null = null;
        for (const point of span) {
          if (point.logical < range.from - 1 || point.logical > range.to + 1) {
            previous = null;
            continue;
          }
          const p = coordinate(point.logical, point.value);
          if (p.x === null || p.y === null) {
            previous = null;
            continue;
          }
          if (previous === null || point.logical - previous !== 1)
            boundary.moveTo(p.x, p.y);
          else boundary.lineTo(p.x, p.y);
          previous = point.logical;
        }
        context.stroke(boundary);
      });
      context.restore();
    });
  }
}
