# WhaleWatch

**See what the big fish are holding.** WhaleWatch is a free, open-source portfolio tracker for learning from some of the best-known investors. See what Atreides, Citadel (including Wellington), Stanley Druckenmiller’s Duquesne, Warren Buffett’s Berkshire, and Bill Ackman’s Pershing Square reported owning—and what they added, trimmed, bought for the first time, or sold out of since the previous quarter.

Pick an investor, explore the holdings pie chart, and compare position sizes without digging through filing tables. Headshots make it easy to find your favorites; source links, CSV export, and a countdown to the next filing deadline help you keep following the story.

The tracker shows quarterly public 13F snapshots. It helps you understand changes in reported portfolios; it cannot show live trades, exact trade dates, or everything a fund owns.

**[Open WhaleWatch in your browser](https://whalewatch-viktor.netlify.app/)** — no installation or API key needed.

## Clone it

Anyone can clone the source, run their own copy, and adapt the project-authored MIT-licensed code:

```sh
git clone https://github.com/viktorzettel/computational-lab.git
cd computational-lab/whale-watch
npm run setup
npm start
```

## Hosted version

The public app runs on Netlify at <https://whalewatch-viktor.netlify.app/>. The React interface uses the same `/api` routes as the local app. `netlify/functions/api.mjs` provides a JavaScript equivalent of the local Python server, with the same strict value-unit checks, amendment handling, reporting-entity boundaries, and quantity comparisons. It reads the public mirror on demand and uses a site-scoped Netlify Blobs cache. No fixed demo portfolios are substituted. Indexes recheck every 15 minutes; filing data caches for 30 days. Refresh rechecks data, coalesced to once per minute to protect the provider. Failed retrievals preserve the existing cache timestamp and show a stale notice. Netlify hosting usage is subject to the site owner's plan.

To deploy your own copy, use `whale-watch` as the base directory and its `netlify.toml` configuration. Build with `npm run build` and publish `dist`; functions live in `netlify/functions`. For manual deployment after building, use `netlify deploy --dir dist --functions netlify/functions --prod` in this folder with your own Netlify login and site. Keep account credentials out of Git.

## Run

After installing dependencies (see fresh-checkout setup below), launch from this folder:

```sh
./launch.sh
```

Or, with a working Node installation:

```sh
npm start
```

Open **http://127.0.0.1:5174**. The API is at **http://127.0.0.1:8001/docs**. Ctrl+C stops both services. The app has its own package, Python environment, cache, and ports; FinanceBro can remain running on 5173/8000.

The launcher prefers a working Homebrew Node 24 or 22 when installed, then checks the Node executable on PATH. It does not modify system Node or kill existing servers. If either app port is occupied, it reports the conflict and exits.

For a fresh checkout, install Node 20.19+ (22.12+ for Node 22) and Python 3.10+, then:

```sh
npm run setup
npm start
```

`setup` installs npm packages, creates `.venv`, and installs `backend/requirements.txt`. Python on systems without an IANA timezone database also needs `tzdata`, included in the requirements.

## Features

- Five fund cards with circular, locally bundled headshots.
- Latest reported quarter plus the previous 11 reporting quarters.
- Interactive allocation donut: top ten positions plus an exact “Other” subtotal. Select a slice or legend entry to filter the holdings table; slices support Enter/Space.
- Shares, calls, puts, and all reported instruments; a principal-denominated position remains distinct from shares.
- Current/prior quantities and values, quantity change %, portfolio-weight change in percentage points, and new/added/trimmed/exited badges.
- Ticker/issuer/CUSIP/class search, activity filters, sorting, 50-row pagination, and CSV export of all filtered rows.
- Original SEC filing receipts, mirror links, amendment labels, retrieval timestamps, and stale-cache notices.
- Live countdown to the next 13F deadline, plus the next four due dates.
- Responsive layout, keyboard controls, reduced-motion support, and local fonts.

## Reporting scope

**These are latest publicly reported holdings, not live current portfolios.** 13F snapshots cover reportable securities at quarter end. They omit cash, shorts, many non-US instruments, and other assets. Reported value is not a manager's AUM or performance.

| Card                             | Reporting filer                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Atreides / Gavin Baker           | Atreides Management, LP, CIK 1777813                                                             |
| Citadel / Ken Griffin            | Citadel Advisors LLC, CIK 1423053                                                                |
| Duquesne / Stanley Druckenmiller | Duquesne Family Office LLC, CIK 1536411                                                          |
| Berkshire / Warren Buffett       | Berkshire Hathaway Inc., CIK 1067983                                                             |
| Pershing / Bill Ackman           | Pershing Square Inc., CIK 2026053, from Q2 2026; Capital Management LP, CIK 1336528, before that |

Wellington is a Citadel fund. Citadel's 13F combines reporting managers: **it does not provide an isolated Wellington portfolio**. See [Citadel's history](https://www.citadel.com/who-we-are/) and the original filing receipts in the app.

Pershing's consolidated Q2 2026 parent report differs in scope from its previous Capital Management LP report. The prior parent filing contained only a separate HHH stake and is deliberately not treated as the previous entire investment portfolio. Comparisons across the consolidation boundary are labeled as a reporting-scope change; they can reflect consolidation rather than trades. Other quarters compare like-for-like reporting entities.

Headshots identify individuals associated with their firms. The reports are institutional, not personal portfolios. Buffett is shown as Berkshire's chairman.

## Data and calculations

The backend reads public, unauthenticated **[13f.info](https://13f.info)** manager indexes and their publicly linked aggregate holdings JSON. Each filing links to its original SEC filing. Direct SEC requests from this machine returned 403, so the app uses the accessible public mirror; it does not claim to be a direct SEC API feed. No API key or paid plan is required. New/uncached reports need internet access.

The mirror's values are explicitly **$000** and are multiplied by 1,000. This is separate from raw SEC XML, whose value units changed in 2023. Row counts and summed values are checked against the index; the summation tolerance is $1,000 per rounded row. Unknown formats, incomplete rows, or mismatched totals fail visibly rather than producing partial portfolios.

Position identity is CUSIP + security class + put/call + share/principal basis. Duplicate economic positions are aggregated. Tickers are display metadata and can be absent or lag a rename. Quantity change is `(current - prior) / prior × 100`; new positions have no finite growth rate. An exit has zero current quantity and -100% when its prior quantity is positive. Weights use the entire selected instrument universe in each quarter, including prior exits in the prior denominator; search/activity filters do not change the denominator. Dollar changes also reflect price moves and are not returns.

The newest complete report for each quarter wins. A **RESTATEMENT** replaces the base report. Subsequent **NEW HOLDINGS** amendments are added to the complete report, with matching security identities aggregated. Historical views include amendments publicly available today, not a point-in-time reconstruction of what was public on the original filing day. Comparison always uses the immediately previous calendar quarter. If it is unavailable, changes are hidden rather than comparing a different quarter.

Indexes cache for 15 minutes and accession-specific holdings for 30 days. Refresh rechecks the selected report and its comparison. Provider failures use an existing valid cache only, preserving its original retrieval timestamp and visibly labeling it stale. No generated sample holdings are substituted. Cache files live in `backend/data/` and are ignored by Git. Override with `WHALEWATCH_CACHE_DIR` if needed.

The provider limits outbound requests to about 2.8 per second with at most three connections. Large portfolios use API compression and client-side pagination.

## Deadline calculation

13F is due 45 days after quarter end, rolled forward over weekends and US federal holidays. The countdown uses the 5:30 pm America/New_York cutoff for the same-day filing date, with DST, and displays dates in Europe/Berlin. Managers can publish before the deadline; this is not a predicted exact release time. The next deadline as of October 1, 2026 is **November 16, 2026**, for Q3 2026.

Sources: [SEC 13F FAQ and calendar](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f), [SEC EDGAR Filer Manual](https://www.sec.gov/files/edgar/filermanual/edgarfm-vol2-v77.pdf). Exceptional unscheduled SEC closures are not predicted by the regular holiday calendar.

## Validation

```sh
npm run build
npm test
npm run test:backend
npm run test:hosted
```

Backend regressions cover SEC deadline rollovers, amendments, Pershing's reporting transition, option/principal separation, value units, malformed payload rejection, quantity comparisons, and stale caching. Frontend tests cover allocation denominators, exited holdings, top-ten aggregation, and countdown behavior. Browser checks cover all five managers, quarter selection, Citadel pagination/search, keyboard slice filtering, expanded details, exits, and the mobile layout.

See [third-party notices](THIRD_PARTY_NOTICES.md) for portrait sources and font licenses.

## License

Project-authored code is available under the [MIT License](LICENSE). Third-party photos, fonts and other assets retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
