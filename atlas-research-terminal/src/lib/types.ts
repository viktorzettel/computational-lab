export type AssetType = "stock" | "etf" | "index" | "crypto";
export interface Asset {
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  currency: string;
}
export interface Quote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  previous_close: number;
  timestamp: number;
  source: string;
  market_state?: string;
  warning?: string | null;
}
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W";
export interface HistoryResponse {
  symbol: string;
  timeframe: Timeframe;
  bars: Bar[];
  source: string;
  cached: boolean;
  warning?: string | null;
  supported_timeframes: Timeframe[];
}
export type IndicatorKind =
  "SMA" | "EMA" | "RSI" | "MACD" | "BB" | "ATR" | "VWAP" | "Volume";
export interface IndicatorConfig {
  id: string;
  kind: IndicatorKind;
  basis?: "daily";
  parameters: Record<string, number>;
  color: string;
  visible: boolean;
}
export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}
export interface Layout {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  indicators: IndicatorConfig[];
  chartType: "candles" | "line";
}
