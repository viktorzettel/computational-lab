// Hosted equivalent of backend/provider.py and service.py. Both enforce the same
// filing identities, $000 units, amendment rules and quantity comparisons.
import { load } from 'cheerio';
import { getStore } from '@netlify/blobs';
import FUNDS from './funds.json' with { type: 'json' };

export class DataError extends Error {}
export const publicFund = fund => Object.fromEntries(Object.entries(fund).filter(([key]) => key !== 'managers'));
const text = node => node.text().replace(/\s+/g, ' ').trim();
const indexHeaders = ['Quarter', 'Holdings', 'Value ($000)', 'Top Holdings', 'Form Type', 'Date Filed', 'Filing ID'];
const holdingHeaders = ['Sym', 'Issuer Name', 'Cl', 'CUSIP', 'Value ($000)', '%', 'Shares', 'Principal', 'Option Type'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const indexInteger = value => {
  if (!/^\d[\d,]*$/.test(value)) throw new DataError('Invalid filing index number.');
  const n = Number(value.replaceAll(',', ''));
  if (!Number.isSafeInteger(n)) throw new DataError('Invalid filing index number.');
  return n;
};
export function parseManager(content, cik) {
  const $ = load(content), table = $('#managerFilings');
  if (table.length !== 1 || !same(table.find('th').toArray().map(n => text($(n))), indexHeaders)) {
    throw new DataError('The filing index columns changed; values have not been guessed.');
  }
  const records = [];
  for (const row of table.find('tr').toArray()) {
    const cells = $(row).children('td');
    if (!cells.length) continue;
    if (cells.length !== 7) throw new DataError('Incomplete filing index row.');
    const v = cells.toArray().map(n => text($(n))), match = /^Q([1-4]) (\d{4})$/.exec(v[0]);
    const path = cells.eq(0).find('a').attr('href') || '';
    if (!match || !/^\d{18}$/.test(v[6]) || !path.startsWith(`/13f/${v[6]}-`)) throw new DataError('Invalid filing identity.');
    if (!['13F-HR', 'RESTATEMENT', 'NEW HOLDINGS'].includes(v[4])) throw new DataError('Unsupported amendment type.');
    const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v[5]);
    if (!date) throw new DataError('Invalid filing date.');
    const filed = `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`;
    if (new Date(`${filed}T00:00:00Z`).toISOString().slice(0, 10) !== filed) throw new DataError('Invalid filing date.');
    records.push({quarter: `${match[2]}-Q${match[1]}`, count: indexInteger(v[1]), value: indexInteger(v[2]) * 1000,
      form: v[4], filed, accession: v[6], path, cik});
  }
  if (!records.length) throw new DataError('No public 13F reports found.');
  return records;
}
export function filingLinks(content, filing) {
  const $ = load(content), table = $('#filingAggregated');
  const path = `/data/13f/${filing.accession}`;
  if (table.length !== 1 || table.attr('data-url') !== path || !same(table.find('th').toArray().map(n => text($(n))), holdingHeaders)) {
    throw new DataError('Holdings columns, identity or value units changed.');
  }
  const sec = $('a').toArray().map(n => $(n).attr('href') || '').find(url => url.startsWith('https://www.sec.gov/Archives/edgar/data/'));
  if (!sec) throw new DataError('The original SEC source is missing.');
  return [path, sec];
}
function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new DataError('Invalid numeric value in holdings.');
  return value;
}
export function mergePositions(positions) {
  const merged = new Map();
  for (const row of positions) {
    const p = merged.get(row.id);
    if (p) { p.value += row.value; p.quantity += row.quantity; }
    else merged.set(row.id, {...row});
  }
  return [...merged.values()];
}
export function parseHoldings(payload, filing) {
  if (!Array.isArray(payload?.data) || payload.data.length !== filing.count) throw new DataError('Holdings count does not match the index.');
  const positions = payload.data.map(row => {
    if (!Array.isArray(row) || row.length !== 9) throw new DataError('Incomplete holdings row.');
    const [symbol, issuer, shareClass, cusip, value, , shares, principal, option] = row;
    if (![issuer, shareClass, cusip].every(x => typeof x === 'string' && x.trim()) || (symbol !== null && typeof symbol !== 'string')) throw new DataError('Invalid security identity.');
    if (![null, 'put', 'call'].includes(option) || (shares === null) === (principal === null)) throw new DataError('Unknown option or quantity basis.');
    const basis = shares !== null ? 'shares' : 'principal';
    return {id: [cusip.trim(), shareClass.trim().toUpperCase(), option || '', basis].join('|'), symbol, issuer,
      class: shareClass, cusip, kind: option || basis, basis, value: number(value) * 1000, quantity: number(basis === 'shares' ? shares : principal)};
  });
  if (Math.abs(positions.reduce((n, p) => n + p.value, 0) - filing.value) > Math.max(positions.length * 1000, 1000)) throw new DataError('Holdings value does not reconcile with the filing total.');
  return mergePositions(positions);
}
const order = row => `${row.filed}|${row.accession}`;
export function selectFilings(records, quarter) {
  const eligible = records.filter(r => r.quarter === quarter);
  const bases = eligible.filter(r => r.form !== 'NEW HOLDINGS').sort((a, b) => order(b).localeCompare(order(a)));
  if (!bases.length) throw new DataError(`No complete base report is available for ${quarter}.`);
  return [bases[0], ...eligible.filter(r => r.form === 'NEW HOLDINGS' && order(r) > order(bases[0])).sort((a, b) => order(a).localeCompare(order(b)))];
}
export function chooseHistory(fund, histories) {
  return fund.id === 'pershing' ? histories.flatMap((history, i) => history.filter(r => i === 0 ? r.quarter >= '2026-Q2' : r.quarter < '2026-Q2')) : histories[0];
}
export function compare(current, prior) {
  const a = new Map(current.map(r => [r.id, r])), b = new Map((prior || []).map(r => [r.id, r]));
  return [...new Set([...a.keys(), ...b.keys()])].map(id => {
    const after = a.get(id), before = b.get(id);
    let status = 'unavailable', changePercent = null;
    if (prior !== null) {
      if (!after) { status = 'exited'; changePercent = before.quantity ? -100 : null; }
      else if (!before) status = 'new';
      else {
        const delta = after.quantity - before.quantity;
        status = delta > 0 ? 'added' : delta < 0 ? 'trimmed' : 'unchanged';
        changePercent = before.quantity ? delta / before.quantity * 100 : null;
      }
    }
    return {...(after || before), value: after?.value || 0, quantity: after?.quantity || 0,
      previousValue: before?.value || 0, previousQuantity: before?.quantity || 0, status, changePercent,
      present: !!after, previousPresent: !!before, comparable: prior !== null};
  }).sort((a, b) => b.value - a.value || b.previousValue - a.previousValue);
}

