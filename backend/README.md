# backend

English | [简体中文](./README_zh.md)

Download original FIT files from iGPSPORT, parse them into SQLite, then export JSON for the home map. The download script is `igpsport/data_sync.py`, the parser is `igpsport/fit_data_parse.py`, and the exporter is `shared/export_db_to_json.py`. Strava uses `strava/data_sync.py` and `strava/strava_data_parse.py`. The two crawlers stay separate. GPX / TCX are not implemented yet.

It signs in at `prod.zh.igpsport.com`, lists activities page by page, then calls `getDownloadUrl`. The file body comes from the signed URL and does not carry the login token.

Downloads land in `backend/data/igpsport/<rideId>.fit`. Strava rides land in `backend/data/strava/<id>.json`. Parsed rides go in `backend/data/igpsport.db` and `backend/data/strava.db`. None of these are committed. The exported list is `data/activities.json` at the repo root; per-ride streams and laps go in `data/rides/<id>.json`. Those files are committed so the frontend can read them. Existing FIT files are skipped. An activity already in SQLite is skipped unless its record stream is missing, in which case that stream is backfilled from the FIT file. If one file fails, the rest continue and the command exits with code 1.

## Setup

You need [uv](https://docs.astral.sh/uv/) and Python 3.12 or newer.

```bash
cp .env.example .env
# set IGPSPORT_PHONE and IGPSPORT_PASSWORD
# or set IGPSPORT_ACCESS_TOKEN from a login response to skip login this run
make refresh igpsport
```

```bash
uv run igpsport-sync --limit 1
uv run fit-parse --limit 1 --db data/igpsport.db
uv run export-activities --db data/igpsport.db
```

Strava has its own database. How to get `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REFRESH_TOKEN` is in [docs/refresh-data.md](../docs/refresh-data.md). Put them in `.env`, then:

```bash
make refresh strava
```

`make fetch strava` refreshes the access token, keeps rides, and writes `data/strava/<id>.json` (summary, streams, and laps). A complete file is skipped. `make parse strava` inserts new rides into `data/strava.db`. `make export strava` writes that database to the site JSON.

## Checks

Format with Black, lint with Ruff. Lefthook runs those on staged Python files. A push that includes `backend/` also runs pytest.

```bash
make format
make check
make test
```

The `Refresh data` Action runs at midnight in Asia/Shanghai. How to set the `DATA_SOURCE` repository variable, the repository secrets, and the Strava keys is in [docs/refresh-data.md](../docs/refresh-data.md).

The license is the same as cyc.earth: GPL-3.0-only.
