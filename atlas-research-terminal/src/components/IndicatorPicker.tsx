import { useState } from "react";
import {
  Search,
  Plus,
  Check,
  Activity,
  ChartNoAxesCombined,
} from "lucide-react";
import Modal from "./Modal";
import { INDICATOR_DEFINITIONS } from "../lib/indicators";
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
  const [filter, setFilter] = useState("all");
  return (
    <Modal
      title="Indicators"
      subtitle="Calculated from your chart data. Add as many as you need."
      onClose={onClose}
      className="indicator-modal"
    >
      <div className="search-input">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Find an indicator…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find an indicator"
        />
      </div>
      <div className="search-filters">
        {[
          ["all", "All indicators"],
          ["overlay", "Overlays"],
          ["oscillator", "Oscillators"],
          ["volume", "Volume"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="indicator-results">
        {INDICATOR_DEFINITIONS.filter(
          (d) =>
            (filter === "all" || d.pane === filter) &&
            `${d.name} ${d.kind}`.toLowerCase().includes(query.toLowerCase()),
        ).map((def) => {
          const count = indicators.filter((i) => i.kind === def.kind).length;
          return (
            <button
              className="indicator-result"
              key={def.kind}
              onClick={() => onAdd(def.kind)}
            >
              <span className="indicator-icon">
                {def.pane === "overlay" ? (
                  <ChartNoAxesCombined size={20} />
                ) : (
                  <Activity size={20} />
                )}
              </span>
              <span>
                <strong>
                  {def.name}
                  <small>{def.kind}</small>
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
      </div>
      <footer className="modal-footer">
        <span>Runs locally · No additional data requests</span>
        <span>Multiple instances supported</span>
      </footer>
    </Modal>
  );
}
