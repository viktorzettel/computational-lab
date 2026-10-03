import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { projectIndicatorData } from "../lib/indicatorProjection";
import { IchimokuCloud } from "./IchimokuCloud";
import { DiscontinuousLine } from "./DiscontinuousLine";
import { INDICATOR_DEFINITIONS } from "../lib/indicators";
import { calculateChartIndicator, isDailyAverage } from "../lib/jordi";
import type { Bar, IndicatorConfig, Timeframe } from "../lib/types";

export interface MarketChartHandle {
  screenshot: () => HTMLCanvasElement | null;
  fit: () => void;
}

interface MarketChartProps {
  bars: Bar[];
  dailyBars: Bar[];
  indicators: IndicatorConfig[];
  chartType: "candles" | "line";
  onCrosshair: (bar: Bar | null) => void;
  timeframe: Timeframe;
  range: "RECENT" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
  fitKey: number;
  autoScale: boolean;
  loading?: boolean;
}

function rangeStart(
  lastTime: number,
  range: MarketChartProps["range"],
): number {
  const date = new Date(lastTime * 1000);
  if (range === "YTD") return Date.UTC(date.getUTCFullYear(), 0, 1) / 1000;
  const months =
    range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime() / 1000;
}

const asTime = (time: number) => time as UTCTimestamp;
const priceFormatFor = (value: number | undefined, minimumPrecision = 2) => {
  const magnitude = Math.abs(value ?? 0);
  const precision =
    magnitude > 0
      ? Math.min(
          12,
          Math.max(minimumPrecision, 2 - Math.floor(Math.log10(magnitude))),
        )
      : minimumPrecision;
  return { type: "price" as const, precision, minMove: 10 ** -precision };
};

/** TradingView Lightweight Charts™
 * Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
 * The chart owns rendering only. All indicator calculations use the supplied bars. */
