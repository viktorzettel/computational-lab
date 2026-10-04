import { quarterEnd } from './tracker.mjs';
const dayMs = 86400000;
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = d => d.toISOString().slice(0, 10);
const observed = d => new Date(+d + (d.getUTCDay() === 6 ? -1 : d.getUTCDay() === 0 ? 1 : 0) * dayMs);
const nth = (y, m, weekday, n) => { const d = day(y, m, 1); return new Date(+d + ((weekday - d.getUTCDay() + 7) % 7 + 7 * (n - 1)) * dayMs); };
function holidays(y) {
  const result = new Set();
  for (const year of [y - 1, y, y + 1]) for (const [m, d] of [[1, 1], [6, 19], [7, 4], [11, 11], [12, 25]]) result.add(iso(observed(day(year, m, d))));
  for (const [m, w, n] of [[1, 1, 3], [2, 1, 3], [9, 1, 1], [10, 1, 2], [11, 4, 4]]) result.add(iso(nth(y, m, w, n)));
  const may = day(y, 5, 31);
  result.add(iso(new Date(+may - (may.getUTCDay() + 6) % 7 * dayMs)));
  return result;
}
export function deadline(quarter) {
  let d = new Date(`${quarterEnd(quarter)}T00:00:00Z`);
  d = new Date(+d + 45 * dayMs);
  const closed = holidays(d.getUTCFullYear());
  while ([0, 6].includes(d.getUTCDay()) || closed.has(iso(d))) d = new Date(+d + dayMs);
  // Ask Intl for US Eastern's UTC offset on the filing date, including DST.
  const date = iso(d), probe = new Date(`${date}T17:30:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23'}).formatToParts(probe);
  const offset = 17 - Number(parts.find(p => p.type === 'hour').value);
  return {quarter, periodEnd: quarterEnd(quarter), deadline: `${date}T17:30:00-0${offset}:00`, date};
}
export function filingCalendar(now = new Date()) {
  const upcoming = [];
  for (let y = now.getUTCFullYear() - 1; y < now.getUTCFullYear() + 3; y++) for (let q = 1; q <= 4; q++) {
    const due = deadline(`${y}-Q${q}`);
    if (new Date(due.deadline) > now) upcoming.push(due);
  }
  return {next: upcoming[0], upcoming: upcoming.slice(0, 4), source: 'https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f',
    note: 'The 13F due date, not a promised release time. Managers can file earlier. Timer uses the 5:30 pm US Eastern same-day filing cutoff.'};
}
