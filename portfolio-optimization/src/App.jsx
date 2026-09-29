import { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "https://risklens-api-r8yc.onrender.com";
const STARTER = ["BIL", "SHY"];
const COLORS = [
  "#a7e2d1",
  "#afc4f5",
  "#eac393",
  "#d2b0df",
  "#91c9dd",
  "#d6d99d",
  "#e6a6a1",
  "#9bc9ae",
  "#b2aaeb",
  "#d5c188",
];
const funds = {
  BIL: {
    description: "1–3 month U.S. Treasury bill ETF",
    link: "https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-bloomberg-1-3-month-t-bill-etf-bil",
  },
  SHY: {
    description: "1–3 year U.S. Treasury ETF",
    link: "https://www.ishares.com/us/products/239452/ishares-13-year-treasury-bond-etf",
  },
};
const methods = [
  {
    id: "safety",
    api: "safety_first",
    title: "Tail-risk focus",
    subtitle: "Hierarchical Risk Parity · CVaR",
    detail:
      "Clusters the selected assets and allocates with a historical tail-risk measure.",
  },
  {
    id: "balanced",
    api: "smart_balance",
    title: "Risk-adjusted focus",
    subtitle: "Nested Clustered Optimization",
    detail:
      "Balances historical return and variance estimates within asset clusters.",
  },
  {
    id: "aggressive",
    api: "aggressive_growth",
    title: "Return focus",
    subtitle: "Mean–variance optimization",
    detail:
      "Uses historical average returns with a 60% per-asset cap; highly sensitive to estimation error.",
  },
];
const pct = (value, digits = 1) =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}%` : "—";

function searchAssets(directory, input) {
  const query = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!query) return [];
  const matches = [];
  for (const asset of directory) {
    const symbol = asset.symbol.toLowerCase();
    const name = asset.name.toLowerCase();
    let score = Infinity;
    if (symbol === query) score = 0;
    else if (query.length < 2) continue;
    else if (name === query) score = 1;
    else if (name.startsWith(query)) score = 2;
    else if (symbol.startsWith(query)) score = 3;
    else if (name.includes(` ${query}`)) score = 4;
    else if (name.includes(query)) score = 5;
    if (Number.isFinite(score)) matches.push({ ...asset, score });
  }
  return matches
    .sort((a, b) =>
      a.score - b.score || a.name.length - b.name.length ||
      a.symbol.localeCompare(b.symbol),
    )
    .slice(0, 6);
}

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function Allocation({ weights }) {
  const rows = Object.entries(weights)
    .map(([name, weight], index) => ({
      name,
      value: Number(weight) * 100,
      color: COLORS[index % COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
  const treasuryWeight = rows
    .filter((item) => STARTER.includes(item.name))
    .reduce((sum, item) => sum + item.value, 0);
  return (
    <article className="result-card allocation">
      <div className="card-heading">
        <div>
          <span className="eyebrow">01 / ALLOCATION</span>
          <h3>Model weights</h3>
        </div>
        <span className="muted-small">Sum 100%</span>
      </div>
      <div className="allocation-content">
        <div
          className="donut"
          role="img"
          aria-label={rows
            .map((row) => `${row.name} ${pct(row.value)}`)
            .join(", ")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                innerRadius="69%"
                outerRadius="88%"
                startAngle={90}
                endAngle={-270}
                stroke="#111a1b"
                strokeWidth={3}
                isAnimationActive={false}
              >
                {rows.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => pct(value)}
                contentStyle={{
                  background: "#182526",
                  border: "1px solid #354444",
                  borderRadius: 8,
                  color: "#f7f7f0",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <strong>{pct(treasuryWeight, 0)}</strong>
            <span>Treasury ETFs</span>
          </div>
        </div>
        <div className="weight-list">
          {rows.map((row) => (
            <div className="weight-row" key={row.name}>
              <div>
                <span>
                  <i style={{ background: row.color }} />
                  {row.name}
                </span>
                <strong>{pct(row.value)}</strong>
              </div>
              <div className="weight-track">
                <span
                  style={{
                    width: `${Math.max(0, row.value)}%`,
                    background: row.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="result-note">
        These weights are estimates. Treasury ETFs in the input are not
        guaranteed a minimum allocation.
      </p>
    </article>
  );
}

function Correlation({ data }) {
  if (!data?.labels?.length || !data?.values?.length) return null;
  return (
    <article className="result-card correlation">
      <div className="card-heading">
        <div>
          <span className="eyebrow">03 / RELATIONSHIPS</span>
          <h3>Return correlations</h3>
        </div>
        <span className="muted-small">−1 to +1</span>
      </div>
      <p className="result-description">
        Historical co-movement of daily returns. Correlations can change under
        stress.
      </p>
      <div className="matrix-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              {data.labels.map((name) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.labels.map((name, row) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {data.values[row]?.map((value, col) => (
                  <td key={`${name}-${col}`}>
                    <span
                      style={{
                        background: `${Number(value) >= 0 ? "rgba(167,226,209," : "rgba(175,196,245,"}${0.12 + Math.abs(Number(value)) * 0.68})`,
                      }}
                    >
                      {Number(value).toFixed(2)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function App() {
  const [route, setRoute] = useState(null);
  const [tickers, setTickers] = useState([]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState("");
  const [directory, setDirectory] = useState([]);
  const [directoryStatus, setDirectoryStatus] = useState("loading");
  const [method, setMethod] = useState("safety");
  const [minimum, setMinimum] = useState(false);
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(null);
  const resultsRef = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const request = new AbortController();
    fetch(`${import.meta.env.BASE_URL}symbol-directory.json`, {
      signal: request.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Symbol directory unavailable");
        return response.json();
      })
      .then((data) => {
        setDirectory(
          data.assets.map(([symbol, name, type]) => ({ symbol, name, type })),
        );
        setDirectoryStatus("ready");
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") setDirectoryStatus("error");
      });
    return () => request.abort();
  }, []);
  const selected = methods.find((item) => item.id === method);
  const currentRiskModel =
    result?.risk_metrics?.method === "historical_empirical_daily";
  const treasuryCount = tickers.filter((ticker) =>
    STARTER.includes(ticker),
  ).length;
  const assetBySymbol = useMemo(
    () => new Map(directory.map((asset) => [asset.symbol, asset])),
    [directory],
  );
  const matches = useMemo(() => searchAssets(directory, draft), [directory, draft]);
  const chosenAsset = matches[0];
  const manualSymbol =
    directoryStatus !== "loading" &&
    !chosenAsset &&
    /^[A-Z0-9.^=-]{1,15}$/.test(draft.trim())
      ? draft.trim()
      : null;
  const changeAssets = (next) => {
    setTickers(next);
    setResult(null);
    setSubmitted(null);
    setError("");
  };
  const chooseRoute = (next) => {
    controller.current?.abort();
    setRoute(next);
    setTickers(next === "propose" ? STARTER : []);
    setMethod("safety");
    setDraft("");
    setInputError("");
    setResult(null);
    setSubmitted(null);
    setError("");
    setLoading(false);
  };
  const toggleStarter = (symbol) => {
    if (tickers.includes(symbol)) {
      changeAssets(tickers.filter((ticker) => ticker !== symbol));
    } else if (tickers.length < 10) {
      changeAssets([...tickers, symbol]);
    } else {
      setInputError("The model supports up to 10 assets.");
      return;
    }
    setInputError("");
  };
  const addAssets = (event) => {
    event.preventDefault();
    const symbol = chosenAsset?.symbol || manualSymbol;
    if (!symbol) {
      setInputError("Choose a listed result or enter an exact ticker symbol.");
      return;
    }
    if (tickers.includes(symbol)) {
      setInputError(`${symbol} is already in the list.`);
      return;
    }
    if (tickers.length >= 10) {
      setInputError("The model supports up to 10 assets.");
      return;
    }
    changeAssets([...tickers, symbol]);
    setDraft("");
    setInputError("");
  };
  const analyze = async () => {
    if (tickers.length < 2 || loading) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const snapshot = { tickers: [...tickers], method, minimum };
    setLoading(true);
    setSlow(false);
    setResult(null);
    setError("");
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: snapshot.tickers,
          strategy: methods.find((item) => item.id === snapshot.method).api,
          force_min_weight: snapshot.minimum,
        }),
        signal: requestController.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Analysis service returned ${response.status}.`,
        );
      if (!data.weights || !data.risk_metrics)
        throw new Error(
          "The analysis response was incomplete. Please try again.",
        );
      setResult(data);
      setSubmitted(snapshot);
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch (cause) {
      if (cause.name !== "AbortError")
        setError(cause.message || "Analysis could not be completed.");
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setSlow(false);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top">
          <Mark />
          <span>
            RISK<span>LENS</span>
            <small>PORTFOLIO LAB</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <span className="side-label">WORKSPACE</span>
          <a href="#top">
            <span>◫</span> Overview
          </a>
          <a href="#builder">
            <span>◧</span> Portfolio builder
          </a>
          <a href="#method">
            <span>◎</span> Method & limits
          </a>
        </nav>
        <div className="side-bottom">
          <i /> Research tool <small>Historical models · exploratory</small>
        </div>
      </aside>
      <main id="top">
        <header className="topbar">
          <span className="mobile-brand">
            <Mark /> RISK<span>LENS</span>
          </span>
          <span className="topbar-name">
            PORTFOLIO RESEARCH WORKSPACE <b>/</b> 01
          </span>
          <a href="#method">
            How it works <Arrow />
          </a>
        </header>
        <div className="content">
          <section className="intro">
            <p className="kicker">
              <i /> AN OPEN WORKSPACE FOR PORTFOLIO ANALYSIS
            </p>
            <div className="intro-grid">
              <div>
                <h1>
                  Build with intent.
                  <br />
                  <em>Examine the risk.</em>
                </h1>
                <p>
                  Start with a short-duration U.S. Treasury ETF draft, or
                  assemble your own set of assets. RiskLens estimates an
                  allocation and makes its assumptions visible.
                </p>
              </div>
              <aside>
                <strong>
                  01 <span>/ 03</span>
                </strong>
                <p>
                  Choose a starting point. Add assets you have researched. Then
                  compare the model’s weights and risk estimates.
                </p>
              </aside>
            </div>
          </section>
          <section className="start-section" aria-labelledby="start-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">01 / STARTING POINT</span>
                <h2 id="start-title">How would you like to begin?</h2>
              </div>
              <span>Nothing is purchased or saved.</span>
            </div>
            <div className="routes">
              <button
                type="button"
                className={`route ${route === "propose" ? "selected" : ""}`}
                onClick={() => chooseRoute("propose")}
                aria-pressed={route === "propose"}
              >
                <span className="route-top">
                  <span className="route-icon">↗</span>
                  <small>01</small>
                </span>
                <strong>Propose a starting portfolio</strong>
                <p>
                  Begin with two Treasury ETF exposures. Add medium or
                  higher-risk assets only after your own research.
                </p>
                <span className="route-bottom">
                  BIL + SHY prefilled <Arrow />
                </span>
              </button>
              <button
                type="button"
                className={`route ${route === "scratch" ? "selected" : ""}`}
                onClick={() => chooseRoute("scratch")}
                aria-pressed={route === "scratch"}
              >
                <span className="route-top">
                  <span className="route-icon alternate">＋</span>
                  <small>02</small>
                </span>
                <strong>Start from scratch</strong>
                <p>
                  Bring your own tickers and build an analysis set from a blank
                  workspace.
                </p>
                <span className="route-bottom">
                  No assets preselected <Arrow />
                </span>
              </button>
            </div>
          </section>
          {route && (
            <section
              id="builder"
              className="builder-section"
              aria-labelledby="builder-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">02 / BUILD</span>
                  <h2 id="builder-title">Define the analysis set.</h2>
                </div>
                <span>{tickers.length} of 10 assets</span>
              </div>
              <div className="builder-grid">
                <div className="builder-main">
                  <div className="panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">SELECTED ASSETS</span>
                        <h3>
                          {route === "propose"
                            ? "Treasury-focused draft"
                            : "Your asset list"}
                        </h3>
                      </div>
                      <span>{String(tickers.length).padStart(2, "0")}</span>
                    </div>
                    {route === "propose" && (
                      <div className="draft-note">
                        <b>i</b>
                        <p>
                          BIL and SHY are{" "}
                          <strong>ETFs holding U.S. Treasury securities</strong>
                          , not individual Treasury bills. They carry
                          interest-rate, fund and—outside USD—currency risk.
                          This is a research starting point, not a portfolio
                          recommendation.
                        </p>
                      </div>
                    )}
                    {route === "propose" && (
                      <div className="treasury-options" aria-label="Treasury ETF choices">
                        <span className="eyebrow">TREASURY BUILDING BLOCKS</span>
                        <div className="treasury-options-grid">
                          {STARTER.map((symbol) => {
                            const active = tickers.includes(symbol);
                            return (
                              <button
                                type="button"
                                key={symbol}
                                className={`treasury-option ${active ? "selected" : ""}`}
                                onClick={() => toggleStarter(symbol)}
                                aria-pressed={active}
                                aria-label={`${active ? "Remove" : "Add"} ${symbol} ${funds[symbol].description}`}
                              >
                                <span>
                                  <strong>{symbol}</strong>
                                  <small>{funds[symbol].description}</small>
                                </span>
                                <span className="treasury-option-action">
                                  {active ? "✓ Added" : "+ Add"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="assets">
                      {tickers.length ? (
                        tickers.map((ticker, index) => (
                          <div className="asset" key={ticker}>
                            <span className="asset-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <strong>{ticker}</strong>
                              <small>
                                {funds[ticker]?.description ||
                                  assetBySymbol.get(ticker)?.name ||
                                  "Symbol not in directory · verify before analysis"}
                              </small>
                            </div>
                            <span
                              className={`tag ${funds[ticker] ? "treasury" : ""}`}
                            >
                              {funds[ticker] ? "Treasury ETF" : "Your research"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                changeAssets(
                                  tickers.filter((item) => item !== ticker),
                                )
                              }
                              aria-label={`Remove ${ticker}`}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="empty-assets">
                          Your list is empty. Add at least two assets to
                          analyze.
                        </p>
                      )}
                    </div>
                    <form onSubmit={addAssets} className="add-form">
                      <label htmlFor="ticker">Find a company or ticker</label>
                      <div className="lookup-entry">
                        <input
                          id="ticker"
                          value={draft}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setInputError("");
                          }}
                          placeholder="e.g. Apple, MU or BTC-USD"
                          autoComplete="off"
                          aria-describedby="ticker-help ticker-error"
                        />
                        <button
                          type="submit"
                          disabled={
                            tickers.length >= 10 ||
                            (!chosenAsset && !manualSymbol) ||
                            tickers.includes(chosenAsset?.symbol || manualSymbol)
                          }
                        >
                          Add {chosenAsset?.symbol || manualSymbol || "asset"} <span>＋</span>
                        </button>
                      </div>
                      {draft.trim() && directoryStatus === "loading" && (
                        <p className="lookup-feedback" role="status">
                          Loading the listed-symbol directory…
                        </p>
                      )}
                      {draft.trim() && directoryStatus === "error" && (
                        <p className="lookup-feedback" role="status">
                          Directory unavailable. Exact tickers can still be added without name confirmation.
                        </p>
                      )}
                      {chosenAsset && (
                        <div className="lookup-feedback matched" role="status">
                          <span>TOP MATCH</span>
                          <strong>{chosenAsset.symbol} · {chosenAsset.name}</strong>
                          <small>{chosenAsset.type} · price history checked when you analyze</small>
                        </div>
                      )}
                      {matches.length > 1 && (
                        <div className="asset-suggestions" aria-label="Other listed matches">
                          <span>OTHER MATCHES</span>
                          {matches.slice(1).map((asset) => (
                            <button
                              type="button"
                              key={asset.symbol}
                              onClick={() => {
                                setDraft(asset.symbol);
                                setInputError("");
                              }}
                            >
                              <b>{asset.symbol}</b>
                              <span>{asset.name}</span>
                              <small>{asset.type}</small>
                            </button>
                          ))}
                        </div>
                      )}
                      {manualSymbol && (
                        <p className="lookup-feedback unverified" role="status">
                          {manualSymbol} is not in the listed-symbol directory. You may add it as an unverified ticker; market data is checked during analysis.
                        </p>
                      )}
                      {draft.trim() && directoryStatus === "ready" && !chosenAsset && !manualSymbol && (
                        <p className="lookup-feedback" role="status">
                          No listed match. Try a company name or exact ticker.
                        </p>
                      )}
                      <small id="ticker-help">
                        Add one asset at a time. Matches come from a Nasdaq Trader
                        listing snapshot; availability is checked when you analyze.
                      </small>
                      {inputError && (
                        <p
                          id="ticker-error"
                          className="field-error"
                          role="alert"
                        >
                          {inputError}
                        </p>
                      )}
                    </form>
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">MODEL SETTINGS</span>
                        <h3>Allocation method</h3>
                      </div>
                    </div>
                    <div
                      className="methods"
                      role="radiogroup"
                      aria-label="Allocation method"
                    >
                      {methods.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          role="radio"
                          aria-checked={method === item.id}
                          className={method === item.id ? "active" : ""}
                          onClick={() => {
                            setMethod(item.id);
                            setResult(null);
                            setSubmitted(null);
                          }}
                        >
                          <i />
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.subtitle}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="method-detail">{selected.detail}</p>
                    <label className="checkline">
                      <input
                        type="checkbox"
                        checked={minimum}
                        onChange={(event) => {
                          setMinimum(event.target.checked);
                          setResult(null);
                          setSubmitted(null);
                        }}
                      />
                      <span>
                        <strong>Request a 5% minimum per asset</strong>
                        <small>
                          Applies when feasible; it cannot guarantee future
                          holdings.
                        </small>
                      </span>
                    </label>
                  </div>
                </div>
                <aside className="summary">
                  <span className="eyebrow">YOUR RESEARCH SET</span>
                  <div className="summary-count">
                    <strong>{String(tickers.length).padStart(2, "0")}</strong>
                    <span>
                      ASSETS
                      <br />
                      SELECTED
                    </span>
                  </div>
                  <div className="summary-line">
                    <span>Treasury ETF inputs</span>
                    <b>{treasuryCount}</b>
                  </div>
                  <div className="summary-line">
                    <span>Other inputs</span>
                    <b>{tickers.length - treasuryCount}</b>
                  </div>
                  <div className="summary-line">
                    <span>Selected method</span>
                    <b>{selected.title}</b>
                  </div>
                  <button
                    type="button"
                    className="run"
                    onClick={analyze}
                    disabled={tickers.length < 2 || loading}
                  >
                    {loading ? "Analyzing…" : "Run analysis"} <Arrow />
                  </button>
                  {tickers.length < 2 && (
                    <p className="summary-hint">
                      Add {2 - tickers.length} more asset
                      {tickers.length === 1 ? "" : "s"} to continue.
                    </p>
                  )}
                  {slow && (
                    <p className="summary-hint" role="status">
                      The analysis service is waking up. This may take a moment.
                    </p>
                  )}
                  {error && (
                    <p className="analysis-error" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="summary-disclaimer">
                    Medium and higher-risk assets are chosen by you. Do your own
                    research (DYOR) before adding them.
                  </p>
                </aside>
              </div>
            </section>
          )}
          {result && submitted && (
            <section
              id="results"
              ref={resultsRef}
              className="results-section"
              aria-labelledby="results-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">03 / RESULTS</span>
                  <h2 id="results-title">Read the allocation.</h2>
                </div>
                <span>{submitted.tickers.join(" · ")}</span>
              </div>
              <div className="results-banner">
                <span>
                  <i /> Analysis complete
                </span>
                <p>
                  These figures are estimated from historical prices. They are a
                  model output, not a prediction or an instruction to trade.
                </p>
              </div>
              {!currentRiskModel && (
                <p className="legacy-notice" role="status">
                  The connected API is still running the earlier risk model.
                  Volatility, VaR and shortfall are hidden until the updated
                  backend is deployed.
                </p>
              )}
              <div className="results-grid">
                <Allocation weights={result.weights} />
                <article className="result-card risk">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">02 / ESTIMATED RISK</span>
                      <h3>One-day risk view</h3>
                    </div>
                  </div>
                  <div className="metrics">
                    <div>
                      <span>DAILY VOLATILITY</span>
                      <strong>
                        {currentRiskModel
                          ? pct(result.risk_metrics.volatility, 2)
                          : "—"}
                      </strong>
                      <p>Estimated one-day return variability.</p>
                    </div>
                    <div>
                      <span>VALUE AT RISK · 95%</span>
                      <strong>
                        {currentRiskModel
                          ? pct(result.risk_metrics.VaR_95, 2)
                          : "—"}
                      </strong>
                      <p>Estimated one-day loss threshold at the 95% level.</p>
                    </div>
                    <div>
                      <span>EXPECTED SHORTFALL · 95%</span>
                      <strong>
                        {currentRiskModel
                          ? pct(result.risk_metrics.ES_95, 2)
                          : "—"}
                      </strong>
                      <p>
                        Estimated average loss in the worst 5% of modeled days.
                      </p>
                    </div>
                  </div>
                  <p className="result-note">
                    VaR and shortfall are model-dependent; actual losses can
                    exceed both.
                  </p>
                </article>
                <Correlation data={result.correlation_matrix} />
                <article className="result-card context">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">04 / CONTEXT</span>
                      <h3>Model context</h3>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Input period</dt>
                      <dd>
                        {result.sample
                          ? `${result.sample.start} to ${result.sample.end} · ${result.sample.observations} days`
                          : "Up to five years of daily prices"}
                      </dd>
                    </div>
                    <div>
                      <dt>Price source</dt>
                      <dd>Yahoo Finance via yfinance</dd>
                    </div>
                    <div>
                      <dt>Risk estimate</dt>
                      <dd>
                        {result.risk_metrics.method ===
                        "historical_empirical_daily"
                          ? "Historical daily distribution"
                          : "GARCH / historical fallback"}
                      </dd>
                    </div>
                    <div>
                      <dt>Regime indicator</dt>
                      <dd>
                        {result.market_status?.message || "Unavailable"}{" "}
                        <small>· heuristic, not a forecast</small>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {result.optimization_method
                          ? "Optimization used"
                          : "Optimization requested"}
                      </dt>
                      <dd>
                        {result.optimization_method ||
                          methods.find((item) => item.id === submitted.method)
                            ?.subtitle}
                      </dd>
                    </div>
                  </dl>
                  <p className="result-note">
                    The model excludes taxes, trading costs, suitability and
                    your base currency. ETF prices may not fully capture
                    distributions in every data feed.
                  </p>
                </article>
              </div>
            </section>
          )}
          <section id="method" className="method-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">METHOD / LIMITS</span>
                <h2>Know what is being modeled.</h2>
              </div>
            </div>
            <div className="method-grid">
              <article>
                <span>01</span>
                <h3>Historical inputs</h3>
                <p>
                  The service downloads up to five years of daily adjusted
                  prices, estimates returns and correlations, then applies the
                  selected allocation method.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>Treasury draft</h3>
                <p>
                  The proposed set starts with BIL (1–3 months) and SHY (1–3
                  years). These are U.S.-listed Treasury ETFs; their prices and
                  yields can change.
                </p>
                <a href={funds.BIL.link} target="_blank" rel="noreferrer">
                  BIL fund page <Arrow />
                </a>
                <a href={funds.SHY.link} target="_blank" rel="noreferrer">
                  SHY fund page <Arrow />
                </a>
              </article>
              <article>
                <span>03</span>
                <h3>Your decisions</h3>
                <p>
                  The app does not select medium or high-risk assets for you.
                  Historical optimization can overfit, and estimates are not
                  personalized investment advice.
                </p>
                <a
                  href="https://www.investor.gov/introduction-investing/investing-basics/glossary/bond-funds-and-income-funds"
                  target="_blank"
                  rel="noreferrer"
                >
                  Bond fund risks <Arrow />
                </a>
              </article>
            </div>
          </section>
        </div>
        <footer>
          <span>
            RISK<span>LENS</span> © 2026
          </span>
          <span>Portfolio research, with assumptions in view.</span>
          <a href="#top">Back to top ↑</a>
        </footer>
      </main>
    </div>
  );
}
export default App;
