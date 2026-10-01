import { useEffect, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { formatPercent } from "../lib/assets";
import { periodReturns } from "../lib/returns";
import type { HistoryResponse } from "../lib/types";

const dateLabel = (time: number) =>
  new Date(time * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Mounted only when the user opens Returns; longer history is fetched on demand. */
export default function ReturnsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .history(symbol, "1D", controller.signal, attempt > 0, 10)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Returns could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [symbol, attempt]);
  if (error)
    return (
      <div className="returns-status">
        <span>{error}</span>
        <button
          className="secondary-button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RotateCcw size={15} />
          Retry
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="returns-status" role="status">
        <LoaderCircle size={20} className="spin" />
        Loading daily history for returns…
      </div>
    );
  const latest = data.bars.at(-1);
  return (
    <div className="returns-content">
      <div className="returns-caption">
        <strong>Price returns</strong>
        <span>
          {latest ? `Through ${dateLabel(latest.time)} · ` : ""}
          {data.source === "demo" ? "Synthetic sample" : data.source}
          {data.cached ? " · cached" : ""}
        </span>
      </div>
      <div className="returns-grid">
        {periodReturns(data.bars).map((result) => (
          <div
            className="return-cell"
            key={result.period}
            title={
              result.baselineTime === null
                ? "Insufficient history for this period"
                : `Compared with the close on ${dateLabel(result.baselineTime)}`
            }
          >
            <span>{result.period}</span>
            <strong
              className={
                result.percent === null
                  ? ""
                  : result.percent >= 0
                    ? "positive"
                    : "negative"
              }
            >
              {formatPercent(result.percent ?? undefined)}
            </strong>
          </div>
        ))}
      </div>
      <p className="returns-footnote">
        Daily closes · excludes dividends · — means insufficient history. The
        latest daily candle may still be forming.
      </p>
      {data.warning && <p className="returns-warning">{data.warning}</p>}
    </div>
  );
}
