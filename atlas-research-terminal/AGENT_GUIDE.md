# Make FinanceBro yours

This is a free, local charting app. Bring your own AI coding agent to edit this repository. There is no built-in agent chat or hosted AI endpoint.

## Start and check a change

- Run `npm run setup`, then `npm start` (Node and Python requirements are in README.md).
- Open http://127.0.0.1:5173. The documented local API is at http://127.0.0.1:8000/docs.
- After changing code, run `npm run build`, `npm test`, and `.venv/bin/python -m pytest backend/tests` as appropriate to the change.
- Keep credentials in ignored environment files and keep generated data out of Git.

## Add a custom indicator

1. Read `src/lib/types.ts`, `src/lib/indicators.ts` and `docs/indicators.md`.
2. Add the indicator kind, picker metadata, parameters and calculation. Return timestamped series and set the right chart pane.
3. Check `src/components/MarketChart.tsx` and `src/components/IndicatorPicker.tsx` for any rendering or control changes.
4. Add meaningful checks for warm-up, empty histories and the formula. Indicator instances must remain independent; do not add a quota.

Try: “Add a configurable 20-day price breakout indicator. Explain its formula, make it searchable in the picker, and check it against a small known price series.”

## Add data or a research view

- Data provider interface: `backend/app/providers/base.py`; registration: `backend/app/main.py`.
- Python model interface and example: `backend/app/research.py`.
- Client API: `src/lib/api.ts`; workspace: `src/App.tsx`.
- The existing local `/api/models` and EWMA volatility endpoints show how to expose model results. Chart integration for a new model must be built explicitly.

Try: “Add my CSV file as a clearly labeled local data source,” or “Add a research pane for the existing EWMA volatility model.”

Preserve source labels and clearly identify generated/demo prices. Keep secrets and paid AI accounts outside the published project.