// Persistent, site-scoped cache: no API keys, user data or generated holdings.
// Refresh is coalesced for one minute to avoid hammering the public mirror.
export class Cache {
  constructor(storage) { this.storage = storage; this.memory = new Map(); this.pending = new Map(); }
  async load(key, loader, ttl, refresh = false) {
    if (this.pending.has(key)) return this.pending.get(key);
    const work = this.read(key, loader, ttl, refresh);
    this.pending.set(key, work);
    try { return await work; } finally { this.pending.delete(key); }
  }
  async read(key, loader, ttl, refresh) {
    let cached = this.memory.get(key);
    if (!cached && this.storage) { try { cached = await this.storage.get(key, {type: 'json'}); } catch {} }
    if (!cached || !Number.isFinite(Date.parse(cached.fetchedAt)) || !('data' in cached)) cached = null;
    const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (cached && age < (refresh ? 60 : ttl) * 1000) return [cached.data, cached.fetchedAt, false];
    try {
      const data = await loader(), fetchedAt = new Date().toISOString();
      this.memory.set(key, {data, fetchedAt});
      if (this.storage) { try { await this.storage.setJSON(key, {data, fetchedAt}); } catch {} }
      return [data, fetchedAt, false];
    } catch (error) {
      if (cached) return [cached.data, cached.fetchedAt, true];
      throw error;
    }
  }
}
let gate = Promise.resolve(), nextStart = 0;
async function get(path) {
  const turn = gate.then(async () => {
    const delay = Math.max(0, nextStart - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextStart = Date.now() + 350;
  });
  gate = turn.catch(() => {});
  await turn;
  const response = await fetch(`https://13f.info${path}`, {signal: AbortSignal.timeout(15000), headers: {'User-Agent': 'WhaleWatch/0.1 public research'}});
  if (!response.ok) throw new Error(`Public filing mirror returned ${response.status}.`);
  return response;
}
export class Provider {
  constructor(cache) { this.cache = cache; }
  history(manager, refresh) {
    return this.cache.load(`manager-v1:${manager}`, async () => parseManager(await (await get(`/manager/${manager}`)).text(), manager.slice(0, 10)), 900, refresh);
  }
  filing(filing, refresh) {
    return this.cache.load(`filing-v1:${filing.accession}`, async () => {
      const [path, secUrl] = filingLinks(await (await get(filing.path)).text(), filing);
      return {...filing, positions: parseHoldings(await (await get(path)).json(), filing), secUrl, mirrorUrl: `https://13f.info${filing.path}`};
    }, 86400 * 30, refresh);
  }
}
export const previousQuarter = quarter => { const [year, q] = quarter.split('-Q').map(Number); return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`; };
export const quarterEnd = quarter => { const [year, q] = quarter.split('-Q').map(Number); return new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10); };
const minTime = times => [...times].sort()[0];
const quartersFor = history => [...new Set(history.filter(r => r.form !== 'NEW HOLDINGS').map(r => r.quarter))].sort().reverse().slice(0, 12);
export class Service {
  constructor(provider) { this.provider = provider; }
  async history(fund, refresh) {
    const results = [];
    for (const manager of fund.managers) results.push(await this.provider.history(manager, refresh));
    return [chooseHistory(fund, results.map(r => r[0])), results.map(r => r[1]), results.some(r => r[2])];
  }
  async catalog(refresh) {
    const result = [];
    // Batches of three match the local server's connection limit.
    for (let i = 0; i < FUNDS.length; i += 3) {
      result.push(...await Promise.all(FUNDS.slice(i, i + 3).map(async fund => {
        try {
          const [history, times, stale] = await this.history(fund, refresh), quarters = quartersFor(history), latest = selectFilings(history, quarters[0]);
          return {...publicFund(fund), quarters, latestQuarter: quarters[0], latestFiled: latest.map(r => r.filed).sort().at(-1),
            reportedValue: latest.reduce((n, r) => n + r.value, 0), amendment: latest.some(r => r.form !== '13F-HR'), retrievedAt: minTime(times), stale, error: null};
        } catch (error) {
          console.warn('Filing index retrieval failed', fund.id, error.message, error.cause?.code || '');
          return {...publicFund(fund), quarters: [], latestQuarter: null, reportedValue: null, error: 'Public filing index unavailable. Retry to check for filings.'};
        }
      })));
    }
    return result;
  }
  async snapshot(history, quarter, refresh) {
    const filings = selectFilings(history, quarter), results = [];
    for (const filing of filings) results.push(await this.provider.filing(filing, refresh));
    const positions = mergePositions(results.flatMap(r => r[0].positions));
    return {quarter, periodEnd: quarterEnd(quarter), filed: filings.map(r => r.filed).sort().at(-1),
      value: positions.reduce((n, r) => n + r.value, 0), count: positions.length, filerCik: filings[0].cik,
      retrievedAt: minTime(results.map(r => r[1])), stale: results.some(r => r[2]), positions,
      filings: results.map(r => Object.fromEntries(['accession', 'form', 'filed', 'secUrl', 'mirrorUrl', 'cik'].map(k => [k, r[0][k]])))};
  }
  async portfolio(fund, quarter, refresh) {
    const [history, times, stale] = await this.history(fund, refresh), quarters = quartersFor(history);
    quarter ||= quarters[0];
    if (!quarters.includes(quarter)) throw new DataError('Choose one of the available reporting quarters.');
    const current = await this.snapshot(history, quarter, refresh), priorQuarter = previousQuarter(quarter);
    let prior = null, warning = null;
    try { prior = await this.snapshot(history, priorQuarter, refresh); }
    catch { warning = `Previous quarter (${priorQuarter}) is unavailable. Change calculations are hidden.`; }
    const rows = compare(current.positions, prior?.positions ?? null);
    delete current.positions;
    if (prior) delete prior.positions;
    return {fund: publicFund(fund), quarters, current, previous: prior, previousQuarter: priorQuarter, rows,
      scopeChanged: !!prior && current.filerCik !== prior.filerCik, warning,
      stale: stale || current.stale || !!prior?.stale, indexRetrievedAt: minTime(times), provider: '13f.info', currency: 'USD',
      comparisonNote: 'Changes compare reported quantities, not confirmed trades. Splits, corporate actions, confidential positions and reporting changes can affect comparisons. Dollar changes also reflect prices.'};
  }
}
export function createService() {
  let storage;
  try { storage = getStore({name: 'whalewatch-filings', consistency: 'strong'}); } catch {}
  return new Service(new Provider(new Cache(storage)));
}
export { FUNDS };
