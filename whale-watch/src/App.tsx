import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import type {
  Calendar,
  Catalog,
  Fund,
  Portfolio,
  Status,
  Universe,
  WeightedPosition,
} from "./types";
import {
  STATUS_LABEL,
  UNIVERSE_LABEL,
  countdown,
  dateLabel,
  downloadCsv,
  getJson,
  money,
  percent,
  points,
  quantity,
  quarterLabel,
  segments,
  shortName,
  timestamp,
  weighted,
} from "./lib";

function Avatar({ fund, large = false }: { fund: Fund; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      style={{ "--fund": fund.color } as CSSProperties}
    >
      {failed ? (
        <span>
          {fund.person
            .split(" ")
            .map((n) => n[0])
            .join("")}
        </span>
      ) : (
        <img
          src={fund.portrait}
          alt={fund.person}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = panel.current?.querySelectorAll<HTMLElement>(
          'button,a[href],select,input,[tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilingClock({
  calendar,
  onOpen,
  onExpired,
}: {
  calendar: Calendar;
  onOpen: () => void;
  onExpired: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const time = countdown(calendar.next.deadline, now);
  const expired = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (time.expired && !expired.current) {
      expired.current = true;
      onExpired();
    }
  }, [time.expired, onExpired]);
  return (
    <button
      className="deadline-card"
      onClick={onOpen}
      aria-label="View next 13F filing deadlines"
    >
      <div className="deadline-label">
        <CalendarDays size={15} />
        <span>Next 13F deadline</span>
        <ArrowUpRight size={15} />
      </div>
      <div className="deadline-value">
        <span>{time.expired ? "Due now" : `${time.days}d`}</span>
        <small>
          {String(time.hours).padStart(2, "0")}h{" "}
          {String(time.minutes).padStart(2, "0")}m{" "}
          {String(time.seconds).padStart(2, "0")}s
        </small>
      </div>
      <div className="deadline-date">
        {quarterLabel(calendar.next.quarter)} <span>·</span>{" "}
        {dateLabel(calendar.next.date)}
      </div>
    </button>
  );
}

function Donut({
  rows,
  onSelect,
}: {
  rows: WeightedPosition[];
  onSelect: (row: WeightedPosition | null) => void;
}) {
  const pieces = useMemo(() => segments(rows), [rows]);
  const [hover, setHover] = useState<string | null>(null);
  const selected = pieces.find((p) => p.id === hover);
  const total = pieces.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <div className="allocation-layout">
      <div className="donut-wrap">
        <svg
          className="donut"
          viewBox="0 0 250 250"
          aria-label="Holdings allocation chart"
        >
          <circle
            cx="125"
            cy="125"
            r="91"
            fill="none"
            stroke="#202a37"
            strokeWidth="33"
          />
          {pieces.map((piece) => {
            const start = offset;
            offset += piece.weight;
            return (
              <circle
                key={piece.id}
                cx="125"
                cy="125"
                r="91"
                fill="none"
                stroke={piece.color}
                strokeWidth={hover === piece.id ? 38 : 33}
                pathLength="100"
                strokeDasharray={`${Math.max(0, piece.weight - 0.35)} ${100 - Math.max(0, piece.weight - 0.35)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 125 125)"
                className="donut-segment"
                style={{ opacity: hover && hover !== piece.id ? 0.8 : 1 }}
                role="button"
                tabIndex={0}
                aria-label={`${piece.label}, ${percent(piece.weight)}${piece.id === "other" ? "" : ", filter holdings"}`}
                onMouseEnter={() => setHover(piece.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(piece.id)}
                onBlur={() => setHover(null)}
                onClick={() =>
                  onSelect(piece.id === "other" ? null : piece.row)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(piece.id === "other" ? null : piece.row);
                  }
                }}
              >
                <title>
                  {piece.id === "other"
                    ? `${piece.label}: ${percent(piece.weight)} of reported value. These are known holdings outside the top ten; all their details are in the table below.`
                    : `${piece.row.issuer}: ${percent(piece.weight)} of reported value`}
                </title>
              </circle>
            );
          })}
        </svg>
        <div className="donut-center">
          <small>{selected ? selected.label : "Reported value"}</small>
          <strong>{selected ? percent(selected.weight) : money(total)}</strong>
          <span>{selected ? money(selected.value) : "USD · reported"}</span>
        </div>
      </div>
      <div className="allocation-legend">
        {pieces.map((piece) => (
          <button
            key={piece.id}
            className={`legend-row ${hover === piece.id ? "highlight" : ""}`}
            onMouseEnter={() => setHover(piece.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(piece.id)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(piece.id === "other" ? null : piece.row)}
            title={
              piece.id === "other"
                ? `${piece.label}: known holdings outside the top ten. Select to show all holdings in the table.`
                : `${piece.row.issuer} · filter holdings`
            }
          >
            <span className="legend-dot" style={{ background: piece.color }} />
            <span className="legend-name">{piece.label}</span>
            <span className="number">{percent(piece.weight)}</span>
          </button>
        ))}
        {!pieces.length && (
          <p className="empty-inline">
            No holdings of this type in the report.
          </p>
        )}
      </div>
    </div>
  );
}

function Change({
  value,
  unit = "percent",
}: {
  value: number | null;
  unit?: "percent" | "points";
}) {
  return (
    <span
      className={`number ${value !== null && value > 0 ? "positive" : value !== null && value < 0 ? "negative" : "muted"}`}
    >
      {unit === "points" ? points(value) : percent(value, true)}
    </span>
  );
}

function PortfolioView({
  portfolio,
  universe,
  setUniverse,
}: {
  portfolio: Portfolio;
  universe: Universe;
  setUniverse: (u: Universe) => void;
}) {
  const [tab, setTab] = useState<"holdings" | "changes">("holdings");
  const [status, setStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => weighted(portfolio.rows, universe),
    [portfolio, universe],
  );
  const current = rows.filter((r) => r.present);
  const total = current.reduce((s, r) => s + r.value, 0);
  const previousTotal = rows.reduce((s, r) => s + r.previousValue, 0);
  const top5 = current
    .toSorted((a, b) => b.value - a.value)
    .slice(0, 5)
    .reduce((s, r) => s + r.weight, 0);
  const counts = Object.fromEntries(
    ["new", "added", "trimmed", "exited", "unchanged"].map((s) => [
      s,
      rows.filter((r) => r.status === s).length,
    ]),
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          (tab === "holdings" ? row.present : row.status !== "unchanged") &&
          (status === "all" || row.status === status) &&
          (!query ||
            `${row.symbol ?? ""} ${row.issuer} ${row.cusip} ${row.class}`
              .toLowerCase()
              .includes(query)),
      )
      .toSorted((a, b) =>
        sort === "change"
          ? (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)
          : sort === "weightChange"
            ? (b.weightChange ?? -Infinity) - (a.weightChange ?? -Infinity)
            : sort === "name"
              ? (a.symbol || a.issuer).localeCompare(b.symbol || b.issuer)
              : (tab === "holdings"
                  ? b.value
                  : Math.max(b.value, b.previousValue)) -
                (tab === "holdings"
                  ? a.value
                  : Math.max(a.value, a.previousValue)),
      );
  }, [rows, search, sort, tab, status]);
  const pages = Math.ceil(filtered.length / 50);
  const activePage = Math.min(page, Math.max(0, pages - 1));
  const pageRows = filtered.slice(activePage * 50, activePage * 50 + 50);
  useEffect(() => {
    setPage(0);
    setDetail(null);
  }, [search, status, tab, universe, portfolio]);
  const moves = current
    .filter((r) => r.status === "new" || r.status === "added")
    .toSorted((a, b) => b.value - a.value)
    .slice(0, 3);
  function focusHolding(row: WeightedPosition | null) {
    setSearch(row?.cusip ?? "");
    setStatus("all");
    setTab("holdings");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function focusStatus(s: Status | "all") {
    setStatus(s);
    setTab("changes");
    setSearch("");
  }
  const showOptions =
    universe === "all" || universe === "call" || universe === "put";
  return (
    <>
      {portfolio.stale && (
        <div className="notice amber">
          <Info size={17} />
          <span>
            Showing cached filings. The provider could not be reached; refresh
            to retry. Retrieved {timestamp(portfolio.current.retrievedAt)}.
          </span>
        </div>
      )}
      {portfolio.warning && (
        <div className="notice amber">
          <Info size={17} />
          <span>{portfolio.warning}</span>
        </div>
      )}
      {portfolio.scopeChanged && (
        <div className="notice amber">
          <Info size={17} />
          <span>
            <strong>Reporting scope changed.</strong> This quarter uses Pershing
            Square Inc.; the previous quarter uses Capital Management LP.
            Quantity changes across these filings may reflect consolidation,
            including the parent's separate HHH stake.
          </span>
        </div>
      )}
      <div className="universe-row">
        <span className="eyebrow">Explore the portfolio</span>
        <div className="segmented" aria-label="Holding type">
          {(["shares", "call", "put", "all"] as Universe[]).map((u) => (
            <button
              key={u}
              className={u === universe ? "active" : ""}
              onClick={() => setUniverse(u)}
              aria-pressed={u === universe}
            >
              {UNIVERSE_LABEL[u]}
            </button>
          ))}
        </div>
      </div>
      {showOptions && (
        <div className="option-note">
          <Info size={14} /> Option values represent the underlying securities,
          not option premiums. Combined totals are reported exposure, not AUM.
        </div>
      )}
      <div className="stats-grid">
        <div className="stat">
          <span>
            Reported{" "}
            {universe === "shares"
              ? "share holdings"
              : universe === "all"
                ? "holdings"
                : UNIVERSE_LABEL[universe].toLowerCase()}{" "}
            value
          </span>
          <strong>{money(total)}</strong>
          <small>
            {portfolio.previous && previousTotal > 0 ? (
              <>
                <Change
                  value={((total - previousTotal) / previousTotal) * 100}
                />{" "}
                vs previous quarter's value
              </>
            ) : (
              "USD · quarter-end snapshot"
            )}
          </small>
        </div>
        <div className="stat">
          <span>Reported positions</span>
          <strong>{quantity(current.length)}</strong>
          <small>
            {UNIVERSE_LABEL[universe]} · matched by security and type
          </small>
        </div>
        <div className="stat">
          <span>New positions</span>
          <strong>{portfolio.previous ? quantity(counts.new) : "—"}</strong>
          <small>Absent from the previous public filing</small>
        </div>
        <div className="stat">
          <span>Top 5 concentration</span>
          <strong>{percent(top5)}</strong>
          <small>Share of this selected holdings value</small>
        </div>
      </div>
      <div className="charts-grid">
        <section className="panel allocation-panel">
          <div className="panel-heading">
            <div>
              <h2>Where the money sits</h2>
              <p>
                Quarter-end allocation ·{" "}
                {UNIVERSE_LABEL[universe].toLowerCase()}
              </p>
            </div>
            <span className="pill">
              {quarterLabel(portfolio.current.quarter)}
            </span>
          </div>
          <Donut rows={rows} onSelect={focusHolding} />
          <div className="panel-foot">
            Top 10 shown individually. “Other” groups the remaining reported
            holdings; their details are in the table below.
          </div>
        </section>
        <section className="panel moves-panel">
          <div className="panel-heading">
            <div>
              <h2>Making waves</h2>
              <p>Reported moves vs {quarterLabel(portfolio.previousQuarter)}</p>
            </div>
            <Waves size={21} className="mint" />
          </div>
          <div className="activity-grid">
            {(["new", "added", "trimmed", "exited"] as Status[]).map((s) => (
              <button
                key={s}
                className={`activity ${s}`}
                onClick={() => focusStatus(s)}
                disabled={!portfolio.previous}
              >
                {s === "new" ? (
                  <Sparkles size={17} />
                ) : s === "added" ? (
                  <ArrowUpRight size={18} />
                ) : (
                  <ArrowDownLeft size={18} />
                )}
                <strong>
                  {portfolio.previous ? quantity(counts[s]) : "—"}
                </strong>
                <span>{STATUS_LABEL[s]}</span>
              </button>
            ))}
          </div>
          <div className="moves-label">Largest new or increased positions</div>
          <div className="move-list">
            {moves.map((r) => (
              <button
                key={r.id}
                className="move"
                onClick={() => focusHolding(r)}
              >
                <span className="ticker-icon">
                  {(r.symbol || r.issuer).slice(0, 2)}
                </span>
                <span className="move-title">
                  <strong>{r.symbol || shortName(r.issuer)}</strong>
                  <small>{shortName(r.issuer)}</small>
                </span>
                <span>
                  <b className="positive">
                    {r.status === "new"
                      ? "New"
                      : percent(r.changePercent, true)}
                  </b>
                  <small>{money(r.value)} reported</small>
                </span>
              </button>
            ))}
            {!moves.length && (
              <p className="empty-inline">
                {portfolio.previous
                  ? "No new or increased positions of this type."
                  : "A previous report is needed to compare positions."}
              </p>
            )}
          </div>
          <button
            className="text-button moves-link"
            onClick={() => focusStatus("all")}
          >
            Explore all changes <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel holdings-panel" ref={tableRef}>
        <div className="holdings-heading">
          <div className="table-tabs">
            <button
              className={tab === "holdings" ? "active" : ""}
              onClick={() => {
                setTab("holdings");
                setStatus("all");
              }}
            >
              Reported holdings <span>{quantity(current.length)}</span>
            </button>
            <button
              className={tab === "changes" ? "active" : ""}
              onClick={() => {
                setTab("changes");
                setStatus("all");
              }}
            >
              Quarterly changes
            </button>
          </div>
          <button
            className="quiet-button export"
            onClick={() =>
              downloadCsv(
                filtered,
                `whalewatch-${portfolio.fund.id}-${portfolio.current.quarter}-${universe}.csv`,
              )
            }
            disabled={!filtered.length}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
        <div className="table-controls">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search holdings"
              placeholder="Search ticker, company or CUSIP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
          <label className="select-wrap">
            <select
              aria-label="Filter position changes"
              value={status}
              onChange={(e) => {
                const selected = e.target.value as Status | "all";
                setStatus(selected);
                if (selected === "exited") setTab("changes");
                if (selected === "unchanged") setTab("holdings");
              }}
            >
              <option value="all">All moves</option>
              {(
                ["new", "added", "trimmed", "exited", "unchanged"] as Status[]
              ).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]} ({counts[s]})
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <label className="select-wrap sort">
            <select
              aria-label="Sort holdings"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="value">Largest value first</option>
              <option value="change">Largest quantity increase</option>
              <option value="weightChange">Largest weight increase</option>
              <option value="name">Ticker / name A–Z</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Company / security</th>
                <th>Reported value</th>
                <th>Weight</th>
                <th>Quantity</th>
                <th>Quantity Δ</th>
                <th>Weight Δ</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <HoldingRow
                  key={row.id}
                  row={row}
                  expanded={detail === row.id}
                  toggle={() => setDetail(detail === row.id ? null : row.id)}
                  prior={portfolio.previousQuarter}
                />
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="table-empty">
              <Search size={24} />
              <strong>No matching positions</strong>
              <span>Try another search, holding type or activity filter.</span>
              <button
                className="quiet-button"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setTab("holdings");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
        <div className="table-footer">
          <span>
            {filtered.length
              ? `${activePage * 50 + 1}–${Math.min((activePage + 1) * 50, filtered.length)} of ${quantity(filtered.length)}`
              : "0 positions"}{" "}
            <span className="muted">· {UNIVERSE_LABEL[universe]}</span>
          </span>
          <div className="pagination">
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {pages ? activePage + 1 : 0} / {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={activePage >= pages - 1}
              onClick={() => setPage(activePage + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <p className="comparison-note">
        <Info size={15} />
        {portfolio.comparisonNote} Value change is not portfolio performance.
      </p>
      <details className="sources">
        <summary>
          <ShieldCheck size={16} /> Filing receipts & data sources{" "}
          <ChevronDown size={16} />
        </summary>
        <div className="source-content">
          <div>
            <h3>This quarter · {quarterLabel(portfolio.current.quarter)}</h3>
            {portfolio.current.filings.map((f) => (
              <Source key={f.accession} filing={f} />
            ))}
            <p>
              Holdings retrieved {timestamp(portfolio.current.retrievedAt)} via
              13f.info.
            </p>
          </div>
          <div>
            <h3>Previous · {quarterLabel(portfolio.previousQuarter)}</h3>
            {portfolio.previous?.filings.map((f) => (
              <Source key={f.accession} filing={f} />
            )) || <p>Unavailable</p>}
            {portfolio.previous && (
              <p>
                Holdings retrieved {timestamp(portfolio.previous.retrievedAt)}{" "}
                via 13f.info.
              </p>
            )}
          </div>
        </div>
      </details>
    </>
  );
}

function HoldingRow({
  row,
  expanded,
  toggle,
  prior,
}: {
  row: WeightedPosition;
  expanded: boolean;
  toggle: () => void;
  prior: string;
}) {
  return (
    <>
      <tr className={expanded ? "expanded" : ""}>
        <td>
          <button
            className="company-button"
            onClick={toggle}
            aria-expanded={expanded}
          >
            <span className="ticker-icon">
              {(row.symbol || row.issuer).slice(0, 2)}
            </span>
            <span>
              <strong>
                {row.symbol || "No ticker"}{" "}
                {row.kind !== "shares" && (
                  <b className="type-label">{row.kind}</b>
                )}
              </strong>
              <small title={row.issuer}>{shortName(row.issuer)}</small>
            </span>
            <ChevronDown size={14} className={expanded ? "rotated" : ""} />
          </button>
        </td>
        <td className="number" title={money(row.value, false)}>
          {row.present ? money(row.value) : "—"}
        </td>
        <td className="number">{percent(row.weight)}</td>
        <td
          className="number"
          title={
            row.basis === "principal"
              ? "Principal amount in USD"
              : "Reported share quantity (underlying shares for options)"
          }
        >
          {quantity(row.quantity)}
          {row.basis === "principal" && <small>principal</small>}
        </td>
        <td>
          {row.status === "new" ? (
            <span className="mint">New</span>
          ) : (
            <Change value={row.changePercent} />
          )}
        </td>
        <td>
          <Change value={row.weightChange} unit="points" />
        </td>
        <td>
          <span className={`status-badge ${row.status}`}>
            {STATUS_LABEL[row.status]}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="position-detail">
              <span>
                <small>Security identity</small>
                <strong>
                  {row.cusip} · {row.class} · {row.kind}
                </strong>
              </span>
              <span>
                <small>{quarterLabel(prior)} quantity</small>
                <strong>
                  {row.comparable
                    ? quantity(row.previousQuantity)
                    : "Unavailable"}
                </strong>
              </span>
              <span>
                <small>{quarterLabel(prior)} value / weight</small>
                <strong>
                  {row.comparable
                    ? `${money(row.previousValue)} / ${percent(row.previousWeight)}`
                    : "Unavailable"}
                </strong>
              </span>
              <span>
                <small>Dollar value change</small>
                <strong>
                  {row.comparable ? money(row.value - row.previousValue) : "—"}
                </strong>
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Source({ filing }: { filing: Portfolio["current"]["filings"][0] }) {
  return (
    <div className="source-receipt">
      <span className="pill">{filing.form}</span>
      <span>Filed {dateLabel(filing.filed)}</span>
      <a href={filing.secUrl} target="_blank" rel="noreferrer">
        SEC filing <ExternalLink size={13} />
      </a>
      <a href={filing.mirrorUrl} target="_blank" rel="noreferrer">
        Mirror <ExternalLink size={13} />
      </a>
      <small>
        CIK {filing.cik} · {filing.accession}
      </small>
    </div>
  );
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [fundId, setFundId] = useState(params.get("fund") || "atreides");
  const [quarter, setQuarter] = useState(params.get("quarter") || "");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [universe, setUniverse] = useState<Universe>("shares");
  const [dialog, setDialog] = useState<"about" | "calendar" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    getJson<Catalog>(
      `/api/funds${catalogVersion ? "?refresh=true" : ""}`,
      controller.signal,
    )
      .then((data) => {
        setCatalog(data);
        if (!data.funds.some((f) => f.id === fundId)) setFundId("atreides");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setCatalogError(e.message);
      });
    return () => controller.abort();
  }, [catalogVersion]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPortfolio(null);
    const query = new URLSearchParams();
    if (quarter) query.set("quarter", quarter);
    if (refresh) query.set("refresh", "true");
    getJson<Portfolio>(
      `/api/funds/${encodeURIComponent(fundId)}/portfolio?${query}`,
      controller.signal,
    )
      .then((data) => {
        setPortfolio(data);
        const url = new URL(location.href);
        url.searchParams.set("fund", fundId);
        url.searchParams.set("quarter", data.current.quarter);
        history.replaceState(null, "", url);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fundId, quarter, refresh]);
  const selected =
    catalog?.funds.find((f) => f.id === fundId) || portfolio?.fund;
  function changeFund(id: string) {
    setFundId(id);
    setQuarter("");
    setUniverse("shares");
    setRefresh(0);
  }
  function reload() {
    setRefresh((n) => n + 1);
    setCatalogVersion((n) => n + 1);
  }
  function calendarExpired() {
    const controller = new AbortController();
    getJson<Calendar>("/api/calendar", controller.signal)
      .then((calendar) => setCatalog((c) => (c ? { ...c, calendar } : c)))
      .catch(() => {});
  }
  const quarters = portfolio?.quarters || selected?.quarters || [];
  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="/" aria-label="WhaleWatch home">
          <img src="/whale.svg" alt="" />
          <span>
            Whale<span className="mint">Watch</span>
            <small>THE 13F PORTFOLIO CLUB</small>
          </span>
        </a>
        <div className="header-right">
          <span className="private-label">
            <span className="live-dot" /> Public filings. Your research.
          </span>
          <button className="quiet-button" onClick={() => setDialog("about")}>
            <Info size={16} />
            <span>How it works</span>
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow mint">A LITTLE WHALE WATCHING</div>
            <h1>
              Follow the <span>big fish.</span>
            </h1>
            <p>
              Five investing heavyweights. Their reported positions.
              <br className="desktop-break" /> A clearer view of what changed
              each quarter.
            </p>
          </div>
          {catalog && (
            <FilingClock
              calendar={catalog.calendar}
              onOpen={() => setDialog("calendar")}
              onExpired={calendarExpired}
            />
          )}
        </section>
        {catalogError && (
          <div className="notice amber">
            <Info size={17} />
            <span>Unable to load the manager list. {catalogError}</span>
            <button
              className="text-button"
              onClick={() => setCatalogVersion((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        )}
        <nav className="fund-grid" aria-label="Choose a fund">
          {catalog
            ? catalog.funds.map((fund) => (
                <button
                  key={fund.id}
                  className={`fund-card ${fundId === fund.id ? "selected" : ""}`}
                  onClick={() => changeFund(fund.id)}
                  aria-pressed={fundId === fund.id}
                  data-fund={fund.id}
                  style={{ "--fund": fund.color } as CSSProperties}
                >
                  <div className="fund-top">
                    <Avatar fund={fund} />
                    <span className="fund-selection">
                      {fundId === fund.id ? (
                        <Check size={14} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </span>
                  </div>
                  <strong>{fund.name}</strong>
                  <span className="fund-person">{fund.person}</span>
                  <small className="fund-tagline">
                    {fund.id === "citadel"
                      ? "Includes Wellington"
                      : fund.tagline}
                  </small>
                  <div className="fund-meta">
                    <span>
                      {fund.latestQuarter
                        ? quarterLabel(fund.latestQuarter)
                        : "Unavailable"}
                    </span>
                    {fund.amendment ? (
                      <span
                        className="amended-dot"
                        title="Latest quarter includes an amendment"
                      />
                    ) : (
                      <span className="fund-meta-dot" />
                    )}
                  </div>
                </button>
              ))
            : Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="fund-card skeleton" />
              ))}
        </nav>
        <section className="portfolio-intro">
          <div>
            <div className="eyebrow">THE FILING ROOM</div>
            <h2>
              Inside {selected?.name || "the portfolio"}{" "}
              <span className="small-wave">〰</span>
            </h2>
            <p>
              {portfolio ? (
                <>
                  Holdings as of{" "}
                  <strong>{dateLabel(portfolio.current.periodEnd)}</strong>
                  <span className="separator">·</span>Filed{" "}
                  {dateLabel(portfolio.current.filed)}
                  {portfolio.current.filings.some(
                    (f) => f.form !== "13F-HR",
                  ) && <span className="amendment-label">Amended</span>}
                </>
              ) : (
                "Loading the latest public report…"
              )}
            </p>
          </div>
          <div className="portfolio-actions">
            <label className="select-wrap quarter">
              <CalendarDays size={16} />
              <select
                aria-label="Reporting quarter"
                value={
                  quarter ||
                  portfolio?.current.quarter ||
                  selected?.latestQuarter ||
                  ""
                }
                onChange={(e) => {
                  setQuarter(e.target.value);
                  setRefresh(0);
                }}
                disabled={loading || !quarters.length}
              >
                {!quarters.length && <option>Loading…</option>}
                {quarters.map((q) => (
                  <option key={q} value={q}>
                    {quarterLabel(q)}
                    {q === selected?.latestQuarter ? " · latest" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="icon-button refresh"
              aria-label="Refresh public filings"
              title="Refresh public filings"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
        </section>
        {selected && (
          <div className="scope-note">
            <ShieldCheck size={15} />
            <span>
              {selected.id === "citadel"
                ? selected.scope
                : selected.id === "pershing"
                  ? selected.scope
                  : "Latest public 13F snapshot. Covers reportable securities; excludes cash, shorts and many other assets."}
            </span>
          </div>
        )}
        {loading ? (
          <div className="loading-state" role="status">
            <LoaderCircle className="spin mint" size={32} />
            <h3>Checking the fishing net…</h3>
            <p>Loading the report and its previous quarter.</p>
            <small>Large filings can take a moment on their first visit.</small>
          </div>
        ) : error ? (
          <div className="error-state" role="alert">
            <Info size={28} />
            <h3>This filing couldn't be loaded</h3>
            <p>{error}</p>
            <button className="primary-button" onClick={reload}>
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        ) : portfolio ? (
          <PortfolioView
            key={`${fundId}-${portfolio.current.quarter}`}
            portfolio={portfolio}
            universe={universe}
            setUniverse={setUniverse}
          />
        ) : null}
      </main>
      <footer>
        <span>
          <img src="/whale.svg" alt="" /> WhaleWatch{" "}
          <span className="muted">· Good research has receipts.</span>
        </span>
        <button className="text-button" onClick={() => setDialog("about")}>
          Sources & methodology <ArrowUpRight size={14} />
        </button>
      </footer>
      {dialog === "about" && (
        <Dialog
          title="Good research has receipts."
          onClose={() => setDialog(null)}
        >
          <p className="modal-lead">
            WhaleWatch follows public 13F filings from five managers. These are
            dated holdings snapshots, with a reporting delay of up to 45 days.
          </p>
          <div className="method-grid">
            <div>
              <h3>What you're seeing</h3>
              <p>
                “Reported value” is the value of securities in the selected
                filing universe. It is not the firm's AUM or live portfolio.
                Cash, shorts, private investments and many overseas holdings are
                outside the report.
              </p>
            </div>
            <div>
              <h3>How changes work</h3>
              <p>
                Positions match by CUSIP, share class, option type and quantity
                basis. Share changes compare reported quantities; weight changes
                are percentage points. Splits and reporting changes can look
                like activity.
              </p>
            </div>
            <div>
              <h3>Shares and options</h3>
              <p>
                Shares are the default. Calls and puts are separate positions
                and report underlying share value, not the option's premium.
                Weights always use the selected universe.
              </p>
            </div>
            <div>
              <h3>Amendments matter</h3>
              <p>
                Restatements replace the original report. “New holdings”
                amendments are added to the existing quarter. Historical reports
                reflect amendments already public today.
              </p>
            </div>
          </div>
          <div className="notice amber">
            <Info size={17} />
            <span>
              Citadel combines managers, including Wellington; a Wellington-only
              portfolio is not public in its 13F. Pershing's Q2 2026 filing
              consolidates under a new parent, so comparisons across that
              boundary can include a scope change.
            </span>
          </div>
          <h3>Data & timing</h3>
          <p>
            Holdings come from the public{" "}
            <a href="https://13f.info" target="_blank" rel="noreferrer">
              13f.info mirror
            </a>
            , with links to every original SEC filing below the table. No API
            key is needed. Indexes cache for 15 minutes; holdings cache for 30
            days. Refresh checks the selected filing again. Cached data is
            labeled when the provider is unavailable. Values from the mirror are
            in thousands of USD and are converted to USD here.
          </p>
          <p>
            The timer follows the{" "}
            <a
              href="https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f"
              target="_blank"
              rel="noreferrer"
            >
              SEC 13F calendar
            </a>
            , including weekends and federal holidays, at the 5:30 pm US Eastern
            same-day filing cutoff. Dates are shown in Europe/Berlin. A deadline
            is not an exact publication time.
          </p>
          <h3>People & portraits</h3>
          <p>
            Headshots identify people associated with the firms; these are
            institutional reports, not their personal portfolios. Buffett is
            Berkshire's chairman.
          </p>
          <ul className="credit-list">
            <li>
              Gavin Baker ·{" "}
              <a
                href="https://www.sohnconference.org/sohn2026"
                target="_blank"
                rel="noreferrer"
              >
                Sohn Conference Foundation
              </a>
            </li>
            <li>
              Ken Griffin ·{" "}
              <a
                href="https://www.citadel.com/who-we-are/leadership/kenneth-c-griffin/"
                target="_blank"
                rel="noreferrer"
              >
                Citadel
              </a>
            </li>
            <li>
              Stanley Druckenmiller ·{" "}
              <a
                href="https://www.grantspub.com/includes/cfn_speakerBio.cfm?sid=155"
                target="_blank"
                rel="noreferrer"
              >
                Grant's Interest Rate Observer
              </a>
            </li>
            <li>
              Warren Buffett ·{" "}
              <a
                href="https://www.givingpledge.org/pledger/warren-buffett/"
                target="_blank"
                rel="noreferrer"
              >
                The Giving Pledge
              </a>
            </li>
            <li>
              Bill Ackman ·{" "}
              <a
                href="https://pershingsquarephilanthropies.org/about/leadership"
                target="_blank"
                rel="noreferrer"
              >
                Pershing Square Philanthropies
              </a>
              , Peter Hurley (2026)
            </li>
          </ul>
        </Dialog>
      )}
      {dialog === "calendar" && catalog && (
        <Dialog
          title="The next tide of filings"
          onClose={() => setDialog(null)}
        >
          <p className="modal-lead">
            The SEC due dates for the next four reporting quarters. Managers can
            publish before these dates.
          </p>
          <div className="calendar-list">
            {catalog.calendar.upcoming.map((d, i) => (
              <div key={d.quarter}>
                <span className="calendar-icon">
                  <CalendarDays size={21} />
                </span>
                <span>
                  <strong>{quarterLabel(d.quarter)}</strong>
                  <small>Holdings as of {dateLabel(d.periodEnd)}</small>
                </span>
                <span>
                  <strong>{dateLabel(d.date, true)}</strong>
                  <small>
                    {i === 0 ? "Next deadline" : "13F deadline"} · 5:30 pm US
                    Eastern
                  </small>
                </span>
              </div>
            ))}
          </div>
          <p>{catalog.calendar.note}</p>
          <a
            className="text-button mint"
            href={catalog.calendar.source}
            target="_blank"
            rel="noreferrer"
          >
            Read the SEC filing calendar <ExternalLink size={15} />
          </a>
        </Dialog>
      )}
    </div>
  );
}
