# Architecture

```mermaid
flowchart TD
    A[Market Discovery] --> B[Strike & Contract Capture]
    B --> C[Market Data Ingestion]
    C --> D[Volatility & Jump Estimation]
    D --> E[Kou Probability Engine]
    E --> F[Order Book & Flow Signals]
    F --> G[Decision & Risk Filters]
    G --> H[Market Comparison]
    H --> I[Execution]
```

The diagram describes the conceptual production pipeline. Public documentation focuses on the interfaces, research motivation, and evaluation of each stage rather than live production implementation.
