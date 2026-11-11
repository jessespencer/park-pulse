# Park Pulse

Deviations from the global prefs: the app is **vanilla TypeScript + D3, not React**. The spec asked for D3, and
views are small imperative renderers in `app/src/views/` built with the `h()` helper in `app/src/ui.ts`.

## Commands
- Data: `cd pipeline && .venv/bin/python fetch_data.py && .venv/bin/python fetch_metadata.py && .venv/bin/python build.py`
- App: `cd app && npm run dev` / `npm run build` (tsc + vite; static output in `app/dist/`)

## Architecture
- `pipeline/build.py` is the single source of derived numbers (share, index, YoY, profiles, notes). The app only formats and draws them. Change measures there, not in TS.
- `app/public/data/` is generated output: `index.json` (all park summaries), `national.json`, `parks/{CODE}.json`.
- `app/src/state.ts` holds all UI state and round-trips it through the URL query string. Add new selections there, including the per-view key list `VIEW_KEYS`.
- Color scales are theme-aware (`scales.ts`): viridis is flipped so "more" always means more contrast against the background, and views re-render on theme change.

## Rules
- Unit-code mismatches between IRMA and the NPS API go in `CROSSWALK` in `build.py`. Verify against published visit totals before adding an alias, since codes are easy to guess wrong (JEFM ≠ JEFF).
- Never interpolate or fill visit counts. If a source download or format check fails, stop and report.
- `NPS_API_KEY` comes from env or `pipeline/.env`, is sent as the `X-Api-Key` header, and is never put in URLs. There's no scraping fallback.
