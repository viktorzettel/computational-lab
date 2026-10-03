import { useState } from "react";
import {
  Search,
  Plus,
  Check,
  Activity,
  ChartNoAxesCombined,
  BarChart3,
} from "lucide-react";
import Modal from "./Modal";
import { INDICATOR_CATEGORIES, INDICATOR_DEFINITIONS } from "../lib/indicators";
import type { IndicatorConfig, IndicatorKind } from "../lib/types";

export default function IndicatorPicker({
  onClose,
  onAdd,
  indicators,
}: {
  onClose: () => void;
  onAdd: (kind: IndicatorKind) => void;
  indicators: IndicatorConfig[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const matches = INDICATOR_DEFINITIONS.filter(
    (d) =>
      (filter === "All" || d.category === filter) &&
      `${d.name} ${d.kind} ${d.aliases ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <Modal
      title="Indicator library"
      subtitle={`${INDICATOR_DEFINITIONS.length} tools for your chart. Add independent instances and adjust them below the chart.`}
      onClose={onClose}
      className="indicator-modal"
    >
      <div className="search-input">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Search indicators, e.g. Ichimoku, RSI, volume…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find an indicator"
        />
      </div>
      <div className="search-filters" aria-label="Indicator categories">
        {["All", ...INDICATOR_CATEGORIES].map((category) => (
          <button
            key={category}
            className={filter === category ? "active" : ""}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="indicator-results">
        {INDICATOR_CATEGORIES.map((category) => {
          const items = matches.filter((d) => d.category === category);
          return (
            items.length > 0 && (
              <section key={category} aria-label={`${category} indicators`}>
                <div className="indicator-group-heading">
                  {category}
                  <span>{items.length}</span>
                </div>
                {items.map((def) => {
                  const count = indicators.filter(
                    (i) => i.kind === def.kind,
                  ).length;
                  return (
                    <button
                      className="indicator-result"
                      key={def.kind}
                      onClick={() => onAdd(def.kind)}
                      aria-label={`Add ${def.name}`}
                    >
                      <span className="indicator-icon">
                        {def.category === "Volume" ? (
                          <BarChart3 size={20} />
                        ) : def.pane === "overlay" ? (
                          <ChartNoAxesCombined size={20} />
                        ) : (
                          <Activity size={20} />
                        )}
                      </span>
                      <span>
                        <strong>
                          {def.name}
                          <small>{def.shortName ?? def.kind}</small>
                        </strong>
                        <p>{def.description}</p>
                      </span>
                      <span className="indicator-add">
                        {count > 0 && (
                          <span>
                            <Check size={12} />
                            {count} added
                          </span>
                        )}
                        <Plus size={18} />
                      </span>
                    </button>
                  );
                })}
              </section>
            )
          );
        })}
        {matches.length === 0 && (
          <div className="indicator-no-results">
            No matching indicators. Try another name or category.
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <span>Calculated locally from chart data</span>
        <span>Multiple instances supported</span>
      </footer>
    </Modal>
  );
}
