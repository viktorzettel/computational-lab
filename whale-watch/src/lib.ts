import type { Position, Universe, WeightedPosition } from "./types";

export const TIMEZONE = "Europe/Berlin";
export const COLORS = [
  "#72e7be",
  "#91b6ff",
  "#c4a1ff",
  "#f5c77d",
  "#ff9f96",
  "#7ecbdb",
  "#acbb76",
  "#e99cd3",
  "#d8ddec",
  "#bc957f",
  "#849ab7",
];
export const STATUS_LABEL = {
  new: "New",
  added: "Added",
  trimmed: "Trimmed",
  exited: "Exited",
  unchanged: "Unchanged",
  unavailable: "No comparison",
};
export const UNIVERSE_LABEL: Record<Universe, string> = {
  shares: "Shares",
  call: "Calls",
  put: "Puts",
  principal: "Principal",
  all: "All reported",
};

export function weighted(
  rows: Position[],
  universe: Universe,
): WeightedPosition[] {
  const selected = rows.filter(
    (row) => universe === "all" || row.kind === universe,
  );
  const current = selected.reduce((sum, row) => sum + row.value, 0);
  const previous = selected.reduce((sum, row) => sum + row.previousValue, 0);
  return selected.map((row) => ({
    ...row,
    weight: current ? (row.value / current) * 100 : 0,
    previousWeight: previous ? (row.previousValue / previous) * 100 : 0,
    weightChange: row.comparable
      ? (current ? (row.value / current) * 100 : 0) -
        (previous ? (row.previousValue / previous) * 100 : 0)
      : null,
  }));
}

export function segments(rows: WeightedPosition[], count = 10) {
  const sorted = rows
    .filter((row) => row.present && row.value > 0)
    .toSorted((a, b) => b.value - a.value);
  const pieces = sorted
    .slice(0, count)
    .map((row, i) => ({
      id: row.id,
      label: row.symbol || row.issuer,
      value: row.value,
      weight: row.weight,
      color: COLORS[i],
      row,
    }));
  const rest = sorted.slice(count);
  if (rest.length)
    pieces.push({
      id: "other",
      label: `Other ${rest.length}`,
      value: rest.reduce((s, r) => s + r.value, 0),
      weight: rest.reduce((s, r) => s + r.weight, 0),
      color: COLORS[10],
      row: rest[0],
    });
  return pieces;
}

export function money(value: number, compact = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 0,
  }).format(value);
}
export function quantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}
export function percent(value: number | null, signed = false): string {
  return value === null
    ? "—"
    : `${signed && value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
export function points(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
}
export function quarterLabel(quarter: string): string {
  const [year, part] = quarter.split("-");
  return `${part} ${year}`;
}
export function dateLabel(date: string, full = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: full ? "long" : "short",
    year: "numeric",
  }).format(new Date(date.length === 10 ? date + "T12:00:00Z" : date));
}
export function timestamp(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}
export function shortName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Inc|Corp|Ltd|Plc|Co)\b/g, (c) => c);
}
export function countdown(deadline: string, now = Date.now()) {
  const total = Math.max(
    0,
    Math.floor((new Date(deadline).getTime() - now) / 1000),
  );
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    expired: total === 0,
  };
}

export function downloadCsv(rows: WeightedPosition[], name: string) {
  // Prevent spreadsheet formula interpretation of provider-supplied text.
  const cell = (v: string | number | null) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const header = [
    "Ticker",
    "Issuer",
    "CUSIP",
    "Class",
    "Type",
    "Quantity basis",
    "Current quantity",
    "Prior quantity",
    "Quantity change %",
    "Current USD value",
    "Prior USD value",
    "Current weight %",
    "Prior weight %",
    "Weight change pp",
    "Status",
  ];
  const data = rows.map((r) => [
    r.symbol,
    r.issuer,
    r.cusip,
    r.class,
    r.kind,
    r.basis,
    r.quantity,
    r.previousQuantity,
    r.changePercent,
    r.value,
    r.previousValue,
    r.weight,
    r.previousWeight,
    r.weightChange,
    r.status,
  ]);
  const blob = new Blob(
    [
      "\uFEFF" +
        [header, ...data].map((r) => r.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getJson<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Data provider unavailable." }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "Unable to load this filing.",
    );
  }
  return response.json() as Promise<T>;
}
