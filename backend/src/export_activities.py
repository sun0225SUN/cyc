import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_DB = _BACKEND_DIR / "data" / "activities.db"
_DEFAULT_OUTPUT = _REPO_ROOT / "data" / "activities.json"


class ExportError(Exception):
    """The activities database cannot be exported."""


def export_activities(db_path: Path, output_path: Path) -> int:
    """Write activities from SQLite to a JSON list, ordered by local start time.

    ``streak`` is the number of consecutive local days ending on that activity.
    Rows shorter than 0.1 meters are left out.
    """

    if not db_path.is_file():
        raise ExportError(f"{db_path} does not exist")
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute("""
            SELECT id, name, distance, moving_time, type, subtype,
                   start_date, start_date_local, summary_polyline,
                   average_heartrate, average_speed, elevation_gain
            FROM activities
            WHERE distance > 0.1
            ORDER BY start_date_local
            """).fetchall()
    activities = [_activity(row, streak) for row, streak in _with_streak(rows)]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(activities, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return len(activities)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export activities from SQLite to JSON."
    )
    parser.add_argument("--db", default=str(_DEFAULT_DB), help="SQLite database")
    parser.add_argument(
        "--output",
        default=str(_DEFAULT_OUTPUT),
        help="JSON file. Defaults to <repo>/data/activities.json",
    )
    args = parser.parse_args(argv)
    try:
        count = export_activities(Path(args.db), Path(args.output))
    except ExportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"exported {count} activities to {args.output}")
    return 0


def _with_streak(rows: list[sqlite3.Row]) -> list[tuple[sqlite3.Row, int]]:
    streak = 0
    last_date = None
    result: list[tuple[sqlite3.Row, int]] = []
    for row in rows:
        date = datetime.strptime(row["start_date_local"], "%Y-%m-%d %H:%M:%S").date()
        if last_date is None or date > last_date + timedelta(days=1):
            streak = 1
        elif date == last_date + timedelta(days=1):
            streak += 1
        result.append((row, streak))
        last_date = date
    return result


def _activity(row: sqlite3.Row, streak: int) -> dict[str, object]:
    start_date_local = row["start_date_local"]
    return {
        "run_id": row["id"],
        "name": _activity_name(row["name"], start_date_local),
        "distance": row["distance"],
        "moving_time": str(timedelta(seconds=int(row["moving_time"]))),
        "type": row["type"],
        "subtype": row["subtype"],
        "start_date": row["start_date"],
        "start_date_local": start_date_local,
        "location_country": "",
        "summary_polyline": row["summary_polyline"],
        "average_heartrate": row["average_heartrate"],
        "average_speed": row["average_speed"],
        "elevation_gain": row["elevation_gain"],
        "streak": streak,
    }


def _activity_name(name: str | None, start_date_local: str) -> str:
    """Keep a source name, or name an unnamed ride from its local start time."""

    if name and name.strip():
        return name.strip()
    hour = datetime.strptime(start_date_local, "%Y-%m-%d %H:%M:%S").hour
    if hour < 5:
        period = "lateNight"
    elif hour < 9:
        period = "earlyMorning"
    elif hour < 12:
        period = "morning"
    elif hour < 14:
        period = "noon"
    elif hour < 18:
        period = "afternoon"
    elif hour < 20:
        period = "evening"
    else:
        period = "night"
    return period


if __name__ == "__main__":
    raise SystemExit(main())
