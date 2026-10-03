# FinanceBro indicator calculations

All indicators use the loaded chart’s OHLCV bars and selected candle timeframe. A period of 20 means 20 chart bars, unless the configuration is explicitly marked **daily** by the Jordi Visser preset. Every instance has independent parameters. Full-window warm-up values are omitted rather than backfilled. Changing parameters does not download more history.

| Indicator | Convention |
| --- | --- |
| SMA / EMA | Closing-price SMA; EMA seeded with a full-window SMA, then alpha `2 / (n + 1)` |
| WMA | Closing prices with weights 1 through n, newest weighted most |
| DEMA / TEMA | `2·EMA₁ − EMA₂`; `3·EMA₁ − 3·EMA₂ + EMA₃`, each stage independently seeded |
| Hull MA | WMA of `2·WMA(close, floor(n/2)) − WMA(close, n)`, with final period `round(sqrt(n))`; periods at least 1 |
| VWMA | Rolling sum of close × volume divided by rolling volume |
| Ichimoku | Conversion and base lines are rolling high/low midpoints (9 / 26). Span A averages those lines; Span B is the 52-bar midpoint. Both spans move 26 trading bars forward. Closing price moves 26 bars backward. All four periods are configurable |
| Supertrend | HL2 ± multiplier × Wilder ATR, trailing-band recurrence and close-based direction switches; default ATR 10, multiplier 3. First available direction is down |
| Donchian | Rolling highest high, lowest low and their midpoint; includes the current candle |
| Keltner | EMA(close, 20) ± 2 × Wilder ATR(10); all periods and multiplier configurable |
| Bollinger Bands | Closing-price SMA ± multiplier × population standard deviation |
| ATR | Wilder average of true range, seeded from n bars; first bar’s true range is high minus low |
| RSI | Wilder average gains/losses from n close deltas; flat series returns neutral 50 |
| MACD | EMA(fast) − EMA(slow), SMA-seeded EMA signal, and difference histogram |
| Stochastic | `100 × (close − rolling low) / (rolling high − rolling low)`, SMA-smoothed %K and %D; flat range returns 50 |
| Stochastic RSI | Stochastic of Wilder RSI, scaled to 0–100 and SMA-smoothed; flat RSI range returns 50 |
| ADX / DI | Wilder-smoothed true range and directional movement from n bar-to-bar deltas. ADX averages n DX values; +DI / −DI first appear at index n, ADX at index 2n−1. No movement returns 0 |
| CCI | `(typical price − SMA) / (0.015 × mean absolute deviation)`; flat windows return 0 |
| Williams %R | `−100 × (rolling high − close) / (rolling high − rolling low)`; flat range returns −50 |
| ROC | Percentage closing-price change over n bars; zero starting price is omitted |
| Awesome Oscillator | SMA(HL2, fast) − SMA(HL2, slow); histogram colors follow change from the previous value |
| Volume | Nonnegative reported volume colored by close versus open, with a configurable SMA (default 20) in the same pane |
| VWAP | Cumulative typical price × volume / cumulative volume, reset at midnight UTC |
| OBV | Starts at zero, then adds/subtracts current volume by closing-price direction; unchanged close adds zero |
| MFI | Rolling positive/negative typical-price × volume flows from n deltas. Positive-only returns 100, negative-only 0, no flow 50 |
| CMF | Rolling sum of money-flow volume / rolling volume; flat high/low bar contributes zero money-flow volume |
| Accumulation / Distribution | Cumulative `((2·close − high − low) / (high − low)) × volume`; flat high/low bar contributes zero |

## Cloud rendering

Green fill means leading Span A is above Span B; red means it is below. Fill switches at the exact intersection of linearly drawn segments. The cloud extends into blank space to the right of the final candle. This is displacement of historical calculations, not a forecast or future market data. Offsets count actual chart bars, so market closures do not distort them. No future candle prices or timestamps are fabricated. The lagging line ends the configured number of bars before the latest candle.

Supertrend’s two direction lines stop at regime changes; the renderer does not join them across inactive bars. Oscillators use separate resizable panes. Bounded oscillators retain their conventional scale and reference levels.

## Data and warm-up

The selected candle can still be forming. Short provider histories may not warm up long periods or stacked averages. The parameter editor allows integer periods up to 5,000 bars and cloud displacement up to 200 bars; multipliers accept decimals. Daily Jordi averages preserve their existing daily-history conventions.

Volume depends on the provider and instrument; indices may report zero, and some markets supply proxy volume. Zero-total-volume windows are omitted for VWMA / CMF; VWAP begins only after positive session volume. MFI’s no-flow value is neutral 50 and is not evidence of buying or selling. OBV and A/D are cumulative from the start of the loaded history, so their absolute levels can change with the history window.

Initialization, rounding and UTC sessions are explicit here. Results can differ from another platform that uses different warm-up history or conventions.

## Reference formulas

- [TradingView: Ichimoku Cloud](https://www.tradingview.com/support/solutions/43000589152-ichimoku-cloud/)
- [TradingView: Supertrend](https://www.tradingview.com/support/solutions/43000634738-supertrend/)
- [TradingView: Hull moving average](https://www.tradingview.com/support/solutions/43000589149-hull-moving-average/)
- [TradingView: Stochastic RSI](https://www.tradingview.com/support/solutions/43000502333-stochastic-rsi-stoch-rsi/)
- [Fidelity: Directional Movement Index](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/DMI)
