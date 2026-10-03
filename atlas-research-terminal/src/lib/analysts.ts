export type AnalystSourceId = "stockanalysis" | "finviz";
export interface AnalystCall {
  id: string;
  symbol: string;
  date: string;
  analyst: string | null;
  firm: string;
  rating: string | null;
  prior_rating: string | null;
  action: string | null;
  price_target: number | null;
  prior_target: number | null;
  currency: string;
  source: AnalystSourceId;
  source_url: string;
  analyst_url: string | null;
}
export interface AnalystTargetsResponse {
  symbol: string;
  company: string;
  currency: string;
  status: "available" | "empty" | "unavailable" | "unsupported" | "demo";
  records: AnalystCall[];
  sources: {
    id: AnalystSourceId;
    name: string;
    url: string;
    status: "available" | "empty" | "unavailable";
    count: number;
    message: string;
  }[];
  retrieved_at: number | null;
  cached: boolean;
  stale: boolean;
  warning: string | null;
  coverage: string;
  message: string | null;
}
export type AnalystScope = "all" | "named" | "firms";

export function filterAnalystCalls(
  records: AnalystCall[],
  query: string,
  scope: AnalystScope,
  order: "newest" | "oldest",
): AnalystCall[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return records
    .filter((call) => {
      if (scope === "named" && !call.analyst) return false;
      if (scope === "firms" && call.analyst) return false;
      const text = [
        call.analyst,
        call.firm,
        call.action,
        call.rating,
        call.date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      const date = a.date.localeCompare(b.date);
      return (
        (order === "oldest" ? date : -date) ||
        Number(!!b.analyst) - Number(!!a.analyst) ||
        a.firm.localeCompare(b.firm)
      );
    });
}

export function analystPrice(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value) || value <= 0)
    return "Not supplied";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function analystDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function ratingTone(rating: string | null): string {
  if (!rating) return "neutral";
  if (/buy|outperform|overweight|positive|accumulate|strong buy/i.test(rating))
    return "positive";
  if (/sell|underperform|underweight|negative|reduce/i.test(rating))
    return "negative";
  return "neutral";
}
