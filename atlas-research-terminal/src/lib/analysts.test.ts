import { describe, expect, it } from "vitest";
import {
  analystDate,
  analystPrice,
  filterAnalystCalls,
  ratingTone,
} from "./analysts";
import type { AnalystCall } from "./analysts";

const call = (
  id: string,
  date: string,
  analyst: string | null,
  firm: string,
  rating = "Buy",
): AnalystCall => ({
  id,
  date,
  analyst,
  firm,
  rating,
  symbol: "NVDA",
  prior_rating: null,
  action: "Maintains",
  price_target: 300,
  prior_target: null,
  currency: "USD",
  source: analyst ? "stockanalysis" : "finviz",
  source_url: "https://example.test",
  analyst_url: null,
});
const calls = [
  call("old", "2026-05-01", null, "Example Securities"),
  call("new", "2026-10-01", "Test Person", "Alpha Research"),
  call("middle", "2026-09-30", "Other Analyst", "Example Securities", "Hold"),
];

describe("published analyst call filtering", () => {
  it("filters named people separately from firms without inventing identities", () => {
    expect(
      filterAnalystCalls(calls, "", "named", "newest").map((c) => c.id),
    ).toEqual(["new", "middle"]);
    expect(
      filterAnalystCalls(calls, "", "firms", "newest").map((c) => c.id),
    ).toEqual(["old"]);
  });
  it("matches multiple search terms across names, firms and ratings", () => {
    expect(
      filterAnalystCalls(calls, "  EXAMPLE hold ", "all", "newest").map(
        (c) => c.id,
      ),
    ).toEqual(["middle"]);
    expect(
      filterAnalystCalls(calls, "test alpha", "all", "newest").map((c) => c.id),
    ).toEqual(["new"]);
    expect(filterAnalystCalls(calls, "unmatched", "all", "newest")).toEqual([]);
  });
  it("sorts call dates and leaves the underlying data intact", () => {
    expect(
      filterAnalystCalls(calls, "", "all", "newest").map((c) => c.id),
    ).toEqual(["new", "middle", "old"]);
    expect(
      filterAnalystCalls(calls, "", "all", "oldest").map((c) => c.id),
    ).toEqual(["old", "middle", "new"]);
    expect(calls[0].id).toBe("old");
  });
  it("retains published ratings with no price target", () => {
    expect(
      filterAnalystCalls(
        [{ ...calls[1], price_target: null }],
        "",
        "all",
        "newest",
      ),
    ).toHaveLength(1);
    expect(analystPrice(null, "USD")).toBe("Not supplied");
    expect(analystPrice(0, "USD")).toBe("Not supplied");
    expect(analystPrice(Infinity, "USD")).toBe("Not supplied");
    expect(analystPrice(300, "USD")).toBe("$300");
    expect(analystPrice(300.25, "USD")).toBe("$300.25");
  });
  it("formats publication dates without a timezone day shift", () => {
    expect(analystDate("2026-10-01")).toBe("Oct 1, 2026");
    expect(ratingTone("Outperform")).toBe("positive");
    expect(ratingTone("Underweight")).toBe("negative");
    expect(ratingTone("Hold")).toBe("neutral");
  });
});
