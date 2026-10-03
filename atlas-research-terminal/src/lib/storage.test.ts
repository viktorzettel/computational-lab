import { describe, expect, it } from "vitest";
import { readWorkspaceValue } from "./storage";
const storageFor = (data: Record<string, string>) => ({
  getItem: (key: string) => data[key] ?? null,
});
describe("FinanceBro workspace migration", () => {
  it("retains a legacy workspace and gives new preferences precedence", () => {
    expect(
      readWorkspaceValue(
        storageFor({ "atlas:notes": '"Research"' }),
        "notes",
        "",
      ),
    ).toBe("Research");
    expect(
      readWorkspaceValue(
        storageFor({
          "atlas:auto-scale": "true",
          "financebro:auto-scale": "false",
        }),
        "auto-scale",
        true,
      ),
    ).toBe(false);
  });
  it("falls back to valid legacy data after malformed or invalid new data", () => {
    const validate = (value: unknown) => Array.isArray(value);
    expect(
      readWorkspaceValue(
        storageFor({ "atlas:lists": '["BTC"]', "financebro:lists": "broken" }),
        "lists",
        [],
        validate,
      ),
    ).toEqual(["BTC"]);
    expect(
      readWorkspaceValue(
        storageFor({ "atlas:lists": '["BTC"]', "financebro:lists": "null" }),
        "lists",
        [],
        validate,
      ),
    ).toEqual(["BTC"]);
    expect(
      readWorkspaceValue(
        storageFor({ "atlas:lists": "broken" }),
        "lists",
        ["NVDA"],
        validate,
      ),
    ).toEqual(["NVDA"]);
  });
});
