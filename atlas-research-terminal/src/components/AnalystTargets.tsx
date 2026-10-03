import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Info,
  LoaderCircle,
  RotateCcw,
  Search,
  Target,
} from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import {
  analystDate,
  analystPrice,
  filterAnalystCalls,
  ratingTone,
} from "../lib/analysts";
import type { AnalystScope, AnalystTargetsResponse } from "../lib/analysts";
import type { Asset } from "../lib/types";

const SOURCE_NAMES = { stockanalysis: "Stock Analysis", finviz: "Finviz" };

export default function AnalystTargets({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const [data, setData] = useState<AnalystTargetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AnalystScope>("all");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData((old) => (old?.symbol === asset.symbol ? old : null));
    api
      .analystTargets(asset.symbol, controller.signal, refresh > 0)
      .then((response) => {
        if (response.symbol !== asset.symbol)
          throw new Error(
            "The source returned a different stock. Please refresh.",
          );
        if (!controller.signal.aborted) setData(response);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Analyst targets could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [asset.symbol, refresh]);

  const records = data?.symbol === asset.symbol ? data.records : [];
  const named = records.filter((call) => call.analyst).length;
  const shown = useMemo(
    () => filterAnalystCalls(records, query, scope, order),
    [records, query, scope, order],
  );
  const canRefresh = data?.status !== "unsupported" && data?.status !== "demo";

  return (
    <Modal
      title="Analyst targets"
      subtitle={`${asset.symbol} · ${asset.name}`}
      onClose={onClose}
      className="analyst-modal"
    >
      <div className="analyst-content">
        <div className="analyst-intro">
          <div className="analyst-intro-icon">
            <Target size={22} />
          </div>
          <div>
            <strong>Who said what, and when.</strong>
            <p>
              Recent public ratings and price targets for the stock on your
              chart.
            </p>
          </div>
          {canRefresh && (
            <button
              className="secondary-button analyst-refresh"
              aria-label="Refresh"
              onClick={() => setRefresh((n) => n + 1)}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              <span>Refresh</span>
            </button>
          )}
        </div>

        {error && (
          <div className="analyst-notice" role="alert">
            <Info size={16} />
            <span>
              {error}
              {records.length > 0
                ? " Previously loaded calls remain below."
                : ""}
            </span>
          </div>
        )}
        {data?.warning && (
          <div className="analyst-notice" role="status">
            <Info size={16} />
            <span>{data.warning}</span>
          </div>
        )}

        {records.length > 0 && (
          <>
            <div className="analyst-controls">
              <div
                className="analyst-scopes"
                aria-label="Analyst call coverage"
              >
                {(
                  [
                    ["all", "All calls", records.length],
                    ["named", "Named analysts", named],
                    ["firms", "Firm history", records.length - named],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    className={scope === value ? "active" : ""}
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <div className="analyst-filter-row">
                <label className="analyst-search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search analyst, firm or rating…"
                    aria-label="Search analyst calls"
                  />
                </label>
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as typeof order)}
                  aria-label="Sort analyst calls"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            <div className="analyst-table-wrap" aria-busy={loading}>
              <table className="analyst-table">
                <caption className="sr-only">
                  Published analyst calls for {asset.symbol}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Published</th>
                    <th scope="col">Analyst / firm</th>
                    <th scope="col">Call / rating</th>
                    <th scope="col">Price target · USD</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((call) => (
                    <tr key={call.id}>
                      <td className="analyst-date">
                        <time dateTime={call.date}>
                          {analystDate(call.date)}
                        </time>
                      </td>
                      <td className="analyst-person">
                        <strong>{call.analyst || call.firm}</strong>
                        <span>
                          {call.analyst
                            ? call.firm
                            : "Individual name not supplied"}
                        </span>
                      </td>
                      <td className="analyst-call">
                        <span
                          className={`analyst-rating ${ratingTone(call.rating)}`}
                        >
                          {call.rating || "Rating not supplied"}
                        </span>
                        <span className="analyst-action">
                          {call.action || "Action not supplied"}
                          {call.prior_rating && (
                            <> · from {call.prior_rating}</>
                          )}
                        </span>
                      </td>
                      <td className="analyst-target">
                        {call.prior_target !== null && (
                          <span className="analyst-prior">
                            {analystPrice(call.prior_target, call.currency)}
                            <ArrowRight size={13} />
                          </span>
                        )}
                        <strong
                          className={
                            call.price_target === null ? "analyst-missing" : ""
                          }
                        >
                          {analystPrice(call.price_target, call.currency)}
                        </strong>
                      </td>
                      <td className="analyst-source">
                        <a
                          href={call.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${call.firm}'s ${call.date} call on ${SOURCE_NAMES[call.source]}`}
                        >
                          {SOURCE_NAMES[call.source]}
                          <ExternalLink size={13} />
                        </a>
                        {call.analyst_url && (
                          <a
                            className="analyst-profile"
                            href={call.analyst_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Analyst profile
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 && (
                <div className="analyst-empty">
                  <Search size={26} />
                  <strong>No matching calls</strong>
                  <p>Try a different name, firm or rating.</p>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setQuery("");
                      setScope("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {!records.length && (
          <div className="analyst-empty" role="status">
            {loading ? (
              <LoaderCircle size={28} className="spin" />
            ) : (
              <Target size={28} />
            )}
            <strong>
              {loading
                ? "Looking up published calls…"
                : data?.status === "unsupported"
                  ? "No coverage for this asset"
                  : data?.status === "demo"
                    ? "Published research needs live mode"
                    : "No analyst calls to show"}
            </strong>
            <p>
              {loading
                ? "Checking public analyst sources for this stock."
                : data?.message ||
                  error ||
                  "Try refreshing the public sources."}
            </p>
          </div>
        )}

        {data && data.sources.length > 0 && (
          <div className="analyst-provenance">
            {data.retrieved_at !== null && (
              <div className="analyst-retrieved">
                <span>
                  {shown.length} of {records.length} calls
                  {data.stale
                    ? " · Stale cache"
                    : data.cached
                      ? " · Cached"
                      : ""}
                </span>
                <span>
                  Retrieved{" "}
                  {new Date(data.retrieved_at * 1000).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            )}
            {data.sources.length > 0 && (
              <div className="analyst-source-list">
                {data.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={source.message}
                    className={
                      source.status === "unavailable" ? "unavailable" : ""
                    }
                  >
                    <span className="analyst-source-dot" />
                    {source.name}
                    <span>
                      {source.status === "unavailable"
                        ? "Unavailable"
                        : `${source.count} calls`}
                    </span>
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            )}
            <p>
              <Info size={14} />
              <span>
                {data.coverage} Firm-only entries do not identify a person.
                Ratings and dates are shown as each source reports them; source
                links open the published table.
              </span>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
