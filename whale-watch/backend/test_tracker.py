from datetime import datetime, timezone
import json

import httpx
import pytest

from .calendar import deadline, filing_calendar, previous_quarter
from .funds import BY_ID
from .provider import Cache, DataError, filing_links, merge_positions, parse_holdings, parse_manager
from .service import Service, choose_history, compare, select_filings


def filing(quarter="2026-Q2", accession="000177781326000009", form="13F-HR", filed="2026-08-14", cik="0001777813", count=1, value=100000):
    return dict(quarter=quarter, accession=accession, form=form, filed=filed, cik=cik, count=count, value=value, path=f"/13f/{accession}-test")


def position(cusip="123456789", value=100000, quantity=100, kind="shares", share_class="COM"):
    basis = "principal" if kind == "principal" else "shares"
    return dict(id="|".join((cusip, share_class, kind if kind in ("put", "call") else "", basis)),
                cusip=cusip, symbol="TEST", issuer="TEST INC", **{"class": share_class}, kind=kind, basis=basis, value=value, quantity=quantity)


@pytest.mark.parametrize("quarter,date",[("2026-Q1","2026-05-15"),("2026-Q2","2026-08-14"),("2026-Q3","2026-11-16"),("2026-Q4","2027-02-16"),("2027-Q1","2027-05-17"),("2027-Q2","2027-08-16"),("2027-Q3","2027-11-15"),("2027-Q4","2028-02-14"),("2025-Q4","2026-02-17")])
def test_verified_sec_calendar(quarter, date):
    due = deadline(quarter)
    assert due.date().isoformat() == date
    assert (due.hour, due.minute) == (17, 30)


def test_calendar_rollover_and_dst():
    calendar = filing_calendar(datetime(2026, 10, 1, tzinfo=timezone.utc))
    assert calendar["next"]["quarter"] == "2026-Q3"
    assert calendar["next"]["deadline"].endswith("-05:00")
    assert deadline("2026-Q2").isoformat().endswith("-04:00")
    assert filing_calendar(deadline("2026-Q3"))["next"]["quarter"] == "2026-Q4"
    assert previous_quarter("2026-Q1") == "2025-Q4"


def test_latest_restatement_replaces_base_and_old_additions():
    base=filing()
    addition=filing(accession="000177781326000010",form="NEW HOLDINGS",filed="2026-08-15")
    restated=filing(accession="000177781326000011",form="RESTATEMENT",filed="2026-09-02")
    assert select_filings([base,addition,restated],"2026-Q2") == [restated]


def test_additional_holdings_merge_after_complete_report():
    base=filing()
    addition=filing(accession="000177781326000010",form="NEW HOLDINGS",filed="2026-08-15")
    assert select_filings([addition,base],"2026-Q2") == [base,addition]
    with pytest.raises(DataError):
        select_filings([addition],"2026-Q2")


def test_pershing_parent_is_not_used_as_entire_prior_portfolio():
    parent=[filing(cik="0002026053"),filing(quarter="2026-Q1",cik="0002026053",count=1)]
    legacy=[filing(quarter="2026-Q1",cik="0001336528",count=11)]
    selected=choose_history(BY_ID["pershing"],[parent,legacy])
    assert [(f["quarter"],f["cik"]) for f in selected] == [("2026-Q2","0002026053"),("2026-Q1","0001336528")]


def test_mirror_always_reports_thousands_of_dollars_and_separates_options():
    f=filing(count=3,value=300000)
    payload={"data":[["TEST","TEST INC","COM","123456789",100,33.3,100,None,None],
                     ["TEST","TEST INC","COM","123456789",100,33.3,100,None,"put"],
                     ["TEST","TEST INC","COM","123456789",100,33.3,100,None,"call"]]}
    rows=parse_holdings(payload,f)
    assert sum(r["value"] for r in rows) == 300000
    assert len({r["id"] for r in rows}) == 3
    assert {r["kind"] for r in rows} == {"shares","put","call"}


@pytest.mark.parametrize("mutate",[
    lambda p:p["data"].pop(),
    lambda p:p["data"][0].pop(),
    lambda p:p["data"][0].__setitem__(4,float("nan")),
    lambda p:p["data"][0].__setitem__(4,-1),
    lambda p:p["data"][0].__setitem__(4,True),
    lambda p:p["data"][0].__setitem__(4,999999),
    lambda p:p["data"][0].__setitem__(8,"unknown"),
    lambda p:p["data"][0].__setitem__(7,100),
])
def test_bad_payload_is_rejected_without_partial_data(mutate):
    payload={"data":[["TEST","TEST INC","COM","123456789",100,100,100,None,None]]}
    mutate(payload)
    with pytest.raises(DataError): parse_holdings(payload,filing())


