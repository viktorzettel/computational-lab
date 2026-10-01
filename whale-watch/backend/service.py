from concurrent.futures import ThreadPoolExecutor

from .calendar import previous_quarter, quarter_end
from .funds import FUNDS, public_fund
from .provider import DataError, merge_positions


def select_filings(records, quarter):
    eligible = [r for r in records if r["quarter"] == quarter]
    bases = [r for r in eligible if r["form"] != "NEW HOLDINGS"]
    if not bases:
        raise DataError(f"No complete base report is available for {quarter}.")
    base = max(bases, key=lambda r: (r["filed"], r["accession"]))
    additions = sorted((r for r in eligible if r["form"] == "NEW HOLDINGS"
                        and (r["filed"], r["accession"]) > (base["filed"], base["accession"])),
                       key=lambda r: (r["filed"], r["accession"]))
    return [base, *additions]


def choose_history(fund, histories):
    if fund["id"] != "pershing":
        return histories[0]
    # Before consolidation, the parent filed only its separate HHH stake.
    # Using that as the whole prior portfolio would manufacture exits/new positions.
    return [r for i, history in enumerate(histories) for r in history
            if (i == 0 and r["quarter"] >= "2026-Q2") or (i == 1 and r["quarter"] < "2026-Q2")]


def compare(current, prior):
    current_map = {r["id"]: r for r in current}
    previous_map = {r["id"]: r for r in prior} if prior is not None else {}
    rows = []
    for key in current_map.keys() | previous_map.keys():
        after, before = current_map.get(key), previous_map.get(key)
        row = dict(after or before)
        row["value"] = after["value"] if after else 0
        row["quantity"] = after["quantity"] if after else 0
        row["previousValue"] = before["value"] if before else 0
        row["previousQuantity"] = before["quantity"] if before else 0
        if prior is None:
            status, rate = "unavailable", None
        elif not after:
            status, rate = "exited", -100 if before["quantity"] else None
        elif not before:
            status, rate = "new", None
        else:
            delta = after["quantity"] - before["quantity"]
            status = "added" if delta > 0 else "trimmed" if delta < 0 else "unchanged"
            rate = delta / before["quantity"] * 100 if before["quantity"] else None
        row.update(status=status, changePercent=rate, present=after is not None,
                   previousPresent=before is not None, comparable=prior is not None)
        rows.append(row)
    return sorted(rows, key=lambda r: (r["value"], r["previousValue"]), reverse=True)


class Service:
    def __init__(self, provider):
        self.provider = provider

    def history(self, fund, refresh=False):
        results = [self.provider.history(manager, refresh) for manager in fund["managers"]]
        return choose_history(fund, [r[0] for r in results]), [r[1] for r in results], any(r[2] for r in results)

    def catalog(self, refresh=False):
        def summary(fund):
            item = public_fund(fund)
            try:
                history, times, stale = self.history(fund, refresh)
                quarters = sorted({r["quarter"] for r in history if r["form"] != "NEW HOLDINGS"}, reverse=True)[:12]
                latest = select_filings(history, quarters[0])
                item.update(quarters=quarters, latestQuarter=quarters[0],
                            latestFiled=max(r["filed"] for r in latest),
                            reportedValue=sum(r["value"] for r in latest),
                            amendment=any(r["form"] != "13F-HR" for r in latest),
                            retrievedAt=min(times), stale=stale, error=None)
            except Exception:
                item.update(quarters=[], latestQuarter=None, reportedValue=None,
                            error="Public filing index unavailable. Retry to check for filings.")
            return item
        with ThreadPoolExecutor(max_workers=3) as pool:
            return list(pool.map(summary, FUNDS))

    def snapshot(self, history, quarter, refresh):
        filings = select_filings(history, quarter)
        results = [self.provider.filing(filing, refresh) for filing in filings]
        positions = merge_positions([position for result in results for position in result[0]["positions"]])
        return {"quarter": quarter, "periodEnd": quarter_end(quarter).isoformat(),
                "filed": max(r["filed"] for r in filings),
                "value": sum(r["value"] for r in positions), "count": len(positions),
                "filerCik": filings[0]["cik"], "retrievedAt": min(r[1] for r in results),
                "stale": any(r[2] for r in results),
                "filings": [{k: r[0][k] for k in ("accession", "form", "filed", "secUrl", "mirrorUrl", "cik")} for r in results],
                "positions": positions}

    def portfolio(self, fund, quarter=None, refresh=False):
        history, times, stale = self.history(fund, refresh)
        quarters = sorted({r["quarter"] for r in history if r["form"] != "NEW HOLDINGS"}, reverse=True)[:12]
        quarter = quarter or quarters[0]
        if quarter not in quarters:
            raise DataError("Choose one of the available reporting quarters.")
        current = self.snapshot(history, quarter, refresh)
        prior_quarter = previous_quarter(quarter)
        prior, warning = None, None
        try:
            prior = self.snapshot(history, prior_quarter, refresh)
        except Exception:
            warning = f"Previous quarter ({prior_quarter}) is unavailable. Change calculations are hidden."
        scope_change = prior is not None and current["filerCik"] != prior["filerCik"]
        rows = compare(current.pop("positions"), prior.pop("positions") if prior else None)
        return {"fund": public_fund(fund), "quarters": quarters, "current": current, "previous": prior,
                "previousQuarter": prior_quarter, "rows": rows, "scopeChanged": scope_change,
                "warning": warning, "stale": stale or current["stale"] or bool(prior and prior["stale"]),
                "indexRetrievedAt": min(times), "provider": "13f.info", "currency": "USD",
                "comparisonNote": "Changes compare reported quantities, not confirmed trades. Splits, corporate actions, confidential positions and reporting changes can affect comparisons. Dollar changes also reflect prices."}
