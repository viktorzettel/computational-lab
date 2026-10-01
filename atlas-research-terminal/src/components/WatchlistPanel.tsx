import { useState } from "react";
import {
  Plus,
  Activity,
  ChevronDown,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  X,
  List,
  Database,
  ArrowUpRight,
  Check,
  GripVertical,
} from "lucide-react";
import {
  assetFor,
  displaySymbol,
  formatPrice,
  formatPercent,
} from "../lib/assets";
import type { Quote, Watchlist } from "../lib/types";

interface Props {
  lists: Watchlist[];
  activeId: string;
  selected: string;
  quotes: Record<string, Quote>;
  compactRows: boolean;
  onActive: (id: string) => void;
  onSelect: (symbol: string) => void;
  onAdd: () => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRemove: (symbol: string) => void;
  onReorder: (from: number, to: number) => void;
  onExport: () => void;
  onSources: () => void;
  onBreadth: () => void;
  onJordi: () => void;
  jordiActive: boolean;
}
export default function WatchlistPanel(p: Props) {
  const [selectOpen, setSelectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const list = p.lists.find((l) => l.id === p.activeId) || p.lists[0];
  return (
    <aside className={`watchlist-panel ${p.compactRows ? "compact" : ""}`}>
      <div className="sidebar-heading">
        <span>
          WATCHLISTS <span className="count-badge">{p.lists.length}</span>
        </span>
        <button
          aria-label="Create watchlist"
          title="Create watchlist"
          className="icon-button"
          onClick={p.onCreate}
        >
          <Plus size={17} />
        </button>
      </div>
      <div className="watchlist-select-row">
        <div className="popover-parent">
          <button
            className="watchlist-select"
            onClick={() => {
              setSelectOpen(!selectOpen);
              setMenuOpen(false);
            }}
            aria-expanded={selectOpen}
          >
            <List size={16} />
            <span>{list.name}</span>
            <ChevronDown size={13} />
          </button>
          {selectOpen && (
            <>
              <div
                className="popover-dismiss"
                onClick={() => setSelectOpen(false)}
              />
              <div className="popover list-popover">
                {p.lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      p.onActive(l.id);
                      setSelectOpen(false);
                    }}
                  >
                    <span>{l.name}</span>
                    <span>
                      {l.id === list.id ? (
                        <Check size={14} />
                      ) : (
                        l.symbols.length
                      )}
                    </span>
                  </button>
                ))}
                <div className="menu-divider" />
                <button
                  onClick={() => {
                    p.onCreate();
                    setSelectOpen(false);
                  }}
                >
                  <Plus size={14} />
                  New watchlist
                </button>
              </div>
            </>
          )}
        </div>
        <div className="popover-parent">
          <button
            aria-label="Watchlist options"
            className="icon-button"
            onClick={() => {
              setMenuOpen(!menuOpen);
              setSelectOpen(false);
            }}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <>
              <div
                className="popover-dismiss"
                onClick={() => setMenuOpen(false)}
              />
              <div className="popover watchlist-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    p.onBreadth();
                  }}
                >
                  <Activity size={14} />
                  Watchlist breadth
                </button>
                <button
                  onClick={() => {
                    p.onRename();
                    setMenuOpen(false);
                  }}
                >
                  Rename watchlist
                </button>
                <button
                  onClick={() => {
                    p.onExport();
                    setMenuOpen(false);
                  }}
                >
                  Export all watchlists
                </button>
                <button
                  className="negative"
                  disabled={p.lists.length === 1}
                  onClick={() => {
                    p.onDelete();
                    setMenuOpen(false);
                  }}
                >
                  Delete watchlist
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="watchlist-columns">
        <span>SYMBOL</span>
        <span>LAST</span>
        <span>CHG %</span>
      </div>
      <div className="watchlist-rows">
        {list.symbols.map((symbol, index) => {
          const asset = assetFor(symbol),
            quote = p.quotes[symbol];
          return (
            <div
              key={symbol}
              className={`watchlist-row ${symbol === p.selected ? "selected" : ""} ${dropIndex === index ? "drop-target" : ""}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", symbol);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) p.onReorder(dragIndex, index);
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
            >
              <button
                className="watchlist-row-main"
                onClick={() => p.onSelect(symbol)}
                title={
                  quote
                    ? `${quote.source === "demo" ? "Synthetic sample quote" : quote.warning || quote.source} · ${new Date(quote.timestamp * 1000).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
                    : undefined
                }
                aria-label={`Open ${asset.name}`}
              >
                <span className="watchlist-symbol">
                  <span className={`symbol-dot ${asset.type}`} />{" "}
                  <strong>
                    {displaySymbol(symbol)}
                    {quote?.source === "demo" && (
                      <span className="watchlist-row-sample">SAMPLE</span>
                    )}
                  </strong>
                  <span className="company-name">
                    {asset.name
                      .replace(" Corporation", "")
                      .replace(" Inc.", "")
                      .replace(",", "")}
                  </span>
                </span>
                <span className="watchlist-price">
                  {formatPrice(quote?.price)}
                </span>
                <span
                  className={`watchlist-change ${quote && quote.change_percent >= 0 ? "positive" : "negative"}`}
                >
                  {formatPercent(quote?.change_percent)}
                </span>
              </button>
              <div className="row-actions">
                <GripVertical size={11} />
                <button
                  disabled={index === 0}
                  aria-label={`Move ${displaySymbol(symbol)} up`}
                  title="Move up"
                  onClick={() => p.onReorder(index, index - 1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  disabled={index === list.symbols.length - 1}
                  aria-label={`Move ${displaySymbol(symbol)} down`}
                  title="Move down"
                  onClick={() => p.onReorder(index, index + 1)}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  aria-label={`Remove ${displaySymbol(symbol)}`}
                  title="Remove from watchlist"
                  onClick={() => p.onRemove(symbol)}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
        {list.symbols.length === 0 && (
          <div className="empty-watchlist">
            <List size={25} />
            <strong>A fresh perspective</strong>
            <p>Add your first symbol to start this watchlist.</p>
          </div>
        )}
      </div>
      <button className="add-symbol" onClick={p.onAdd}>
        <Plus size={15} />
        Add symbol<span>⌘ K</span>
      </button>
      <button
        className={`breadth-button ${p.jordiActive ? "is-applied" : ""}`}
        aria-pressed={p.jordiActive}
        title={
          p.jordiActive
            ? "Hide daily 50-day and 200-day chart averages"
            : "Show only daily 50-day and 200-day averages on this chart"
        }
        onClick={p.onJordi}
      >
        <span className="breadth-avatar" aria-hidden="true">
          <img src="/jordi-visser.png" alt="" />
        </span>
        Jordi Visser indicators
      </button>
      <div className="other-watchlists">
        <div className="tiny-heading">YOUR LISTS</div>
        {p.lists
          .filter((l) => l.id !== list.id)
          .map((l) => (
            <button key={l.id} onClick={() => p.onActive(l.id)}>
              <List size={15} />
              <span>{l.name}</span>
              <span className="other-list-count">{l.symbols.length}</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
      </div>
      <div className="sidebar-bottom">
        <button className="sources-button" onClick={p.onSources}>
          <Database size={14} />
          <span>Data connections</span>
          <span className="connection-dot" />
          <ArrowUpRight size={13} />
        </button>
      </div>
    </aside>
  );
}
