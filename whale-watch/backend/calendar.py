"""13F deadlines: quarter end + 45 days, rolled to an SEC business day."""
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

SEC_FAQ = "https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f"


def quarter_end(quarter: str) -> date:
    year, part = quarter.split("-Q")
    month = int(part) * 3
    return date(int(year), month, monthrange(int(year), month)[1])


def previous_quarter(quarter: str) -> str:
    year, part = map(int, quarter.split("-Q"))
    return f"{year - 1}-Q4" if part == 1 else f"{year}-Q{part - 1}"


def observed(day: date) -> date:
    return day - timedelta(days=1) if day.weekday() == 5 else day + timedelta(days=1) if day.weekday() == 6 else day


def nth_weekday(year, month, weekday, nth):
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (nth - 1))


def holidays(year: int) -> set[date]:
    # Federal holidays observed by EDGAR. Good Friday is not an SEC holiday.
    days = {observed(date(y, m, d)) for y in (year - 1, year, year + 1)
            for m, d in ((1, 1), (6, 19), (7, 4), (11, 11), (12, 25))}
    days |= {nth_weekday(year, 1, 0, 3), nth_weekday(year, 2, 0, 3),
             nth_weekday(year, 9, 0, 1), nth_weekday(year, 10, 0, 2),
             nth_weekday(year, 11, 3, 4)}
    last_may = date(year, 5, 31)
    days.add(last_may - timedelta(days=last_may.weekday()))
    return days


def deadline(quarter: str) -> datetime:
    day = quarter_end(quarter) + timedelta(days=45)
    closed = holidays(day.year)
    while day.weekday() > 4 or day in closed:
        day += timedelta(days=1)
    return datetime.combine(day, time(17, 30), ZoneInfo("America/New_York"))


def filing_calendar(now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    upcoming = []
    for year in range(now.year - 1, now.year + 3):
        for part in range(1, 5):
            quarter = f"{year}-Q{part}"
            due = deadline(quarter)
            if due > now:
                upcoming.append({"quarter": quarter, "periodEnd": quarter_end(quarter).isoformat(),
                                 "deadline": due.isoformat(), "date": due.date().isoformat()})
    return {"next": upcoming[0], "upcoming": upcoming[:4], "source": SEC_FAQ,
            "note": "The 13F due date, not a promised release time. Managers can file earlier. Timer uses the 5:30 pm US Eastern same-day filing cutoff."}
