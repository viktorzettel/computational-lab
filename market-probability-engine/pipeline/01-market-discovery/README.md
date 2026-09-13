# 01 · Market Discovery

Identifies eligible short-horizon prediction markets (e.g., 5-minute and 15-minute crypto binary contracts) from raw metadata feeds and prepares structured candidates for modeling.

## Role in Pipeline

Prediction platforms continuously issue recurring events (such as *"Bitcoin Up or Down - 5 Minutes"*). The discovery layer parses raw market metadata, detects recurrence intervals, resolves underlying assets, extracts outcome token identifiers, and verifies order-book eligibility.

## Components

- **`market_parser.py`**:
  - `MarketCandidate`: Standardized dataclass encapsulating slug, asset, recurrence interval, token IDs, lifecycle timestamps, and order-book status.
  - `detect_interval_minutes()`: Regex and series-based recurrence parser (e.g., distinguishing 5m vs. 15m cycles).
  - `detect_asset()`: Canonical symbol identification (`BTC`, `ETH`, `SOL`, `XRP`).
  - `extract_yes_no_tokens()`: Maps token IDs to binary outcomes (`YES` / `NO`, `UP` / `DOWN`).
  - `extract_start_end_ts()`: Resolves authoritative contract start and expiry timestamps from ISO-8601 strings and slug epoch identifiers.
  - `select_current_market()`: Selects the currently active market window for a given timestamp and queues upcoming cycles.

## Public vs. Private Boundaries

- **Public**: Metadata parsing logic, asset categorization, timestamp normalization, and candidate selection interfaces.
- **Private**: Real-time polling daemons, operational endpoints, private webhooks, and proprietary filtering thresholds.
