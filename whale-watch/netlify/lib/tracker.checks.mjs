import test from 'node:test';
import assert from 'node:assert/strict';
import {Cache, compare, parseHoldings, parseManager, filingLinks, selectFilings, chooseHistory, Service, FUNDS} from './tracker.mjs';
import {deadline, filingCalendar} from './calendar.mjs';
import api from '../functions/api.mjs';

const filing = (props = {}) => ({quarter: '2026-Q2', accession: '000177781326000009', form: '13F-HR', filed: '2026-08-14', cik: '0001777813', count: 1, value: 100000, ...props});
const position = (id, quantity = 100, value = 100000) => ({id, cusip: id, symbol: 'TEST', issuer: 'TEST INC', class: 'COM', kind: 'shares', basis: 'shares', quantity, value});
const payload = () => ({data: [['TEST', 'TEST INC', 'COM', '123456789', 100, 100, 100, null, null]]});

test('SEC business-day rollovers, DST and exact deadline rollover', () => {
  for (const [q, date] of [['2026-Q1','2026-05-15'],['2026-Q2','2026-08-14'],['2026-Q3','2026-11-16'],['2026-Q4','2027-02-16'],['2027-Q1','2027-05-17'],['2027-Q2','2027-08-16'],['2027-Q3','2027-11-15'],['2027-Q4','2028-02-14'],['2025-Q4','2026-02-17']]) assert.equal(deadline(q).date, date);
  assert.equal(deadline('2026-Q2').deadline, '2026-08-14T17:30:00-04:00');
  assert.equal(deadline('2026-Q3').deadline, '2026-11-16T17:30:00-05:00');
  assert.equal(filingCalendar(new Date(deadline('2026-Q3').deadline)).next.quarter, '2026-Q4');
});
test('valid public HTML index and original SEC links are parsed with strict units', () => {
  const headers = ['Quarter','Holdings','Value ($000)','Top Holdings','Form Type','Date Filed','Filing ID'];
  const html = `<table id="managerFilings"><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr><tr><td><a href="/13f/000177781326000009-test">Q2 2026</a></td><td>1</td><td>100</td><td>TEST</td><td>13F-HR</td><td>08/14/2026</td><td>000177781326000009</td></tr></table>`;
  assert.equal(parseManager(html, '0001777813')[0].value, 100000);
  assert.equal(parseManager(html.replace('08/14/2026', '8/14/2026'), '0001777813')[0].filed, '2026-08-14');
  assert.throws(() => parseManager(html.replace('Value ($000)', 'Value (USD)'), '0001777813'));
  const h = ['Sym','Issuer Name','Cl','CUSIP','Value ($000)','%','Shares','Principal','Option Type'];
  const detail = `<table id="filingAggregated" data-url="/data/13f/000177781326000009"><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></table><a href="https://www.sec.gov/Archives/edgar/data/test">SEC</a>`;
  assert.equal(filingLinks(detail, filing())[0], '/data/13f/000177781326000009');
  assert.throws(() => filingLinks(detail.replace('data-url="/data/13f/000177781326000009"', 'data-url="/data/other"'), filing()));
});
test('thousand-dollar units, option identities, duplicates and principal quantities', () => {
  const p = payload(); p.data.push([...p.data[0].slice(0,8), 'put'], [...p.data[0].slice(0,8), 'call'], [...p.data[0]]);
  const rows = parseHoldings(p, filing({count:4, value:400000}));
  assert.equal(rows.length, 3); assert.equal(rows.reduce((n,r) => n+r.value,0), 400000);
  assert.equal(rows.find(r => r.kind === 'shares').quantity, 200);
  const bond = {data:[[null,'BOND INC','NOTE','123456789',100,100,null,5000,null]]};
  assert.equal(parseHoldings(bond,filing())[0].basis,'principal');
});
test('malformed or unreconciled holdings never become a partial portfolio', () => {
  for (const mutate of [p=>p.data.pop(),p=>p.data[0].pop(),p=>p.data[0][4]=NaN,p=>p.data[0][4]=-1,p=>p.data[0][4]=true,p=>p.data[0][4]=999999,p=>p.data[0][8]='unknown',p=>p.data[0][7]=100]) {
    const p = payload(); mutate(p); assert.throws(()=>parseHoldings(p,filing()));
  }
});
test('restatements replace older reports, subsequent additions merge', () => {
  const base=filing(), addition=filing({accession:'000177781326000010',form:'NEW HOLDINGS',filed:'2026-08-15'}), restatement=filing({accession:'000177781326000011',form:'RESTATEMENT',filed:'2026-09-02'});
  assert.deepEqual(selectFilings([base,addition,restatement],'2026-Q2'),[restatement]);
  assert.deepEqual(selectFilings([addition,base],'2026-Q2'),[base,addition]);
  assert.throws(()=>selectFilings([addition],'2026-Q2'));
});
test('Pershing consolidation never treats the parent HHH-only report as prior portfolio', () => {
  const result = chooseHistory(FUNDS.find(f=>f.id==='pershing'),[[filing({cik:'parent'}),filing({quarter:'2026-Q1',cik:'parent'})],[filing({quarter:'2026-Q1',cik:'legacy'})]]);
  assert.deepEqual(result.map(f=>f.cik),['parent','legacy']);
});
test('quantity changes, exits, missing prior and price-only changes', () => {
  const rows = compare([position('A',150),position('B',75),position('D')],[position('A'),position('B'),position('C')]);
  const byId=Object.fromEntries(rows.map(r=>[r.id,r]));
  assert.equal(byId.A.changePercent,50); assert.equal(byId.B.changePercent,-25); assert.equal(byId.C.changePercent,-100); assert.equal(byId.D.changePercent,null);
  assert.equal(compare([position('A',100,200000)],[position('A')])[0].status,'unchanged');
  assert.equal(compare([position('A')],null)[0].status,'unavailable');
});
test('cached failures preserve timestamps and stale status; uncached failures throw', async () => {
  const cache = new Cache();
  const first = await cache.load('key',async()=>({real:42}),900);
  cache.memory.set('key',{data:first[0],fetchedAt:'2020-01-01T00:00:00Z'});
  const stale = await cache.load('key',async()=>{throw new Error('offline');},900,true);
  assert.deepEqual(stale,[{real:42},'2020-01-01T00:00:00Z',true]);
  await assert.rejects(()=>cache.load('uncached',async()=>{throw new Error('offline');},900));
});
test('service merges additions and compares only immediately preceding quarter', async () => {
  const records=[filing(),filing({form:'NEW HOLDINGS',accession:'000177781326000010',filed:'2026-08-20'}),filing({quarter:'2026-Q1',accession:'000177781326000006'})];
  const fake={history:async()=>[records,'2026-10-01T10:00:00Z',false],filing:async f=>[{...f,positions:f.accession.endsWith('009')?[position('A',200)]:f.accession.endsWith('010')?[position('B')]:[position('A')],secUrl:'https://www.sec.gov/test',mirrorUrl:'https://13f.info/test'},'2026-10-01T10:00:00Z',false]};
  const result=await new Service(fake).portfolio(FUNDS[0]);
  assert.equal(result.current.count,2); assert.equal(result.current.filings.length,2); assert.equal(result.previousQuarter,'2026-Q1');
  assert.deepEqual(new Set(result.rows.map(r=>r.status)),new Set(['new','added']));
});
test('hosted endpoint rejects unknown managers, invalid quarters and mutations', async () => {
  assert.equal((await api(new Request('https://example.com/api/funds/unknown/portfolio'))).status,404);
  assert.equal((await api(new Request('https://example.com/api/funds/atreides/portfolio?quarter=garbage'))).status,422);
  assert.equal((await api(new Request('https://example.com/api/funds',{method:'POST'}))).status,405);
  assert.deepEqual(await (await api(new Request('https://example.com/.netlify/functions/api/health'))).json(),{ok:true,app:'WhaleWatch'});
});
