export type Kind = "shares" | "call" | "put" | "principal";
export type Universe = Kind | "all";
export type Status =
  "new" | "added" | "trimmed" | "exited" | "unchanged" | "unavailable";
export interface Fund {
  id: string;
  name: string;
  legalName: string;
  person: string;
  role: string;
  color: string;
  portrait: string;
  tagline: string;
  scope: string;
  quarters: string[];
  latestQuarter: string | null;
  latestFiled?: string;
  reportedValue: number | null;
  amendment?: boolean;
  retrievedAt?: string;
  stale?: boolean;
  error?: string | null;
}
export interface Filing {
  accession: string;
  form: string;
  filed: string;
  secUrl: string;
  mirrorUrl: string;
  cik: string;
}
export interface Snapshot {
  quarter: string;
  periodEnd: string;
  filed: string;
  value: number;
  count: number;
  filerCik: string;
  retrievedAt: string;
  stale: boolean;
  filings: Filing[];
}
export interface Position {
  id: string;
  symbol: string | null;
  issuer: string;
  class: string;
  cusip: string;
  kind: Kind;
  basis: "shares" | "principal";
  value: number;
  quantity: number;
  previousValue: number;
  previousQuantity: number;
  status: Status;
  changePercent: number | null;
  present: boolean;
  previousPresent: boolean;
  comparable: boolean;
}
export interface WeightedPosition extends Position {
  weight: number;
  previousWeight: number;
  weightChange: number | null;
}
export interface Portfolio {
  fund: Fund;
  quarters: string[];
  current: Snapshot;
  previous: Snapshot | null;
  previousQuarter: string;
  rows: Position[];
  scopeChanged: boolean;
  warning: string | null;
  stale: boolean;
  provider: string;
  currency: string;
  comparisonNote: string;
  indexRetrievedAt: string;
}
export interface Deadline {
  quarter: string;
  periodEnd: string;
  deadline: string;
  date: string;
}
export interface Calendar {
  next: Deadline;
  upcoming: Deadline[];
  source: string;
  note: string;
}
export interface Catalog {
  funds: Fund[];
  calendar: Calendar;
}
