# ETF data job

Collects ETF prices and distributions for the simulator. Run it from the Actions tab (Run workflow) or by pushing to this branch.

- `tools/etf/fetch_us_all.py` → branch `etf-data-us`: every US-listed ETF (Nasdaq symbol directory), series kept for ETFs with ≥ $1M average daily trading value
- `tools/etf/fetch_etf.py` → branch `etf-data`: all Korean-listed ETFs (Naver prices, Yahoo distributions) and the major US ETFs in `us_etf_list.json`

The site itself is built and served from `main` (see CLAUDE.md there).
