# Research architecture

![Public research architecture](system-architecture.svg)

The public project has two inputs after contract identification: a sampled underlying-price series and contemporaneous Level-2 order-book snapshots. Volatility and jump estimates parameterize a terminal-price model; order-book calculations produce a separate descriptive feature set. Combining those outputs into a decision and executing an order belong to a private system and are not specified here.

The contract record supplies the official strike and expiry. The official final price and resolved side become available only after settlement and belong to evaluation, never to the pre-expiry forecast input. Captured spot proxies and actual exchange fills are separate from official truth.

| Public stage | Role |
| --- | --- |
| 01–02 | Identify contracts, map outcome tokens and retain authoritative strike/expiry/resolution fields. |
| 03 | Form fixed-grid candles and log returns; mark synthetic intervals. |
| 04 | Estimate continuous variation and candidate jumps from past returns. |
| 05 | Estimate $P(S_T\ge K)$ by Kou Monte Carlo and compare with diffusion. |
| 06 | Summarize bid/ask spread, depth, imbalance and microprice from Level-2 snapshots. |

The public modules are reference implementations, not evidence of a particular live deployment. Current thresholds, signal integration, risk controls, pricing comparison and order submission are not represented by the public code.
