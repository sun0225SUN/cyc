import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_OUTPUT = _REPO_ROOT / "data" / "activities.json"
_STREAM_LIMIT = 1000


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
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(activities)")
        }
        selected = [
            "id",
            "name",
            "distance",
            "moving_time",
            "type",
            "subtype",
            "start_date",
            "start_date_local",
            "summary_polyline",
            "average_heartrate",
            "average_speed",
            "elevation_gain",
        ]
        if "elapsed_time" in columns:
            selected.append("elapsed_time")
        if "session_stats" in columns:
            selected.append("session_stats")
        rows = connection.execute(f"""
            SELECT {", ".join(selected)}
            FROM activities
            WHERE distance > 0.1
            ORDER BY start_date_local
            """).fetchall()
        details = [_ride_detail(connection, row) for row in rows]
    activities = [_activity(row, streak) for row, streak in _with_streak(rows)]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(activities, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    rides_dir = output_path.parent / "rides"
    _write_rides(rides_dir, details)
    return len(activities)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export activities from SQLite to JSON."
    )
    parser.add_argument(
        "--db",
        required=True,
        help="SQLite database, for example data/igpsport.db or data/strava.db",
    )
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


def _write_rides(rides_dir: Path, details: list[dict[str, object]]) -> None:
    rides_dir.mkdir(parents=True, exist_ok=True)
    keep = {f"{item['run_id']}.json" for item in details}
    for path in rides_dir.glob("*.json"):
        if path.name not in keep:
            path.unlink()
    for item in details:
        path = rides_dir / f"{item['run_id']}.json"
        path.write_text(
            json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )


def _ride_detail(connection: sqlite3.Connection, row: sqlite3.Row) -> dict[str, object]:
    keys = set(row.keys())
    stats = {}
    if "session_stats" in keys and row["session_stats"]:
        parsed = json.loads(row["session_stats"])
        if isinstance(parsed, dict):
            stats = parsed
    records = _rows(connection, "records", row["id"])
    laps = _rows(connection, "laps", row["id"])
    return {
        "run_id": row["id"],
        "elapsed_time": row["elapsed_time"] if "elapsed_time" in keys else None,
        "moving_time": int(row["moving_time"]),
        "distance": row["distance"],
        "average_speed": row["average_speed"],
        "average_heartrate": row["average_heartrate"],
        "elevation_gain": row["elevation_gain"],
        **stats,
        "laps": [_lap(item) for item in laps],
        "streams": _streams(_downsample(records, _STREAM_LIMIT)),
    }


def _lap(item: sqlite3.Row) -> dict[str, object]:
    keys = set(item.keys())
    extra = {}
    if "stats" in keys and item["stats"]:
        parsed = json.loads(item["stats"])
        if isinstance(parsed, dict):
            extra = parsed
    return {
        "index": item["lap_index"],
        "elapsed": item["elapsed"],
        "distance": item["distance"],
        "lat": item["lat"],
        "lng": item["lng"],
        "timer_time": item["timer_time"] if "timer_time" in keys else None,
        "average_speed": item["average_speed"] if "average_speed" in keys else None,
        "max_speed": item["max_speed"] if "max_speed" in keys else None,
        "average_heartrate": (
            item["average_heartrate"] if "average_heartrate" in keys else None
        ),
        "max_heartrate": item["max_heartrate"] if "max_heartrate" in keys else None,
        "average_cadence": (
            item["average_cadence"] if "average_cadence" in keys else None
        ),
        "max_cadence": item["max_cadence"] if "max_cadence" in keys else None,
        "average_power": item["average_power"] if "average_power" in keys else None,
        "max_power": item["max_power"] if "max_power" in keys else None,
        **extra,
    }


def _rows(
    connection: sqlite3.Connection, table: str, activity_id: int
) -> list[sqlite3.Row]:
    if not _has_table(connection, table):
        return []
    order = "lap_index" if table == "laps" else "elapsed"
    return connection.execute(
        f"SELECT * FROM {table} WHERE activity_id = ? ORDER BY {order}",
        (activity_id,),
    ).fetchall()


def _has_table(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def _downsample(rows: list[sqlite3.Row], limit: int) -> list[sqlite3.Row]:
    if len(rows) <= limit:
        return rows
    step = (len(rows) - 1) / (limit - 1)
    return [rows[round(index * step)] for index in range(limit)]


def _streams(rows: list[sqlite3.Row]) -> dict[str, list[float | None]]:
    keys = (
        "elapsed",
        "distance",
        "speed",
        "cadence",
        "altitude",
        "heart_rate",
        "power",
        "temperature",
    )
    streams: dict[str, list[float | None]] = {}
    for key in keys:
        if rows and key not in rows[0].keys():
            continue
        values = [row[key] for row in rows]
        if any(value is not None for value in values):
            streams[key] = values
    return streams


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
