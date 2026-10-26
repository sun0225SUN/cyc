# backend

English | [简体中文](./README_zh.md)

Download original FIT files from iGPSPORT, parse them into SQLite, then export JSON for the home map. The download script is `src/igpsport_sync.py`, the parser is `src/fit_parse.py`, and the exporter is `src/export_activities.py`. GPX / TCX are not implemented yet.

It signs in at `prod.zh.igpsport.com`, lists activities page by page, then calls `getDownloadUrl`. The file body comes from the signed URL and does not carry the login token.

Downloads land in `backend/data/raw/<rideId>.fit`. The database is `backend/data/activities.db`. Neither is committed. The exported list is `data/activities.json` at the repo root; per-ride streams and laps go in `data/rides/<id>.json`. Those files are committed so the frontend can read them. Existing FIT files are skipped. An activity already in SQLite is skipped unless its record stream is missing, in which case that stream is backfilled from the FIT file. If one file fails, the rest continue and the command exits with code 1.

## Setup

You need [uv](https://docs.astral.sh/uv/) and Python 3.12 or newer.

```bash
cp .env.example .env
# set IGPSPORT_PHONE and IGPSPORT_PASSWORD
# or set IGPSPORT_ACCESS_TOKEN from a login response to skip login this run
make refresh
```

```bash
uv run igpsport-sync --limit 1
uv run fit-parse --limit 1
uv run export-activities
```

## Checks

Format with Black, lint with Ruff. Lefthook runs those on staged Python files. A push that includes `backend/` also runs pytest.

```bash
make format
make check
make test
make refresh
```

The `Refresh rides` Action runs `make refresh` at midnight in Asia/Shanghai and commits `data/activities.json` when it changes. Set `IGPSPORT_PHONE`, `IGPSPORT_PASSWORD`, and an `ACTION_TOKEN` that can push `main`. You can also run the workflow by hand.

The license is the same as cyc.earth: GPL-3.0-only.
