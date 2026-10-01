import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  LoaderCircle,
  Minus,
  RotateCcw,
} from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { assetFor, displaySymbol, formatPrice } from "../lib/assets";
import { BREADTH_MEASURES, breadthSummary, dailyBreadth } from "../lib/breadth";
import type { HistoryResponse, Watchlist } from "../lib/types";

interface LoadResult {
  history?: HistoryResponse;
  error?: string;
}
const dateLabel = (time: number) =>
  new Date(time * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default function BreadthDialog({
  lists,
  activeId,
  dataMode,
  lookback,
  setLookback,
  onClose,
}: {
  lists: Watchlist[];
  activeId: string;
  dataMode: string;
  lookback: number;
  setLookback: (value: number) => void;
  onClose: () => void;
}) {
  const [listId, setListId] = useState(activeId);
  const [results, setResults] = useState<Record<string, LoadResult>>({});
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showNames, setShowNames] = useState(false);
  const list = lists.find((item) => item.id === listId) || lists[0];
  const symbolsKey = JSON.stringify([...new Set(list.symbols)]);
  useEffect(() => {
    const controller = new AbortController();
    const symbols: string[] = JSON.parse(symbolsKey);
    setResults({});
    setLoading(symbols.length > 0);
    // Bound concurrent history requests; scan only when the dialog is opened.
    (async () => {
      for (
        let offset = 0;
        offset < symbols.length && !controller.signal.aborted;
        offset += 4
      ) {
        await Promise.all(
          symbols.slice(offset, offset + 4).map(async (symbol) => {
            let result: LoadResult;
            try {
              result = {
                history: await api.history(
                  symbol,
                  "1D",
                  controller.signal,
                  refresh > 0,
                ),
              };
            } catch (reason) {
              result = {
                error:
                  reason instanceof Error
                    ? reason.message
                    : "History unavailable",
              };
            }
            if (!controller.signal.aborted)
              setResults((old) => ({ ...old, [symbol]: result }));
          }),
        );
      }
      if (!controller.signal.aborted) setLoading(false);
    })();
    return () => controller.abort();
  }, [symbolsKey, refresh]);
  const symbols: string[] = JSON.parse(symbolsKey);
  const assessed = useMemo(
    () =>
      symbols.map((symbol) => {
        const result = results[symbol];
        const excludedSample =
          result?.history?.source === "demo" && dataMode !== "demo";
        const observation =
          result?.history && !excludedSample
            ? dailyBreadth(result.history.bars, lookback)
            : null;
        return { symbol, result, observation, excludedSample };
      }),
    [symbolsKey, results, dataMode, lookback],
  );
  const summary = breadthSummary(
    assessed.flatMap((item) => (item.observation ? [item.observation] : [])),
  );
  const completed = Object.keys(results).length;
  const excluded = assessed.filter(
    (item) => item.excludedSample || item.result?.error,
  ).length;
  const cachedWarnings = assessed.filter(
    (item) =>
      item.result?.history?.warning &&
      !item.excludedSample &&
      item.result.history.source !== "demo",
  ).length;
  const timestamps = assessed.flatMap((item) =>
    item.observation?.time ? [item.observation.time] : [],
  );
  const oldest = timestamps.length ? Math.min(...timestamps) : null;
  const newest = timestamps.length ? Math.max(...timestamps) : null;
  return (
    <Modal
      title="Jordi Visser indicators"
      subtitle="Breadth and trend across your watchlist"
      onClose={onClose}
      className="breadth-modal"
    >
      <div className="breadth-controls">
        <label>
          Watchlist
          <select
            aria-label="Breadth watchlist"
            value={list.id}
            onChange={(event) => setListId(event.target.value)}
          >
            {lists.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rising compared with
          <select
            aria-label="Rising comparison"
            value={lookback}
            onChange={(event) => setLookback(Number(event.target.value))}
          >
            <option value={1}>Previous daily bar</option>
            <option value={5}>5 daily bars ago</option>
            <option value={20}>20 daily bars ago</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={loading || !symbols.length}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RotateCcw size={15} />
          Refresh
        </button>
      </div>
      <div className="breadth-scan-status" aria-live="polite">
        {loading ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Activity size={16} />
        )}
        <span>
          {symbols.length === 0
            ? "This watchlist is empty. Add names to measure breadth."
            : loading
              ? `Loading daily history · ${completed} / ${symbols.length} names`
              : `${completed} / ${symbols.length} names assessed`}
          {excluded > 0 ? ` · ${excluded} unavailable` : ""}
        </span>
        {oldest !== null && newest !== null && (
          <span className="breadth-date">
            Daily bars: {dateLabel(oldest)}
            {oldest !== newest ? ` – ${dateLabel(newest)}` : ""}
          </span>
        )}
      </div>
      {dataMode === "demo" && (
        <p className="breadth-notice">
          Synthetic samples · these breadth readings use generated prices.
        </p>
      )}
      {cachedWarnings > 0 && (
        <p className="breadth-notice">
          {cachedWarnings} names include provider warnings. Open “Show names” to
          inspect the sources and dates.
        </p>
      )}
      <div className="breadth-table-wrap">
        <table className="breadth-table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Names</th>
              <th scope="col">Percentage</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.passing} / {row.eligible}
                </td>
                <td>
                  <div className="breadth-percentage">
                    <strong>
                      {row.percentage === null
                        ? "—"
                        : `${row.percentage.toFixed(1)}%`}
                    </strong>
                    <span className="breadth-track" aria-hidden="true">
                      <span style={{ width: `${row.percentage ?? 0}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="breadth-method">
        <p>
          Uses simple averages of 50 and 200 daily closes. “Rising” means the
          average is higher than the selected comparison bar. The latest daily
          candle may still be forming.
        </p>
        <p>
          Counts use eligible names for each measure. Missing history and
          live-mode synthetic fallbacks are excluded
          {loading ? "; results are partial while loading" : ""}.
        </p>
      </div>
      <button
        className="breadth-details-toggle"
        aria-expanded={showNames}
        onClick={() => setShowNames(!showNames)}
      >
        <ChevronDown
          size={16}
          style={{ transform: showNames ? "rotate(180deg)" : undefined }}
        />
        {showNames ? "Hide names" : "Show names"}
      </button>
      {showNames && (
        <div className="breadth-details-wrap">
          <table className="breadth-details">
            <thead>
              <tr>
                <th scope="col">Name / data</th>
                {BREADTH_MEASURES.map((measure) => (
                  <th scope="col" key={measure.key}>
                    {measure.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessed.map((item) => (
                <tr key={item.symbol}>
                  <th scope="row">
                    <strong>{displaySymbol(item.symbol)}</strong>
                    <span>{assetFor(item.symbol).name}</span>
                    <small>
                      {item.excludedSample
                        ? "Sample fallback excluded"
                        : item.result?.error
                          ? item.result.error
                          : item.result?.history
                            ? `${item.result.history.source} · ${item.observation?.time ? dateLabel(item.observation.time) : "No daily bars"}${item.result.history.cached ? " · cached" : ""}`
                            : "Pending"}
                    </small>
                    {item.observation?.close !== null && item.observation && (
                      <small>
                        Close {formatPrice(item.observation.close)} · SMA 50{" "}
                        {formatPrice(item.observation.sma50 ?? undefined)} · SMA
                        200 {formatPrice(item.observation.sma200 ?? undefined)}
                      </small>
                    )}
                    {item.result?.history?.warning && (
                      <small className="breadth-name-warning">
                        {item.result.history.warning}
                      </small>
                    )}
                  </th>
                  {BREADTH_MEASURES.map((measure) => {
                    const signal = item.observation?.signals[measure.key];
                    return (
                      <td
                        key={measure.key}
                        aria-label={
                          signal === undefined || signal === null
                            ? "Insufficient or unavailable history"
                            : signal
                              ? "Yes"
                              : "No"
                        }
                        className={signal === true ? "positive" : ""}
                      >
                        {signal === true ? (
                          <Check size={19} />
                        ) : signal === false ? (
                          <Minus size={19} />
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
