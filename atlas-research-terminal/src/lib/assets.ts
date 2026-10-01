import type { Asset } from "./types";

export const ASSETS: Asset[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "META",
    name: "Meta Platforms, Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "MU",
    name: "Micron Technology, Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "MRVL",
    name: "Marvell Technology, Inc.",
    type: "stock",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    type: "crypto",
    exchange: "COINBASE",
    currency: "USD",
  },
  {
    symbol: "ETH-USD",
    name: "Ethereum",
    type: "crypto",
    exchange: "COINBASE",
    currency: "USD",
  },
  {
    symbol: "SOL-USD",
    name: "Solana",
    type: "crypto",
    exchange: "COINBASE",
    currency: "USD",
  },
  {
    symbol: "^GSPC",
    name: "S&P 500 Index",
    type: "index",
    exchange: "S&P",
    currency: "USD",
  },
  {
    symbol: "^IXIC",
    name: "NASDAQ Composite",
    type: "index",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "^DJI",
    name: "Dow Jones Industrial Average",
    type: "index",
    exchange: "DJI",
    currency: "USD",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    type: "etf",
    exchange: "NYSE",
    currency: "USD",
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    type: "etf",
    exchange: "NASDAQ",
    currency: "USD",
  },
  {
    symbol: "IWM",
    name: "iShares Russell 2000 ETF",
    type: "etf",
    exchange: "NYSE",
    currency: "USD",
  },
];

export const assetFor = (symbol: string): Asset =>
  ASSETS.find((a) => a.symbol === symbol) || {
    symbol,
    name: symbol,
    type: symbol.endsWith("-USD")
      ? "crypto"
      : symbol.startsWith("^")
        ? "index"
        : "stock",
    exchange: "MARKET",
    currency: "USD",
  };
export const displaySymbol = (symbol: string) =>
  ({ "^GSPC": "SPX", "^IXIC": "IXIC", "^DJI": "DJI" })[symbol] ||
  symbol.replace("-USD", "");
export const formatPrice = (value?: number) =>
  value == null
    ? "—"
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const formatPercent = (value?: number) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
export const compact = (value: number) =>
  Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
