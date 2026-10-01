import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CandlestickChart,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import MarketChart from "./components/MarketChart";
import Modal from "./components/Modal";
import SymbolSearch from "./components/SymbolSearch";
import WatchlistPanel from "./components/WatchlistPanel";
import IndicatorPicker from "./components/IndicatorPicker";
import ReturnsPanel from "./components/ReturnsPanel";
import BreadthDialog from "./components/BreadthDialog";
import { dailyBreadth } from "./lib/breadth";
import {
  averagePosition,
  averageTrend,
  dailyBarsForChart,
  isDailyAverage,
  jordiApplied,
  toggleJordi,
} from "./lib/jordi";
import { candleReturn } from "./lib/returns";
import { api } from "./lib/api";
import {
  assetFor,
  compact,
  displaySymbol,
  formatPercent,
  formatPrice,
} from "./lib/assets";
import { INDICATOR_DEFINITIONS, calculateIndicator } from "./lib/indicators";
import { downloadFile, useLocalState } from "./lib/storage";
import type {
  Asset,
  Bar,
  HistoryResponse,
  IndicatorConfig,
  IndicatorKind,
  Layout,
  Quote,
  Timeframe,
  Watchlist,
} from "./lib/types";

const DEFAULT_WATCHLISTS: Watchlist[] = [
  {
    id: "core",
    name: "Core portfolio",
    symbols: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "MU", "MRVL"],
  },
  {
    id: "crypto",
    name: "Crypto markets",
    symbols: ["BTC-USD", "ETH-USD", "SOL-USD"],
  },
  {
    id: "macro",
    name: "Indices & ETFs",
    symbols: ["^GSPC", "^IXIC", "^DJI", "SPY", "QQQ", "IWM"],
  },
];
const DEFAULT_INDICATORS: IndicatorConfig[] = [
  {
    id: "ema20",
    kind: "EMA",
    parameters: { period: 20 },
    color: "#b29bd8",
    visible: true,
  },
  {
    id: "ema50",
    kind: "EMA",
    parameters: { period: 50 },
    color: "#dbb976",
    visible: true,
  },
  {
    id: "volume",
    kind: "Volume",
    parameters: {},
    color: "#639c91",
    visible: true,
  },
  {
    id: "rsi",
    kind: "RSI",
    parameters: { period: 14 },
    color: "#a89ad2",
    visible: true,
  },
];
const COLORS = [
  "#b29bd8",
  "#dbb976",
  "#73b8bc",
  "#d78e9d",
  "#a4c881",
  "#8fa9df",
];
const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
const indicatorLabel = (i: IndicatorConfig) =>
  i.basis === "daily"
    ? `SMA ${i.parameters.period}D`
    : `${i.kind === "BB" ? "Bollinger Bands" : i.kind}${i.parameters.period ? ` ${i.parameters.period}` : i.kind === "MACD" ? ` ${i.parameters.fast}, ${i.parameters.slow}, ${i.parameters.signal}` : ""}`;
const validIndicators = (v: unknown): v is IndicatorConfig[] =>
  Array.isArray(v) &&
  v.every(
    (i) =>
      i &&
      typeof i.id === "string" &&
      ["SMA", "EMA", "RSI", "MACD", "BB", "ATR", "VWAP", "Volume"].includes(
        i.kind,
      ) &&
      typeof i.color === "string" &&
      typeof i.visible === "boolean" &&
      (i.basis === undefined || (i.basis === "daily" && i.kind === "SMA")) &&
      i.parameters !== null &&
      typeof i.parameters === "object" &&
      !Array.isArray(i.parameters) &&
      Object.values(i.parameters).every(
        (p) => typeof p === "number" && Number.isFinite(p) && p > 0,
      ),
  );
const validLayouts = (v: unknown): v is Layout[] =>
  Array.isArray(v) &&
  v.every(
    (l) =>
      l &&
      typeof l.id === "string" &&
      typeof l.name === "string" &&
      typeof l.symbol === "string" &&
      TIMEFRAMES.includes(l.timeframe) &&
      (l.chartType === "candles" || l.chartType === "line") &&
      validIndicators(l.indicators),
  );
type Dialog =
  | "search"
  | "add-symbol"
  | "indicators"
  | "create-list"
  | "rename-list"
  | "save-layout"
  | "layouts"
  | "sources"
  | "settings"
  | "help"
  | "research"
  | "breadth"
  | null;
type ShelfTab = "overview" | "returns" | "indicators" | "notes";

