import { useEffect, useState } from "react";
import { Search, Plus, Check, ArrowUpRight, LoaderCircle } from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { ASSETS, displaySymbol } from "../lib/assets";
import type { Asset, AssetType } from "../lib/types";

export default function SymbolSearch({
  onClose,
  onSelect,
  onAdd,
  addedSymbols,
}: {
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  onAdd?: (asset: Asset) => void;
  addedSymbols: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [results, setResults] = useState<Asset[]>(ASSETS);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const local = ASSETS.filter((a) =>
      `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
    );
    setResults(local);
    setWarning("");
    if (!query.trim()) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      api
        .search(query, controller.signal)
        .then(({ results: remote }) => {
          const merged = new Map(
            [...local, ...remote].map((asset) => [asset.symbol, asset]),
          );
          setResults([...merged.values()]);
        })
        .catch((e) => {
          if (e.name !== "AbortError")
            setWarning(
              "Provider search is unavailable. Showing matching local symbols.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);
  const filtered = results.filter((a) => filter === "all" || a.type === filter);
  return (
    <Modal
      title={onAdd ? "Add to watchlist" : "Symbol search"}
      subtitle={
        onAdd
          ? "Find an asset and add it to your current list."
          : "A world of markets. One research workspace."
      }
      onClose={onClose}
      className="search-modal"
    >
      <div className="search-input">
        <Search size={19} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or company…"
          aria-label="Search symbol or company"
        />
        {loading ? <LoaderCircle size={16} className="spin" /> : <kbd>ESC</kbd>}
      </div>
      <div className="search-filters">
        {(["all", "stock", "etf", "index", "crypto"] as const).map((type) => (
          <button
            key={type}
            className={filter === type ? "active" : ""}
            onClick={() => setFilter(type)}
          >
            {
              {
                all: "All assets",
                stock: "Stocks",
                etf: "ETFs",
                index: "Indices",
                crypto: "Crypto",
              }[type]
            }
          </button>
        ))}
      </div>
      <div className="search-results-label">
        {query ? "SEARCH RESULTS" : "POPULAR SYMBOLS"}
        <span>{filtered.length} assets</span>
      </div>
      <div className="search-results">
        {filtered.map((asset) => (
          <button
            key={asset.symbol}
            className="search-result"
            onClick={() => (onAdd ? onAdd(asset) : onSelect(asset))}
          >
            <span
              className={`asset-logo ${asset.type === "crypto" ? "crypto" : ""}`}
            >
              {displaySymbol(asset.symbol).slice(0, 2)}
            </span>
            <span className="search-result-name">
              <strong>{displaySymbol(asset.symbol)}</strong>
              <span>{asset.name}</span>
            </span>
            <span className="asset-type">{asset.type}</span>
            <span className="search-exchange">{asset.exchange}</span>
            {onAdd ? (
              addedSymbols.includes(asset.symbol) ? (
                <Check size={18} className="positive" />
              ) : (
                <Plus size={18} />
              )
            ) : (
              <ArrowUpRight size={17} />
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="empty-search">
            {loading
              ? "Searching providers…"
              : "No matching assets. Try another ticker or company name."}
          </div>
        )}
      </div>
      {warning && <p className="search-warning">{warning}</p>}
      <footer className="modal-footer">
        <span>Equities, ETFs, indices & crypto</span>
        <span>
          {onAdd
            ? "Click to add · click again to remove"
            : "Click a symbol to open its chart"}
        </span>
      </footer>
    </Modal>
  );
}