def test_principal_is_not_mixed_with_shares():
    rows=parse_holdings({"data":[[None,"BOND INC","NOTE","123456789",100,100,None,5000,None]]},filing())
    assert rows[0]["basis"] == "principal"
    assert rows[0]["quantity"] == 5000


def test_duplicate_economic_positions_are_summed_but_classes_are_distinct():
    rows=merge_positions([position(),position(),position(share_class="CL A")])
    assert len(rows) == 2
    assert rows[0]["value"] == 200000
    assert rows[0]["quantity"] == 200


def test_comparison_tracks_quantity_not_price_or_ticker():
    before=position(value=100000,quantity=100)
    after=position(value=200000,quantity=100)
    after["symbol"]="RENAMED"
    row=compare([after],[before])[0]
    assert row["status"] == "unchanged"
    assert row["changePercent"] == 0
    assert row["previousValue"] == 100000


def test_new_exited_added_and_trimmed_have_correct_rates():
    prior=[position("A",quantity=100),position("B",quantity=100),position("C",quantity=100)]
    current=[position("A",quantity=150),position("B",quantity=75),position("D",quantity=50)]
    rows={r["cusip"]:r for r in compare(current,prior)}
    assert (rows["A"]["status"],rows["A"]["changePercent"]) == ("added",50)
    assert (rows["B"]["status"],rows["B"]["changePercent"]) == ("trimmed",-25)
    assert (rows["C"]["status"],rows["C"]["changePercent"]) == ("exited",-100)
    assert rows["D"]["status"] == "new" and rows["D"]["changePercent"] is None


def test_missing_prior_does_not_label_every_position_new():
    row=compare([position()],None)[0]
    assert row["status"] == "unavailable" and row["changePercent"] is None
    assert not row["comparable"]


def test_cached_failure_preserves_original_timestamp(tmp_path):
    cache=Cache(tmp_path)
    first=cache.load("test",lambda:{"real":42},ttl=900)
    def fail(): raise httpx.ConnectError("offline")
    stale=cache.load("test",fail,ttl=900,refresh=True)
    assert stale == (first[0],first[1],True)
    with pytest.raises(httpx.ConnectError): cache.load("uncached",fail,ttl=900)


def test_changed_index_columns_are_rejected():
    with pytest.raises(DataError): parse_manager('<table id="managerFilings"><th>Value (USD)</th></table>',"0001777813")


def test_filing_json_url_must_match_discovered_accession():
    with pytest.raises(DataError): filing_links('<table id="filingAggregated" data-url="/data/13f/other"></table>',filing())


def test_service_merges_additions_and_compares_immediately_previous_quarter():
    records=[filing(),filing(form="NEW HOLDINGS",accession="000177781326000010",filed="2026-08-20"),filing(quarter="2026-Q1",accession="000177781326000006")]
    class FakeProvider:
        def history(self,manager,refresh):return records,"2026-10-01T10:00:00+00:00",False
        def filing(self,f,refresh):
            items=[position("A",quantity=200)] if f["accession"].endswith("009") else [position("B")] if f["accession"].endswith("010") else [position("A")]
            return {**f,"positions":items,"secUrl":"https://www.sec.gov/example","mirrorUrl":"https://13f.info/example"},"2026-10-01T10:00:00+00:00",False
    portfolio=Service(FakeProvider()).portfolio(BY_ID["atreides"])
    assert portfolio["previousQuarter"] == "2026-Q1"
    assert portfolio["current"]["count"] == 2
    assert len(portfolio["current"]["filings"]) == 2
    assert {r["status"] for r in portfolio["rows"]} == {"new","added"}


def test_cache_stores_serializable_data_atomically(tmp_path):
    cache=Cache(tmp_path)
    cache.load("holdings",lambda:[position()],ttl=900)
    files=list(tmp_path.iterdir())
    assert len(files) == 1 and files[0].suffix == ".json"
    assert json.loads(files[0].read_text())["data"][0]["value"] == 100000