const MarketChart = forwardRef<MarketChartHandle, MarketChartProps>(
  function MarketChart(
    {
      bars,
      dailyBars,
      indicators,
      chartType,
      onCrosshair,
      timeframe,
      range,
      fitKey,
      autoScale,
      loading = false,
    },
    ref,
  ) {
    const container = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi | null>(null);
    const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const closeLine = useRef<ISeriesApi<"Line"> | null>(null);
    const indicatorSeries = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
    const indicatorPaneIndexes = useRef(new Map<string, number>());
    const paneStretchFactors = useRef(new Map<string, number>());
    const crosshairHandler = useRef(onCrosshair);
    const barByTime = useRef(new Map<number, Bar>());
    const previousFitKey = useRef(fitKey);
    const needsInitialFit = useRef(true);
    crosshairHandler.current = onCrosshair;
    const futureOffset = Math.max(
      0,
      ...indicators
        .filter((i) => i.visible && i.kind === "Ichimoku")
        .map((i) =>
          Math.min(
            200,
            Math.max(1, Math.round(i.parameters.displacement || 26)),
          ),
        ),
    );

    useImperativeHandle(
      ref,
      () => ({
        screenshot: () => chart.current?.takeScreenshot() ?? null,
        fit: () => {
          if (futureOffset && bars.length)
            chart.current
              ?.timeScale()
              .setVisibleLogicalRange({
                from: 0,
                to: bars.length + futureOffset + 3,
              });
          else chart.current?.timeScale().fitContent();
        },
      }),
      [bars.length, futureOffset],
    );

    useLayoutEffect(() => {
      const element = container.current;
      if (!element) return;
      const instance = createChart(element, {
        width: element.clientWidth,
        height: element.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: "#101317" },
          textColor: "#a2adbb",
          fontSize: 13,
          fontFamily:
            "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
          attributionLogo: false,
          panes: {
            separatorColor: "#292e37",
            separatorHoverColor: "#414753",
            enableResize: true,
          },
        },
        grid: {
          vertLines: { color: "#1d2229" },
          horzLines: { color: "#1d2229" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "#68717f",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#303740",
          },
          horzLine: {
            color: "#68717f",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#303740",
          },
        },
        rightPriceScale: {
          borderColor: "#292e37",
          minimumWidth: 82,
          scaleMargins: { top: 0.12, bottom: 0.06 },
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: "#292e37",
          rightOffset: 6,
          barSpacing: 6,
          minBarSpacing: 0.5,
          fixLeftEdge: false,
          fixRightEdge: false,
          lockVisibleTimeRangeOnResize: true,
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
        },
        localization: { locale: "en-US" },
      });
      chart.current = instance;
      candles.current = instance.addSeries(CandlestickSeries, {
        upColor: "#6ca998",
        downColor: "#cc727a",
        wickUpColor: "#6ca998",
        wickDownColor: "#cc727a",
        borderVisible: false,
        priceLineColor: "#889393",
        priceLineStyle: LineStyle.Dashed,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      closeLine.current = instance.addSeries(LineSeries, {
        color: "#a698d1",
        lineWidth: 2,
        visible: false,
        priceLineStyle: LineStyle.Dashed,
        crosshairMarkerRadius: 3,
      });
      instance.panes()[0].setStretchFactor(8);
      instance.subscribeCrosshairMove((event) => {
        const time = typeof event.time === "number" ? event.time : null;
        crosshairHandler.current(
          time !== null ? (barByTime.current.get(time) ?? null) : null,
        );
      });
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const viewport = instance.timeScale().getVisibleLogicalRange();
          // Repaint synchronously so the range is restored against the new width.
          instance.resize(Math.floor(width), Math.floor(height), true);
          if (viewport) instance.timeScale().setVisibleLogicalRange(viewport);
        }
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
        instance.remove();
        chart.current = null;
        candles.current = null;
        closeLine.current = null;
        indicatorSeries.current = [];
        indicatorPaneIndexes.current.clear();
        paneStretchFactors.current.clear();
      };
    }, []);

    useLayoutEffect(() => {
      barByTime.current = new Map(bars.map((bar) => [bar.time, bar]));
      const priceFormat = priceFormatFor(bars.at(-1)?.close);
      candles.current?.applyOptions({ priceFormat });
      closeLine.current?.applyOptions({ priceFormat });
      candles.current?.setData(
        bars.map((bar) => ({
          time: asTime(bar.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      );
      closeLine.current?.setData(
        bars.map((bar) => ({ time: asTime(bar.time), value: bar.close })),
      );
    }, [bars]);

    useLayoutEffect(() => {
      candles.current?.applyOptions({ visible: chartType === "candles" });
      closeLine.current?.applyOptions({ visible: chartType === "line" });
    }, [chartType]);

    useLayoutEffect(() => {
      const instance = chart.current;
      if (!instance) return;
      const viewport = instance.timeScale().getVisibleLogicalRange();
      const originalPanes = instance.panes();
      const priceStretchFactor = originalPanes[0]?.getStretchFactor();
      // Capture all original indexes before removing any series collapses pane indexes.
      for (const [id, paneIndex] of indicatorPaneIndexes.current) {
        const pane = originalPanes[paneIndex];
        if (pane) paneStretchFactors.current.set(id, pane.getStretchFactor());
      }
      const currentIds = new Set(indicators.map((config) => config.id));
      for (const id of paneStretchFactors.current.keys()) {
        if (!currentIds.has(id)) paneStretchFactors.current.delete(id);
      }
      indicatorPaneIndexes.current.clear();
      // Keep the price series alive; removing an oscillator's last series removes its pane.
      for (const series of indicatorSeries.current)
        instance.removeSeries(series);
      indicatorSeries.current = [];
      let nextPane = 1;
      for (const config of indicators) {
        if (!config.visible) continue;
        const definition = INDICATOR_DEFINITIONS.find(
          (item) => item.kind === config.kind,
        );
        if (!definition) continue;
        const paneIndex = definition.pane === "overlay" ? 0 : nextPane++;
        const outputs = calculateChartIndicator(
          bars,
          dailyBars,
          timeframe,
          config,
        );
        for (const output of outputs) {
          const cloudSpan =
            config.kind === "Ichimoku" &&
            ["span-a", "span-b"].includes(output.key);
          const common = {
            color: output.color,
            title: definition.pane === "overlay" ? "" : output.name,
            priceLineVisible: false,
            lastValueVisible:
              !cloudSpan &&
              (definition.pane !== "overlay" || isDailyAverage(config)),
          };
          const data = projectIndicatorData(bars, output).map((point) => ({
            ...point,
            time: asTime(point.time),
          }));
          let series: ISeriesApi<"Line" | "Histogram", Time>;
          if (output.type === "histogram") {
            const histogram = instance.addSeries(
              HistogramSeries,
              {
                ...common,
                priceFormat:
                  definition.format === "volume"
                    ? { type: "volume" }
                    : priceFormatFor(output.data.at(-1)?.value, 3),
              },
              paneIndex,
            );
            histogram.setData(data);
            series = histogram;
          } else {
            const indicatorLine = instance.addSeries(
              LineSeries,
              {
                ...common,
                lineWidth: isDailyAverage(config) ? 2 : 1,
                crosshairMarkerRadius: 2,
                lineVisible: !cloudSpan && !output.gaps,
                crosshairMarkerVisible: !cloudSpan,
                // Each up/down Supertrend line must stop at a regime switch.
                ...(output.gaps ? { pointMarkersVisible: false } : {}),
                lineStyle: output.dashed ? LineStyle.Dashed : LineStyle.Solid,
                priceFormat:
                  definition.format === "volume"
                    ? { type: "volume" }
                    : priceFormatFor(
                        output.data.at(-1)?.value,
                        config.kind === "CMF" ? 3 : 2,
                      ),
                ...(definition.bounds
                  ? {
                      autoscaleInfoProvider: () => ({
                        priceRange: {
                          minValue: definition.bounds![0],
                          maxValue: definition.bounds![1],
                        },
                      }),
                    }
                  : {}),
              },
              paneIndex,
            );
            indicatorLine.setData(data);
            series = indicatorLine;
          }
          for (const reference of output.referenceLines ?? []) {
            series.createPriceLine({
              price: reference.value,
              color: "#454d5a",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: false,
              title: reference.label,
            });
          }
          if (output.gaps)
            series.attachPrimitive(new DiscontinuousLine(bars, output));
          if (config.kind === "Ichimoku" && output.key === "conversion") {
            const first = outputs.find((item) => item.key === "span-a");
            const second = outputs.find((item) => item.key === "span-b");
            // Use an undisplaced line as the coordinate anchor, even if all spans lie in future space.
            if (first && second)
              series.attachPrimitive(new IchimokuCloud(bars, first, second));
          }
          indicatorSeries.current.push(series);
        }
        if (paneIndex > 0) {
          indicatorPaneIndexes.current.set(config.id, paneIndex);
          instance
            .panes()
            [paneIndex].setStretchFactor(
              paneStretchFactors.current.get(config.id) ??
                (definition.pane === "volume" ? 1.25 : 1.2),
            );
          instance
            .panes()
            [paneIndex].priceScale("right")
            .applyOptions({ scaleMargins: { top: 0.2, bottom: 0.1 } });
        }
      }
      // Separator drags resize the price pane too; preserve its current weight.
      if (priceStretchFactor !== undefined)
        instance.panes()[0].setStretchFactor(priceStretchFactor);
      if (viewport) instance.timeScale().setVisibleLogicalRange(viewport);
    }, [indicators, bars, dailyBars, timeframe]);

    useLayoutEffect(() => {
      const instance = chart.current;
      if (!instance) return;
      instance.applyOptions({
        timeScale: { timeVisible: !["1D", "1W"].includes(timeframe) },
      });
      if (!bars.length) return;
      if (range === "RECENT") {
        instance.timeScale().setVisibleLogicalRange({
          from: Math.max(0, bars.length - 90),
          to: bars.length + futureOffset + 3,
        });
        return;
      }
      if (range === "ALL") {
        instance
          .timeScale()
          .setVisibleLogicalRange({
            from: 0,
            to: bars.length + futureOffset + 3,
          });
        return;
      }
      const from = Math.max(
        bars[0].time,
        rangeStart(bars[bars.length - 1].time, range),
      );
      const to = bars[bars.length - 1].time;
      if (futureOffset) {
        const firstIndex = bars.findIndex((bar) => bar.time >= from);
        // Range setters paint asynchronously; derive both endpoints directly from real bars.
        instance
          .timeScale()
          .setVisibleLogicalRange({
            from: Math.max(0, firstIndex),
            to: bars.length + futureOffset + 3,
          });
      } else if (from < to)
        instance
          .timeScale()
          .setVisibleRange({ from: asTime(from), to: asTime(to) });
      else instance.timeScale().fitContent();
    }, [bars, timeframe, range, fitKey, futureOffset]);

    useLayoutEffect(() => {
      const instance = chart.current;
      if (!instance) return;
      const priceScale = instance.panes()[0].priceScale("right");
      const reset = previousFitKey.current !== fitKey;
      previousFitKey.current = fitKey;
      instance.applyOptions({
        handleScale: {
          axisPressedMouseMove: { price: !autoScale },
          axisDoubleClickReset: { price: false },
        },
      });
      if (!bars.length) {
        // Seed a useful range when the next asset loads, even in manual mode.
        needsInitialFit.current = true;
        priceScale.setAutoScale(true);
        return;
      }
      if (
        autoScale ||
        reset ||
        needsInitialFit.current ||
        !priceScale.getVisibleRange()
      ) {
        priceScale.setAutoScale(true);
        // Paint pending time-range changes before freezing the initial/reset range.
        const element = container.current;
        if (element && !autoScale)
          instance.resize(element.clientWidth, element.clientHeight, true);
      }
      needsInitialFit.current = false;
      priceScale.setAutoScale(autoScale);
    }, [autoScale, bars, fitKey]);

    return (
      <div
        className="market-chart"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
        }}
      >
        <div
          ref={container}
          style={{ position: "absolute", inset: 0 }}
          aria-label={`Interactive market price chart. Drag to pan; scroll to zoom. ${autoScale ? "Price scale adjusts automatically." : "Manual price scale: drag the right price axis to adjust."}`}
        />
        {!bars.length && (
          <div
            className="chart-empty"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              color: "#78818f",
              fontSize: 12,
            }}
          >
            {loading
              ? "Loading market history…"
              : "Open an asset to explore its chart"}
          </div>
        )}
        {loading && bars.length > 0 && (
          <div
            className="chart-loading"
            role="status"
            style={{
              position: "absolute",
              top: 12,
              right: 82,
              color: "#9aa4b3",
              fontSize: 11,
              pointerEvents: "none",
            }}
          >
            Updating…
          </div>
        )}
      </div>
    );
  },
);

export default MarketChart;
