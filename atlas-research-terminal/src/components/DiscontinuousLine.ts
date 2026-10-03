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
import type { Bar } from "../lib/types";
import type { IndicatorSeries } from "../lib/indicators";

/** Lightweight Charts connects whitespace gaps; draw each trend regime separately. */
export class DiscontinuousLine implements ISeriesPrimitive {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Line" | "Histogram", Time> | null = null;
  private readonly points: { logical: number; value: number }[];
  private readonly views: IPrimitivePaneView[];
  constructor(
    bars: Bar[],
    private output: IndicatorSeries,
  ) {
    const indexes = new Map(bars.map((bar, i) => [bar.time, i]));
    this.points = output.data.flatMap((point) => {
      const index = indexes.get(point.time);
      return index === undefined
        ? []
        : [{ logical: index + (output.offset ?? 0), value: point.value }];
    });
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => this.draw(target),
    };
    this.views = [{ zOrder: () => "normal", renderer: () => renderer }];
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
  private draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    const chart = this.chart,
      series = this.series;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!chart || !series || !range) return;
    target.useMediaCoordinateSpace(({ context }) => {
      context.save();
      context.strokeStyle = this.output.color;
      context.fillStyle = this.output.color;
      context.lineWidth = 2;
      const path = new Path2D();
      let previous: number | null = null;
      for (const point of this.points) {
        if (point.logical < range.from - 1 || point.logical > range.to + 1) {
          previous = null;
          continue;
        }
        const x = chart
            .timeScale()
            .logicalToCoordinate(point.logical as Logical),
          y = series.priceToCoordinate(point.value);
        if (x === null || y === null) {
          previous = null;
          continue;
        }
        if (previous === null || point.logical - previous !== 1) {
          path.moveTo(x, y);
          context.fillRect(x - 1, y - 1, 2, 2);
        } else path.lineTo(x, y);
        previous = point.logical;
      }
      context.stroke(path);
      context.restore();
    });
  }
}
