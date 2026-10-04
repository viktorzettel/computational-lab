import { createService, DataError, FUNDS } from '../lib/tracker.mjs';
import { filingCalendar } from '../lib/calendar.mjs';
import { gzipSync } from 'node:zlib';

let service;
export default async function api(request) {
  const url = new URL(request.url), refresh = url.searchParams.get('refresh') === 'true';
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
  if (request.method !== 'GET') return Response.json({detail: 'Use GET.'}, {status: 405});
  service ||= createService();
  let data;
  try {
    if (path === '/api/health') data = {ok: true, app: 'WhaleWatch'};
    else if (path === '/api/calendar') data = filingCalendar();
    else if (path === '/api/funds') data = {funds: await service.catalog(refresh), calendar: filingCalendar()};
    else {
      const match = /^\/api\/funds\/([a-z]+)\/portfolio$/.exec(path);
      const fund = match && FUNDS.find(f => f.id === match[1]);
      if (!fund) return Response.json({detail: 'Unknown manager or endpoint.'}, {status: 404});
      const quarter = url.searchParams.get('quarter');
      if (quarter && !/^\d{4}-Q[1-4]$/.test(quarter)) return Response.json({detail: 'Invalid reporting quarter.'}, {status: 422});
      data = await service.portfolio(fund, quarter, refresh);
    }
    const body = JSON.stringify(data);
    const headers = {'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Vary': 'Accept-Encoding'};
    // Citadel has thousands of rows; compress before the function response limit.
    if (body.length > 1000 && /\bgzip\b/.test(request.headers.get('accept-encoding') || '')) {
      return new Response(gzipSync(body), {headers: {...headers, 'Content-Encoding': 'gzip'}});
    }
    return new Response(body, {headers});
  } catch (error) {
    return Response.json({detail: error instanceof DataError ? error.message : 'The public filing provider is unavailable. Please retry. No sample holdings have been substituted.'}, {status: error instanceof DataError ? 422 : 503});
  }
}