function App() {
  const [watchlists, setWatchlists] = useLocalState(
    "watchlists",
    DEFAULT_WATCHLISTS,
    (v) =>
      Array.isArray(v) &&
      v.length > 0 &&
      v.every(
        (l) =>
          l &&
          typeof l.id === "string" &&
          typeof l.name === "string" &&
          Array.isArray(l.symbols) &&
          l.symbols.every((s: unknown) => typeof s === "string"),
      ),
  );
  const [activeId, setActiveId] = useLocalState(
    "active-watchlist",
    "core",
    (v) => typeof v === "string",
  );
  const [symbol, setSymbol] = useLocalState(
    "symbol",
    "NVDA",
    (v) => typeof v === "string" && v.length > 0,
  );
  const [timeframe, setTimeframe] = useLocalState<Timeframe>(
    "timeframe",
    "1D",
    (v) => TIMEFRAMES.includes(v as Timeframe),
  );
  const [indicators, setIndicators] = useLocalState(
    "indicators",
    DEFAULT_INDICATORS,
    validIndicators,
  );
  const [chartType, setChartType] = useLocalState<"candles" | "line">(
    "chart-type",
    "candles",
    (v) => v === "candles" || v === "line",
  );
  const [layouts, setLayouts] = useLocalState<Layout[]>(
    "layouts",
    [],
    validLayouts,
  );
  const [notes, setNotes] = useLocalState<Record<string, string>>(
    "notes",
    {},
    (v) =>
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v).every((n) => typeof n === "string"),
  );
  const [settings, setSettings] = useLocalState(
    "settings",
    { quoteInterval: 60, compactRows: false },
    (v) =>
      v !== null &&
      typeof v === "object" &&
      [30, 60, 120, 300].includes(
        (v as { quoteInterval: number }).quoteInterval,
      ),
  );
  const [asset, setAsset] = useState<Asset>(assetFor(symbol));
  const [supported, setSupported] = useState<Timeframe[]>([
    "1m",
    "5m",
    "15m",
    "1h",
    "1D",
    "1W",
  ]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [dataMode, setDataMode] = useState("live");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [risingLookback, setRisingLookback] = useLocalState(
    "breadth-rising-lookback",
    1,
    (v) => [1, 5, 20].includes(v as number),
  );
  const [dailyHistory, setDailyHistory] = useState<HistoryResponse | null>(
    null,
  );
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [dailyRetry, setDailyRetry] = useState(0);
  const [shelfTab, setShelfTab] = useState<ShelfTab>("overview");
  const [shelfCollapsed, setShelfCollapsed] = useLocalState(
    "shelf-collapsed",
    true,
    (v) => typeof v === "boolean",
  );
  const openShelf = (tab: ShelfTab) => {
    setShelfTab(tab);
    setShelfCollapsed(false);
    setFullscreen(false);
  };
  const [hovered, setHovered] = useState<Bar | null>(null);
  const [range, setRange] = useState<
    "RECENT" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL"
  >("RECENT");
  const [fitKey, setFitKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [layoutName, setLayoutName] = useLocalState(
    "layout-name",
    "Market overview",
    (v) => typeof v === "string",
  );
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");
  const [chartMenu, setChartMenu] = useState(false);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [autoScale, setAutoScale] = useLocalState(
    "auto-scale",
    true,
    (value) => typeof value === "boolean",
  );
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const [now, setNow] = useState(new Date());
  const loadGeneration = useRef(0);
  const selectedKey = useRef(`${symbol}:${timeframe}`);
  selectedKey.current = `${symbol}:${timeframe}`;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDialog = useCallback(() => {
    setDialog(null);
    setFormError("");
  }, []);
  const notify = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const activeList = watchlists.find((l) => l.id === activeId) || watchlists[0];
  const currentHistory =
    history?.symbol === symbol && history.timeframe === timeframe
      ? history
      : null;
  const bars = currentHistory?.bars || [];
  const lastBar = bars[bars.length - 1];
  const shownBar = hovered || lastBar;
  const barReturn = candleReturn(bars, shownBar?.time);
  const quote = quotes[symbol];
  const currentPrice = quote?.price ?? lastBar?.close;
  const demo = currentHistory?.source === "demo";
  const demoQuote = quote?.source === "demo";
  const anyDemo = [...activeList.symbols, symbol].some(
    (s) => quotes[s]?.source === "demo",
  );
  const enabledIndicators = indicators.filter((i) => i.visible);
  const selectedInList = activeList.symbols.includes(symbol);
  const jordiActive = jordiApplied(indicators);
  const needsDailyHistory = enabledIndicators.some(isDailyAverage);
  const dailyLookback =
    timeframe === "1W" && bars.length
      ? Math.min(
          10,
          Math.ceil((Date.now() / 1000 - bars[0].time) / (365.25 * 86400)) + 1,
        )
      : undefined;
  const matchingDailyHistory =
    timeframe === "1D"
      ? currentHistory
      : dailyHistory?.symbol === symbol
        ? dailyHistory
        : null;
  const sameDailySource =
    matchingDailyHistory?.source === currentHistory?.source;
  const dailyBars = useMemo(
    () =>
      matchingDailyHistory && sameDailySource
        ? dailyBarsForChart(matchingDailyHistory.bars, bars, timeframe)
        : [],
    [matchingDailyHistory, sameDailySource, currentHistory, timeframe],
  );
  const dailyStatus = useMemo(
    () => dailyBreadth(dailyBars, risingLookback),
    [dailyBars, risingLookback],
  );
  const dailyNotice =
    dailyError ||
    (dailyLoading && timeframe !== "1D"
      ? "Loading daily averages…"
      : matchingDailyHistory && !sameDailySource
        ? "Daily averages unavailable: chart and daily data sources differ."
        : matchingDailyHistory?.warning || "");
  useEffect(() => {
    if (
      !needsDailyHistory ||
      timeframe === "1D" ||
      !currentHistory?.bars.length
    ) {
      setDailyLoading(false);
      setDailyError("");
      return;
    }
    const controller = new AbortController();
    setDailyHistory(null);
    setDailyError("");
    setDailyLoading(true);
    api
      .history(symbol, "1D", controller.signal, dailyRetry > 0, dailyLookback)
      .then((response) => {
        if (!controller.signal.aborted) setDailyHistory(response);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setDailyError(
            reason instanceof Error
              ? reason.message
              : "Daily history unavailable",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDailyLoading(false);
      });
    return () => controller.abort();
  }, [
    symbol,
    timeframe,
    needsDailyHistory,
    dailyLookback,
    currentHistory,
    dailyRetry,
  ]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog("search");
      }
      if (e.key === "Escape") setFullscreen(false);
    };
    const storageError = () =>
      notify(
        "Browser storage is full. Export your watchlists to keep a backup.",
      );
    document.addEventListener("keydown", key);
    window.addEventListener("atlas-storage-error", storageError);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("atlas-storage-error", storageError);
      clearInterval(timer);
    };
  }, [notify]);
  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then((h) => {
        setHealthy(true);
        setDataMode(h.mode);
      })
      .catch(() => setHealthy(false));
    return () => controller.abort();
  }, [quoteNonce]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    setHovered(null);
    setAsset(assetFor(symbol));
    (async () => {
      const metadata = await api.asset(symbol, controller.signal);
      if (controller.signal.aborted || generation !== loadGeneration.current)
        return;
      setAsset(metadata);
      setSupported(metadata.supported_timeframes);
      if (!metadata.supported_timeframes.includes(timeframe)) {
        setTimeframe(
          metadata.supported_timeframes.includes("1D")
            ? "1D"
            : metadata.supported_timeframes[0],
        );
        return;
      }
      const data = await api.history(symbol, timeframe, controller.signal);
      if (!controller.signal.aborted && generation === loadGeneration.current) {
        setHistory(data);
        setSupported(data.supported_timeframes);
        setHealthy(true);
      }
    })()
      .catch((e) => {
        if (e.name !== "AbortError" && generation === loadGeneration.current) {
          setError(e.message || "Unable to load chart data.");
          setHealthy(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === loadGeneration.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, timeframe, setTimeframe]);
  const quoteSymbols = useMemo(
    () => [...new Set([symbol, ...[...activeList.symbols].sort()])].join(","),
    [activeList.symbols, symbol],
  );
  useEffect(() => {
    const controller = new AbortController();
    let updating = false;
    const update = async () => {
      if (updating) return;
      updating = true;
      let failed = false;
      const symbols = quoteSymbols.split(",");
      try {
        // Bound each request's URL and provider work; the list itself has no size cap.
        for (
          let offset = 0;
          offset < symbols.length && !controller.signal.aborted;
          offset += 25
        ) {
          try {
            const { quotes: items, errors } = await api.quotes(
              symbols.slice(offset, offset + 25),
              controller.signal,
            );
            if (controller.signal.aborted) return;
            setQuotes((old) => ({
              ...old,
              ...Object.fromEntries(items.map((q) => [q.symbol, q])),
            }));
            if (errors?.length) failed = true;
          } catch (e) {
            if (controller.signal.aborted) return;
            failed = true;
          }
        }
      } finally {
        updating = false;
        if (!controller.signal.aborted) setQuoteError(failed);
      }
    };
    void update();
    const timer = setInterval(() => {
      if (!document.hidden) void update();
    }, settings.quoteInterval * 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [quoteSymbols, settings.quoteInterval, quoteNonce]);
  const onCrosshair = useCallback((bar: Bar | null) => setHovered(bar), []);
  const selectAsset = (a: Asset) => {
    setAsset(a);
    setSymbol(a.symbol);
    setHovered(null);
    closeDialog();
  };
  const editList = (edit: (list: Watchlist) => Watchlist) =>
    setWatchlists((old) =>
      old.map((l) => (l.id === activeList.id ? edit(l) : l)),
    );
  const toggleAsset = (s: string) =>
    editList((l) => ({
      ...l,
      symbols: l.symbols.includes(s)
        ? l.symbols.filter((x) => x !== s)
        : [...l.symbols, s],
    }));
  const removeSymbol = (s: string) => {
    const previous = activeList.symbols;
    editList((l) => ({ ...l, symbols: l.symbols.filter((x) => x !== s) }));
    notify(`${displaySymbol(s)} removed from ${activeList.name}.`, () =>
      setWatchlists((old) =>
        old.map((l) =>
          l.id === activeList.id ? { ...l, symbols: previous } : l,
        ),
      ),
    );
  };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= activeList.symbols.length) return;
    editList((l) => {
      const symbols = [...l.symbols];
      const [moved] = symbols.splice(from, 1);
      symbols.splice(to, 0, moved);
      return { ...l, symbols };
    });
  };
  const addIndicator = (kind: IndicatorKind) => {
    const def = INDICATOR_DEFINITIONS.find((d) => d.kind === kind)!;
    setIndicators((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        kind,
        parameters: { ...def.defaults },
        color: COLORS[old.length % COLORS.length],
        visible: true,
      },
    ]);
    notify(`${def.name} added. Edit its parameters in the Indicators tab.`);
  };
  const removeIndicator = (id: string) =>
    setIndicators((old) => old.filter((i) => i.id !== id));
  const updateIndicator = (id: string, patch: Partial<IndicatorConfig>) =>
    setIndicators((old) =>
      old.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const openForm = (type: Dialog, name = "") => {
    setFormName(name);
    setFormError("");
    setDialog(type);
  };
  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) {
      setFormError("Enter a name to continue.");
      return;
    }
    if (dialog === "create-list") {
      const id = crypto.randomUUID();
      setWatchlists((old) => [...old, { id, name, symbols: [] }]);
      setActiveId(id);
      notify(`Watchlist “${name}” created.`);
    } else if (dialog === "rename-list") {
      editList((l) => ({ ...l, name }));
      notify("Watchlist renamed.");
    } else if (dialog === "save-layout") {
      setLayouts((old) => [
        ...old,
        {
          id: crypto.randomUUID(),
          name,
          symbol,
          timeframe,
          indicators: structuredClone(indicators),
          chartType,
        },
      ]);
      setLayoutName(name);
      notify("Layout saved locally.");
    }
    closeDialog();
  };
  const restoreLayout = (layout: Layout) => {
    setSymbol(layout.symbol);
    setTimeframe(layout.timeframe);
    setIndicators(structuredClone(layout.indicators));
    setChartType(layout.chartType);
    setLayoutName(layout.name);
    closeDialog();
    notify(`Layout “${layout.name}” loaded.`);
  };
  const deleteList = () => {
    if (watchlists.length === 1) return;
    const previous = watchlists;
    setWatchlists(watchlists.filter((l) => l.id !== activeList.id));
    setActiveId(watchlists.find((l) => l.id !== activeList.id)!.id);
    notify(`“${activeList.name}” deleted.`, () => {
      setWatchlists(previous);
      setActiveId(activeList.id);
    });
  };
  const exportHistory = () => {
    if (!bars.length) {
      notify("Load chart data before exporting.");
      return;
    }
    downloadFile(
      `${symbol}_${timeframe}_${currentHistory?.source}.csv`,
      [
        "timestamp,open,high,low,close,volume",
        ...bars.map(
          (b) =>
            `${new Date(b.time * 1000).toISOString()},${b.open},${b.high},${b.low},${b.close},${b.volume}`,
        ),
      ].join("\n"),
      "text/csv",
    );
    setChartMenu(false);
    notify("OHLCV data exported.");
  };
  const refresh = async () => {
    const key = `${symbol}:${timeframe}`;
    const generation = ++loadGeneration.current;
    setQuoteNonce((n) => n + 1);
    setLoading(true);
    setError("");
    setChartMenu(false);
    try {
      const data = await api.history(symbol, timeframe, undefined, true);
      if (selectedKey.current !== key || generation !== loadGeneration.current)
        return;
      setHistory(data);
      setHealthy(true);
      notify("Chart and quotes refreshed.");
    } catch (e) {
      if (selectedKey.current === key && generation === loadGeneration.current)
        setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      if (selectedKey.current === key && generation === loadGeneration.current)
        setLoading(false);
    }
  };
  const metrics = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const returns = closes
      .slice(1)
      .map((value, index) => Math.log(value / closes[index]));
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const volatility =
      Math.sqrt(
        returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length,
      ) * 100;
    const recent = bars.slice(-20);
    return {
      volatility,
      volume: recent.reduce((sum, b) => sum + b.volume, 0) / recent.length,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      ema: calculateIndicator(bars, {
        id: "metric-ema",
        kind: "EMA",
        parameters: { period: 50 },
        color: "#b29bd8",
        visible: true,
      }),
    };
  }, [bars]);
  const latestRsi = useMemo(() => {
    if (!bars.length) return undefined;
    const series = calculateIndicator(bars, {
      id: "metric-rsi",
      kind: "RSI",
      parameters: { period: 14 },
      color: "#a89ad2",
      visible: true,
    });
    const points = series[0]?.data;
    return points?.[points.length - 1]?.value;
  }, [bars]);

  return (
    <div
      className={`app-shell ${fullscreen ? "chart-expanded" : ""} ${!shelfCollapsed && !fullscreen ? "shelf-open" : ""}`}
    >
      <main className="terminal-grid">
        <WatchlistPanel
          lists={watchlists}
          activeId={activeList.id}
          selected={symbol}
          quotes={quotes}
          compactRows={settings.compactRows}
          onActive={setActiveId}
          onSelect={(s) => selectAsset(assetFor(s))}
          onAdd={() => setDialog("add-symbol")}
          onCreate={() => openForm("create-list")}
          onRename={() => openForm("rename-list", activeList.name)}
          onDelete={deleteList}
          onRemove={removeSymbol}
          onReorder={reorder}
          onExport={() => {
            downloadFile(
              "atlas-watchlists.json",
              JSON.stringify(watchlists, null, 2),
              "application/json",
            );
            notify("Watchlists exported.");
          }}
          onSources={() => setDialog("sources")}
          onBreadth={() => setDialog("breadth")}
          jordiActive={jordiActive}
          onJordi={() => {
            setIndicators(toggleJordi);
            notify(
              jordiActive
                ? "Jordi averages hidden."
                : `Only 50-day and 200-day averages shown on ${displaySymbol(symbol)}.`,
            );
          }}
        />
        <section className="research-workspace">
          <div className="asset-header">
            <div className="asset-title-area">
              <div className="asset-title">
                <span className={`selected-asset-logo ${asset.type}`}>
                  {asset.type === "crypto" ? (
                    symbol.startsWith("BTC") ? (
                      "₿"
                    ) : symbol.startsWith("ETH") ? (
                      "Ξ"
                    ) : (
                      displaySymbol(symbol).slice(0, 1)
                    )
                  ) : (
                    <ChartNoAxesCombined size={23} />
                  )}
                </span>
                <button
                  className="symbol-picker"
                  onClick={() => setDialog("search")}
                >
                  <h1>{displaySymbol(symbol)}</h1>
                  <ChevronDown size={15} />
                </button>
                <span className="asset-description">{asset.name}</span>
                <span className="asset-exchange">{asset.exchange}</span>
                <button
                  className={`icon-button favorite ${selectedInList ? "is-favorite" : ""}`}
                  onClick={() => toggleAsset(symbol)}
                  title={
                    selectedInList
                      ? "Remove from current watchlist"
                      : "Add to current watchlist"
                  }
                  aria-label={
                    selectedInList
                      ? "Remove from current watchlist"
                      : "Add to current watchlist"
                  }
                >
                  <Star
                    size={16}
                    fill={selectedInList ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <div className="asset-price-line">
                <strong>{formatPrice(currentPrice)}</strong>
                <span
                  className={`price-change ${quote && quote.change_percent >= 0 ? "positive" : "negative"}`}
                >
                  {quote
                    ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2)
                    : "—"}{" "}
                  <span>({formatPercent(quote?.change_percent)})</span>
                </span>
                <span className="quote-currency">{asset.currency}</span>
                {demoQuote && <span className="price-sample-tag">SAMPLE</span>}
                <span
                  className="session-status"
                  title={
                    quote
                      ? `${quote.warning || quote.source} · ${new Date(quote.timestamp * 1000).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
                      : ""
                  }
                >
                  <span
                    className={`status-dot ${demoQuote || (!quote && demo) ? "sample" : ""}`}
                  />
                  {demoQuote || (!quote && demo)
                    ? "Sample quote"
                    : quote?.warning?.match(/cached|stale/i)
                      ? "Cached quote"
                      : quote?.market_state === "REGULAR"
                        ? "Market open"
                        : asset.type === "crypto"
                          ? "24 / 7 market"
                          : "Delayed quote"}
                </span>
              </div>
            </div>
            <div className="asset-header-actions">
              <button
                className="global-search"
                aria-label="Search markets"
                onClick={() => setDialog("search")}
              >
                <Search size={15} />
                <span>Search markets</span>
                <kbd>⌘ K</kbd>
              </button>
              <div className="popover-parent">
                <button
                  className="icon-button workspace-menu-button"
                  aria-label="Workspace menu"
                  aria-expanded={workspaceMenu}
                  aria-haspopup="true"
                  title="Workspace menu"
                  onClick={() => setWorkspaceMenu(!workspaceMenu)}
                >
                  <Settings2 size={19} />
                </button>
                {workspaceMenu && (
                  <>
                    <div
                      className="popover-dismiss"
                      onClick={() => setWorkspaceMenu(false)}
                    />
                    <div
                      className="popover workspace-menu"
                      onClick={() => setWorkspaceMenu(false)}
                    >
                      <div className="workspace-menu-label">
                        Atlas workspace
                      </div>
                      <button onClick={() => openShelf("overview")}>
                        <LayoutDashboard size={16} /> Terminal overview
                      </button>
                      <button onClick={() => setDialog("research")}>
                        <Activity size={16} /> Research
                      </button>
                      <button onClick={() => setDialog("sources")}>
                        <Database size={16} /> Data sources
                      </button>
                      <div className="menu-divider" />
                      <button onClick={() => setDialog("layouts")}>
                        <FolderOpen size={16} /> Saved layouts
                      </button>
                      <button
                        onClick={() => openForm("save-layout", layoutName)}
                      >
                        <Save size={16} /> Save current layout
                      </button>
                      <div className="menu-divider" />
                      <button onClick={() => setDialog("settings")}>
                        <Settings2 size={16} /> Workspace settings
                      </button>
                      <button onClick={() => setDialog("help")}>
                        <CircleHelp size={16} /> Help and shortcuts
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="chart-toolbar">
            <div className="timeframe-group" aria-label="Chart timeframe">
              {TIMEFRAMES.filter((tf) => supported.includes(tf)).map((tf) => (
                <button
                  key={tf}
                  className={timeframe === tf ? "active" : ""}
                  title={`${tf} candles`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            <span className="toolbar-divider" />
            <button
              className="chart-type-button"
              onClick={() =>
                setChartType(chartType === "candles" ? "line" : "candles")
              }
              title="Switch between candles and line"
              aria-label="Switch chart type"
            >
              {chartType === "candles" ? (
                <CandlestickChart size={17} />
              ) : (
                <TrendingUp size={17} />
              )}
              <span>{chartType === "candles" ? "Candles" : "Line"}</span>
              <ChevronDown size={11} />
            </button>
            <span className="toolbar-divider" />
            <button
              className="indicators-button"
              onClick={() => setDialog("indicators")}
            >
              <SlidersHorizontal size={15} />
              Indicators<span>{indicators.length}</span>
            </button>
            <div className="chart-toolbar-right">
              <button
                className={`auto-scale-button ${autoScale ? "is-active" : ""}`}
                aria-label="Auto scale"
                aria-pressed={autoScale}
                title={
                  autoScale
                    ? "Turn off automatic price scaling"
                    : "Manual scale: drag the right price axis. Click to enable auto scale."
                }
                onClick={() => setAutoScale(!autoScale)}
              >
                <span className="auto-scale-dot" /> Auto scale
              </button>
              <button
                className="icon-button"
                title="Reset chart view"
                aria-label="Reset chart view"
                onClick={() => {
                  setRange("RECENT");
                  setFitKey((n) => n + 1);
                }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="icon-button"
                title={fullscreen ? "Exit chart focus" : "Focus on chart"}
                aria-label={fullscreen ? "Exit chart focus" : "Focus on chart"}
                onClick={() => setFullscreen(!fullscreen)}
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <div className="popover-parent">
                <button
                  className="icon-button"
                  aria-label="Chart options"
                  onClick={() => setChartMenu(!chartMenu)}
                >
                  <MoreHorizontal size={18} />
                </button>
                {chartMenu && (
                  <>
                    <div
                      className="popover-dismiss"
                      onClick={() => setChartMenu(false)}
                    />
                    <div className="popover chart-menu">
                      <button onClick={exportHistory}>
                        <ArrowDownToLine size={14} />
                        Export OHLCV CSV
                      </button>
                      <button onClick={() => void refresh()}>
                        <RotateCcw size={14} />
                        Refresh market data
                      </button>
                      <button
                        onClick={() => openForm("save-layout", layoutName)}
                      >
                        <Save size={14} />
                        Save current layout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="chart-stage">
            <div className="chart-information">
              <div className="ohlc-line">
                <span className="chart-symbol-label">
                  {displaySymbol(symbol)}
                  <span>
                    · {timeframe} · {asset.exchange}
                  </span>
                </span>
                {shownBar && (
                  <span className="ohlc-values">
                    {(["open", "high", "low", "close"] as const).map(
                      (key, i) => (
                        <span key={key}>
                          <label>{["O", "H", "L", "C"][i]}</label>
                          <b
                            className={
                              shownBar.close >= shownBar.open
                                ? "positive"
                                : "negative"
                            }
                          >
                            {formatPrice(shownBar[key])}
                          </b>
                        </span>
                      ),
                    )}
                  </span>
                )}
                <span className="chart-data-badge">
                  {currentHistory?.source === "demo"
                    ? "SAMPLE"
                    : currentHistory?.source?.toUpperCase() || "LOADING"}
                </span>
              </div>
              <div className="chart-indicator-legend">
                {enabledIndicators
                  .filter((i) =>
                    ["SMA", "EMA", "BB", "VWAP", "Volume"].includes(i.kind),
                  )
                  .map((i) => (
                    <span className="legend-chip" key={i.id}>
                      <span style={{ background: i.color }} />
                      {indicatorLabel(i)}
                      {isDailyAverage(i) &&
                        [50, 200].includes(i.parameters.period) &&
                        (() => {
                          const fifty = i.parameters.period === 50;
                          const average = fifty
                            ? dailyStatus.sma50
                            : dailyStatus.sma200;
                          const position = averagePosition(
                            lastBar?.close,
                            average,
                          );
                          const trend = averageTrend(
                            fifty
                              ? dailyStatus.sma50Change
                              : dailyStatus.sma200Change,
                            average,
                          );
                          return (
                            <span
                              className="jordi-legend-values"
                              title={`Latest daily average${dailyStatus.time ? ` · ${new Date(dailyStatus.time * 1000).toLocaleDateString("en-GB", { timeZone: "UTC" })}` : ""}. Rising compares with ${risingLookback} daily bar(s) earlier.`}
                            >
                              <b>{formatPrice(average ?? undefined)}</b>
                              <span
                                className={
                                  position === "Above"
                                    ? "positive"
                                    : position === "Below"
                                      ? "negative"
                                      : ""
                                }
                              >
                                {position}
                              </span>
                              <span
                                className={
                                  trend === "Rising"
                                    ? "positive"
                                    : trend === "Falling"
                                      ? "negative"
                                      : ""
                                }
                              >
                                {trend}
                              </span>
                            </span>
                          );
                        })()}
                      <button
                        title={`Remove ${indicatorLabel(i)}`}
                        aria-label={`Remove ${indicatorLabel(i)}`}
                        onClick={() => removeIndicator(i.id)}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
              </div>
            </div>
            {needsDailyHistory && (
              <div className="daily-indicator-caption">
                <span>
                  {dailyNotice ||
                    (timeframe === "1D" || timeframe === "1W"
                      ? "Daily SMA · latest daily candle may still be forming"
                      : "Daily SMA · completed daily closes")}
                </span>
                <label>
                  Trend comparison
                  <select
                    aria-label="Chart rising comparison"
                    value={risingLookback}
                    onChange={(event) =>
                      setRisingLookback(Number(event.target.value))
                    }
                  >
                    <option value={1}>1 day</option>
                    <option value={5}>5 days</option>
                    <option value={20}>20 days</option>
                  </select>
                </label>
                {dailyError && timeframe !== "1D" && (
                  <button onClick={() => setDailyRetry((value) => value + 1)}>
                    Retry
                  </button>
                )}
              </div>
            )}
            <div className="chart-canvas-container">
              <MarketChart
                bars={bars}
                dailyBars={dailyBars}
                indicators={indicators}
                chartType={chartType}
                onCrosshair={onCrosshair}
                timeframe={timeframe}
                range={range}
                fitKey={fitKey}
                autoScale={autoScale}
                loading={loading}
              />
              {!loading && !error && bars.length > 0 && (
                <div className="chart-watermark">
                  <span>{displaySymbol(symbol)}</span>
                  <small>{asset.name}</small>
                </div>
              )}
              {loading && (
                <div className="chart-loading">
                  <LoaderCircle size={22} className="spin" />
                  <span>Loading {displaySymbol(symbol)} market data…</span>
                </div>
              )}
              {error && (
                <div className="chart-error">
                  <Database size={27} />
                  <strong>Market data is unavailable</strong>
                  <p>{error}</p>
                  <p className="start-hint">
                    Start the local API with <code>npm start</code>.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => void refresh()}
                  >
                    <RotateCcw size={14} />
                    Try again
                  </button>
                </div>
              )}
            </div>
            {demo && (
              <div className="demo-notice">
                <span className="status-dot sample" />
                <span>
                  Sample data · Synthetic historical prices.{" "}
                  {dataMode === "demo"
                    ? "Demo mode is enabled."
                    : "The data provider is currently unavailable."}
                </span>
                <button onClick={() => setDialog("sources")}>
                  Details
                  <ArrowUpRight size={11} />
                </button>
              </div>
            )}
            {!demo &&
              currentHistory?.warning &&
              /cached|stale/i.test(currentHistory.warning) && (
                <div className="demo-notice">
                  <span className="status-dot sample" />
                  <span>
                    Cached market history · The provider is unavailable. Last
                    bar:{" "}
                    {lastBar
                      ? new Date(lastBar.time * 1000).toLocaleString("en-GB", {
                          timeZone: "UTC",
                        })
                      : "—"}{" "}
                    UTC.
                  </span>
                  <button onClick={() => setDialog("sources")}>
                    Details
                    <ArrowUpRight size={11} />
                  </button>
                </div>
              )}
            <div className="chart-bottom-toolbar">
              <div className="range-group" aria-label="Visible date range">
                {(
                  ["RECENT", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as const
                ).map((r) => (
                  <button
                    key={r}
                    className={range === r ? "active" : ""}
                    onClick={() => setRange(r)}
                  >
                    {r === "RECENT" ? "Recent" : r === "ALL" ? "All" : r}
                  </button>
                ))}
              </div>
              <span className="chart-timezone">
                {hovered
                  ? new Date(hovered.time * 1000).toLocaleString("en-GB", {
                      timeZone: "UTC",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "Exchange timestamps"}{" "}
                <span>UTC</span>
                <button
                  className="icon-button"
                  title="Fit all available data"
                  aria-label="Fit all available data"
                  onClick={() => {
                    setRange("ALL");
                    setFitKey((n) => n + 1);
                  }}
                >
                  <Maximize2 size={12} />
                </button>
              </span>
            </div>
          </div>
          <section
            className={`research-shelf ${shelfCollapsed ? "collapsed" : ""} ${shelfTab === "returns" ? "returns-shelf" : ""}`}
          >
            <div className="shelf-tabs">
              <div>
                <button
                  className={
                    !shelfCollapsed && shelfTab === "overview" ? "active" : ""
                  }
                  aria-expanded={!shelfCollapsed && shelfTab === "overview"}
                  onClick={() => openShelf("overview")}
                >
                  Overview
                </button>
                <button
                  className={
                    !shelfCollapsed && shelfTab === "returns" ? "active" : ""
                  }
                  aria-expanded={!shelfCollapsed && shelfTab === "returns"}
                  onClick={() => openShelf("returns")}
                >
                  Returns
                </button>
                <button
                  className={
                    !shelfCollapsed && shelfTab === "indicators" ? "active" : ""
                  }
                  aria-expanded={!shelfCollapsed && shelfTab === "indicators"}
                  onClick={() => openShelf("indicators")}
                >
                  Indicators <span>{indicators.length}</span>
                </button>
                <button
                  className={
                    !shelfCollapsed && shelfTab === "notes" ? "active" : ""
                  }
                  aria-expanded={!shelfCollapsed && shelfTab === "notes"}
                  onClick={() => openShelf("notes")}
                >
                  Research notes{notes[symbol] && <span className="note-dot" />}
                </button>
              </div>
              <button
                className="shelf-toggle"
                aria-label={
                  shelfCollapsed
                    ? "Expand research panel"
                    : "Collapse research panel"
                }
                aria-expanded={!shelfCollapsed}
                onClick={() => setShelfCollapsed(!shelfCollapsed)}
              >
                <ChevronDown
                  size={17}
                  style={{
                    transform: shelfCollapsed ? "rotate(180deg)" : undefined,
                  }}
                />
                <span>{shelfCollapsed ? "Expand" : "Collapse"}</span>
              </button>
            </div>
            {!shelfCollapsed && shelfTab === "overview" && (
              <div className="overview-content">
                <div className="overview-about">
                  <span className="tiny-heading">ASSET SNAPSHOT</span>
                  <strong>{asset.name}</strong>
                  <span>
                    {asset.type === "stock"
                      ? "Equity"
                      : asset.type === "etf"
                        ? "Exchange-traded fund"
                        : asset.type === "crypto"
                          ? "Digital asset"
                          : "Market index"}
                    <span className="snapshot-divider">/</span>
                    {asset.exchange}
                    <span className="snapshot-divider">/</span>
                    {asset.currency}
                  </span>
                  <span className="history-date">
                    {bars.length > 0
                      ? `${bars.length.toLocaleString()} bars · ${new Date(bars[0].time * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })} — ${new Date(lastBar.time * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`
                      : "Waiting for historical data"}
                  </span>
                </div>
                <div className="metric">
                  <span>{timeframe} RETURN</span>
                  <strong
                    className={
                      barReturn !== null && barReturn >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {formatPercent(barReturn ?? undefined)}
                  </strong>
                  <small>
                    {hovered ? "Crosshair candle" : "Latest candle"} · vs
                    previous close
                  </small>
                </div>
                <div className="metric">
                  <span>BAR VOLATILITY</span>
                  <strong>
                    {metrics ? metrics.volatility.toFixed(2) + "%" : "—"}
                    <svg className="metric-wave" viewBox="0 0 60 20">
                      <path d="M0 15L7 12L13 17L20 7L26 11L33 3L40 8L47 4L53 9L60 6" />
                    </svg>
                  </strong>
                  <small>Std. dev. of log returns</small>
                </div>
                <div className="metric">
                  <span>AVERAGE VOLUME</span>
                  <strong>{metrics ? compact(metrics.volume) : "—"}</strong>
                  <small>Last 20 bars</small>
                </div>
                <div className="metric rsi-metric">
                  <span>RELATIVE STRENGTH</span>
                  <strong>
                    {latestRsi !== undefined ? latestRsi.toFixed(2) : "—"}
                    <small>
                      {latestRsi !== undefined
                        ? latestRsi > 70
                          ? "Overbought"
                          : latestRsi < 30
                            ? "Oversold"
                            : "Neutral"
                        : "RSI 14"}
                    </small>
                  </strong>
                  <div className="rsi-meter">
                    <span style={{ left: `${latestRsi ?? 50}%` }} />
                  </div>
                  <div className="rsi-meter-labels">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>
              </div>
            )}
            {!shelfCollapsed && shelfTab === "returns" && (
              <ReturnsPanel key={symbol} symbol={symbol} />
            )}
            {!shelfCollapsed && shelfTab === "indicators" && (
              <div className="indicator-controls">
                {indicators.map((i) => (
                  <div
                    className={`indicator-control ${!i.visible ? "hidden-indicator" : ""}`}
                    key={i.id}
                  >
                    <div className="indicator-control-header">
                      <input
                        type="color"
                        value={i.color}
                        aria-label={`${indicatorLabel(i)} color`}
                        onChange={(e) =>
                          updateIndicator(i.id, { color: e.target.value })
                        }
                      />
                      <strong>
                        {i.basis === "daily"
                          ? indicatorLabel(i)
                          : i.kind === "BB"
                            ? "Bollinger Bands"
                            : i.kind}
                      </strong>
                      <button
                        className="icon-button"
                        title={i.visible ? "Hide indicator" : "Show indicator"}
                        aria-label={`${i.visible ? "Hide" : "Show"} ${indicatorLabel(i)}`}
                        onClick={() =>
                          updateIndicator(i.id, { visible: !i.visible })
                        }
                      >
                        {i.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${indicatorLabel(i)}`}
                        onClick={() => removeIndicator(i.id)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="indicator-parameters">
                      {Object.entries(i.parameters).map(([key, value]) => (
                        <label key={key}>
                          {{
                            period: "Period",
                            stdDev: "Std. dev.",
                            fast: "Fast",
                            slow: "Slow",
                            signal: "Signal",
                          }[key] || key}
                          <input
                            type="number"
                            min={key === "stdDev" ? 0.1 : 1}
                            step={key === "stdDev" ? 0.1 : 1}
                            value={value}
                            aria-label={`${i.kind} ${key}`}
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              if (Number.isFinite(parsed) && parsed > 0)
                                updateIndicator(i.id, {
                                  parameters: {
                                    ...i.parameters,
                                    [key]:
                                      key === "stdDev"
                                        ? parsed
                                        : Math.round(parsed),
                                  },
                                });
                            }}
                          />
                        </label>
                      ))}
                      {Object.keys(i.parameters).length === 0 && (
                        <span className="no-params">
                          {i.kind === "VWAP"
                            ? "Resets each UTC session"
                            : "Raw traded volume"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  className="add-indicator-tile"
                  onClick={() => setDialog("indicators")}
                >
                  <Plus size={19} />
                  <span>Add indicator</span>
                  <small>No instance limits</small>
                </button>
              </div>
            )}
            {!shelfCollapsed && shelfTab === "notes" && (
              <div className="notes-content">
                <div>
                  <span className="tiny-heading">
                    {displaySymbol(symbol)} / RESEARCH NOTES
                  </span>
                  <span className="notes-saved">
                    <Check size={12} />
                    Saved locally as you type
                  </span>
                </div>
                <textarea
                  value={notes[symbol] || ""}
                  placeholder="Capture a thesis, levels to watch, or a question for your next research session…"
                  aria-label={`Research notes for ${displaySymbol(symbol)}`}
                  onChange={(e) =>
                    setNotes((old) => ({ ...old, [symbol]: e.target.value }))
                  }
                />
              </div>
            )}
          </section>
        </section>
      </main>
      <footer className="app-footer">
        <div>
          <span className="status-dot" />
          <span>LOCAL STORAGE ACTIVE</span>
          <span className="footer-separator">/</span>
          <span>
            {quoteError
              ? "QUOTE UPDATE FAILED"
              : anyDemo || demo
                ? "SAMPLE DATA — NOT LIVE PRICES"
                : "DELAYED MARKET DATA"}
          </span>
        </div>
        <div>
          <a
            className="chart-credit"
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
            title="TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc."
          >
            Charting by TradingView
          </a>
          <span className="footer-clock">
            {now.toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin" })}{" "}
            BERLIN
          </span>
        </div>
      </footer>

      {dialog === "breadth" && (
        <BreadthDialog
          lists={watchlists}
          activeId={activeList.id}
          dataMode={dataMode}
          lookback={risingLookback}
          setLookback={setRisingLookback}
          onClose={closeDialog}
        />
      )}

      {(dialog === "search" || dialog === "add-symbol") && (
        <SymbolSearch
          onClose={closeDialog}
          onSelect={selectAsset}
          onAdd={
            dialog === "add-symbol"
              ? (a) => {
                  toggleAsset(a.symbol);
                  notify(
                    `${displaySymbol(a.symbol)} ${activeList.symbols.includes(a.symbol) ? "removed from" : "added to"} ${activeList.name}.`,
                  );
                }
              : undefined
          }
          addedSymbols={activeList.symbols}
        />
      )}
      {dialog === "indicators" && (
        <IndicatorPicker
          onClose={closeDialog}
          onAdd={addIndicator}
          indicators={indicators}
        />
      )}
      {["create-list", "rename-list", "save-layout"].includes(dialog || "") && (
        <Modal
          title={
            dialog === "save-layout"
              ? "Save a layout"
              : dialog === "rename-list"
                ? "Rename watchlist"
                : "Create watchlist"
          }
          subtitle={
            dialog === "save-layout"
              ? "Keep this symbol, timeframe and indicator setup for later."
              : "Organize your markets, your way. No list or asset limits."
          }
          onClose={closeDialog}
          className="form-modal"
        >
          <form onSubmit={submitForm}>
            <label className="form-label">
              {dialog === "save-layout" ? "Layout name" : "Watchlist name"}
              <input
                autoFocus
                placeholder={
                  dialog === "save-layout"
                    ? "e.g. Momentum research"
                    : "e.g. Semiconductor thesis"
                }
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div className="form-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit">
                {dialog === "create-list" ? (
                  <Plus size={15} />
                ) : (
                  <Save size={14} />
                )}{" "}
                {dialog === "create-list" ? "Create watchlist" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "layouts" && (
        <Modal
          title="Saved layouts"
          subtitle="Pick up exactly where your research left off."
          onClose={closeDialog}
          className="layouts-modal"
        >
          <div className="saved-layouts">
            {layouts.map((l) => (
              <div key={l.id} className="saved-layout">
                <button onClick={() => restoreLayout(l)}>
                  <LayoutDashboard size={20} />
                  <span>
                    <strong>{l.name}</strong>
                    <small>
                      {displaySymbol(l.symbol)} · {l.timeframe} ·{" "}
                      {l.indicators.length} indicators
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete layout ${l.name}`}
                  onClick={() => {
                    setLayouts((old) => old.filter((x) => x.id !== l.id));
                    if (l.name === layoutName) setLayoutName("Market overview");
                    notify("Layout deleted.", () =>
                      setLayouts((old) => [...old, l]),
                    );
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {layouts.length === 0 && (
              <div className="empty-layouts">
                <LayoutDashboard size={30} />
                <h3>Your next idea starts here.</h3>
                <p>
                  Save a chart layout to return to a symbol and its indicators
                  with one click.
                </p>
              </div>
            )}
          </div>
          <footer className="modal-footer">
            <span>Stored in this browser</span>
            <button
              className="primary-button"
              onClick={() => openForm("save-layout", layoutName)}
            >
              <Plus size={14} />
              Save current layout
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "sources" && (
        <Modal
          title="Data connections"
          subtitle="A modular data layer for your personal terminal."
          onClose={closeDialog}
          className="sources-modal"
        >
          <div className="source-mode-banner">
            <span className={`status-dot ${healthy ? "" : "offline"}`} />
            <div>
              <strong>
                {healthy ? "Local API connected" : "Local API unavailable"}
              </strong>
              <span>
                {dataMode === "demo"
                  ? "Demo mode · synthetic historical fixtures"
                  : demo || anyDemo
                    ? "Live mode · provider fallback using sample data"
                    : "Live mode · public provider endpoints"}
              </span>
            </div>
            <button className="secondary-button" onClick={() => void refresh()}>
              <RotateCcw size={13} />
              Refresh
            </button>
          </div>
          <div className="provider-card">
            <span className="provider-logo yahoo">y!</span>
            <div>
              <strong>Yahoo Finance</strong>
              <p>Stocks, ETFs & indices</p>
              <small>Historical OHLCV · Delayed quotes · Symbol search</small>
            </div>
            <span className="provider-label">CONFIGURED</span>
          </div>
          <div className="provider-card">
            <span className="provider-logo coinbase">C</span>
            <div>
              <strong>Coinbase Exchange</strong>
              <p>Crypto spot markets</p>
              <small>Public candles · Tickers · No API key needed</small>
            </div>
            <span className="provider-label">CONFIGURED</span>
          </div>
          <div className="provider-future">
            <Database size={18} />
            <div>
              <strong>Ready for your next data source</strong>
              <p>
                OpenBB, Polymarket and derivatives can connect through the
                provider interface.
              </p>
            </div>
            <span>EXTENSIBLE</span>
          </div>
          <div className="source-details">
            <h3>How data moves</h3>
            <div>
              <span>Watchlists</span>
              <span>Lightweight quotes every {settings.quoteInterval}s</span>
            </div>
            <div>
              <span>Opened chart</span>
              <span>OHLCV requested on symbol / timeframe changes</span>
            </div>
            <div>
              <span>Indicators</span>
              <span>Calculated locally from chart data</span>
            </div>
            <div>
              <span>History cache</span>
              <span>SQLite on your machine + browser memory</span>
            </div>
            {currentHistory?.warning && (
              <p className="provider-warning">{currentHistory.warning}</p>
            )}
            <p className="source-disclosure">
              Public providers may delay, limit or reject requests. Sample
              fallback is explicitly labeled and must not be used as market
              prices.
            </p>
          </div>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal
          title="Workspace settings"
          subtitle="A few practical controls. The rest is yours."
          onClose={closeDialog}
          className="settings-modal"
        >
          <div className="settings-body">
            <div className="setting-row">
              <div>
                <strong>Auto scale</strong>
                <p>
                  Fit prices to the visible candles. Turn off to adjust the
                  right price axis manually.
                </p>
              </div>
              <button
                className={`toggle ${autoScale ? "on" : ""}`}
                role="switch"
                aria-checked={autoScale}
                aria-label="Auto scale"
                onClick={() => setAutoScale(!autoScale)}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Quote refresh interval</strong>
                <p>Refresh prices in your watchlists.</p>
              </div>
              <select
                aria-label="Quote refresh interval"
                value={settings.quoteInterval}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    quoteInterval: Number(e.target.value),
                  }))
                }
              >
                {[30, 60, 120, 300].map((n) => (
                  <option key={n} value={n}>
                    {n < 60
                      ? `${n} seconds`
                      : `${n / 60} minute${n > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>Compact watchlist</strong>
                <p>Show more symbols in the same space.</p>
              </div>
              <button
                className={`toggle ${settings.compactRows ? "on" : ""}`}
                role="switch"
                aria-checked={settings.compactRows}
                aria-label="Compact watchlist"
                onClick={() =>
                  setSettings((s) => ({ ...s, compactRows: !s.compactRows }))
                }
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Theme</strong>
                <p>A focused, dark research environment.</p>
              </div>
              <span className="setting-pill">Dark</span>
            </div>
            <div className="local-storage-note">
              <Save size={18} />
              <p>
                Watchlists, notes, indicators and layouts are saved in this
                browser. Historical data is cached in the local backend.
              </p>
            </div>
          </div>
          <footer className="modal-footer">
            <span>Changes are saved automatically</span>
            <button className="primary-button" onClick={closeDialog}>
              <Check size={14} />
              Done
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="Make yourself at home"
          subtitle="A compact guide to your terminal."
          onClose={closeDialog}
          className="help-modal"
        >
          <div className="help-content">
            <div>
              <strong>Find a market</strong>
              <span>
                <kbd>⌘ / Ctrl</kbd> + <kbd>K</kbd>
              </span>
            </div>
            <div>
              <strong>Close a dialog / expanded chart</strong>
              <kbd>Esc</kbd>
            </div>
            <div>
              <strong>Zoom the chart</strong>
              <span>Mouse wheel / pinch</span>
            </div>
            <div>
              <strong>Pan through history</strong>
              <span>Click and drag</span>
            </div>
            <div>
              <strong>Reorder a watchlist</strong>
              <span>Drag a row, or use its ↑ / ↓ buttons</span>
            </div>
            <div>
              <strong>Edit indicator parameters</strong>
              <span>Indicators tab below the chart</span>
            </div>
            <p>
              Charts use{" "}
              <a
                href="https://www.tradingview.com/lightweight-charts/"
                target="_blank"
                rel="noreferrer"
              >
                TradingView Lightweight Charts™
              </a>
              . Indicators run on raw OHLCV in your browser. All workspace data
              remains local.
            </p>
          </div>
        </Modal>
      )}
      {dialog === "research" && (
        <Modal
          title="Research workspace"
          subtitle={`${displaySymbol(symbol)} · Signals calculated from your loaded history`}
          onClose={closeDialog}
          className="research-modal"
        >
          <div className="research-modal-content">
            <div className="research-hero">
              <Activity size={24} />
              <div>
                <span className="tiny-heading">TECHNICAL CONTEXT</span>
                <h3>
                  {latestRsi !== undefined
                    ? latestRsi > 70
                      ? "Momentum is elevated"
                      : latestRsi < 30
                        ? "Momentum is under pressure"
                        : "Momentum is balanced"
                    : "Load a chart to begin"}
                </h3>
                <p>
                  {latestRsi !== undefined
                    ? `RSI (14) is ${latestRsi.toFixed(2)}. This describes recent price momentum across the loaded candles.`
                    : "Your loaded OHLCV powers local research calculations."}
                </p>
              </div>
            </div>
            <div className="research-stat-grid">
              <div>
                <span>{timeframe} candle return</span>
                <strong
                  className={
                    barReturn !== null && barReturn >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {formatPercent(barReturn ?? undefined)}
                </strong>
              </div>
              <div>
                <span>History high / low</span>
                <strong>
                  {metrics
                    ? `${formatPrice(metrics.high)} / ${formatPrice(metrics.low)}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Bar return volatility</span>
                <strong>
                  {metrics ? `${metrics.volatility.toFixed(2)}%` : "—"}
                </strong>
              </div>
              <div>
                <span>Data provenance</span>
                <strong>
                  {demo
                    ? "Synthetic sample"
                    : currentHistory?.source || "Unavailable"}
                </strong>
              </div>
            </div>
            <div className="model-extension">
              <span className="tiny-heading">CUSTOM MODELS</span>
              <strong>A place for your quantitative edge.</strong>
              <p>
                The backend has a separate model registry with an EWMA
                volatility example. New models can return timestamped values and
                labels without changing data providers.
              </p>
              <code>{"{ timestamp, value, label }"}</code>
            </div>
            <button
              className="secondary-button"
              onClick={() => {
                openShelf("notes");
                closeDialog();
              }}
            >
              Open {displaySymbol(symbol)} research notes
              <ArrowUpRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
