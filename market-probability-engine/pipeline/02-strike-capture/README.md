# 02 · Strike & Contract Capture

Captures the authoritative baseline parameters for each binary option contract: the strike price ($K$, often termed *priceToBeat*), expiration timestamp ($T$), and post-expiration settlement price ($S_T$).

## Motivation

In short-horizon prediction contracts (e.g. 5-minute crypto cycles), terminal probability evaluation requires an exact boundary:
$$
\text{Payoff} = \begin{cases} 1 & \text{if } S_T \ge K \\ 0 & \text{if } S_T < K \end{cases}
$$

Distinguishing captured real-time proxies (e.g., local spot midpoints at $t_0$) from the exchange's official strike and settlement index is critical for unbiased historical backtesting and probability scoring.

## Components

- **`strike_parser.py`**:
  - `StrikeResolutionTruth`: Dataclass recording `official_price_to_beat`, `official_final_price`, `official_winning_side`, and settlement state.
  - `parse_strike_and_resolution()`: Normalizes contract metadata, extracting the target strike and resolving whether terminal trading prices indicate contract settlement.
  - `evaluate_resolution_outcome()`: Ground-truth binary verification function testing $S_T \ge K$.

## Public vs. Private Boundaries

- **Public**: Parsing schemas, ground truth resolution functions, and outcome normalization rules.
- **Private**: Automated settlement scrapers, live oracle poller daemons, and internal dispute handling.
