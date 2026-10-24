import argparse
import logging
import sqlite3
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import polyline
from garmin_fit_sdk import Decoder, Stream
from garmin_fit_sdk.util import FIT_EPOCH_S

logger = logging.getLogger(__name__)

_SEMICIRCLE_TO_DEGREES = 180.0 / 2**31


class FitParseError(Exception):
    """A FIT file or the import settings cannot be used."""


@dataclass(frozen=True)
class Activity:
    id: int
    name: str
    type: str
    subtype: str
    start_date: str
    start_date_local: str
    distance: float
    moving_time: int
    elapsed_time: int
    average_speed: float
    average_heartrate: float | None
    elevation_gain: float
    start_lat: float | None
    start_lng: float | None
    summary_polyline: str
    source_file: str


def parse_fit(path: Path) -> Activity:
    """Read one FIT file into an activity record."""

    if not path.is_file() or path.stat().st_size == 0:
        raise FitParseError(f"{path.name} is empty")
    stream = Stream.from_file(str(path))
    messages, errors = Decoder(stream).read(convert_datetimes_to_dates=False)
    if errors:
        raise FitParseError(f"{path.name} could not be decoded")
    sessions = messages.get("session_mesgs") or []
    session = sessions[0] if sessions else None
    distance = session.get("total_distance") if session is not None else None
    if session is None or distance is None:
        raise FitParseError(f"{path.name} has no session distance")
    start = _as_utc(session.get("start_time"))
    local = _local_time(messages.get("activity_mesgs"), start)
    points = _track(messages.get("record_mesgs") or [])
    start_lat = _degrees(session.get("start_position_lat"))
    start_lng = _degrees(session.get("start_position_long"))
    if start_lat is None and points:
        start_lat, start_lng = points[0]
    moving = session.get("total_moving_time")
    if moving is None:
        moving = session.get("total_timer_time")
    elapsed = session.get("total_elapsed_time")
    if moving is None or elapsed is None:
        raise FitParseError(f"{path.name} has no elapsed time")
    speed = session.get("enhanced_avg_speed")
    if speed is None:
        speed = session.get("avg_speed") or 0
    heart_rate = session.get("avg_heart_rate")
    ascent = session.get("total_ascent") or 0
    sport = str(session.get("sport") or "")
    activity_type = "Run" if sport.lower() == "running" else sport.lower()
    return Activity(
        id=_activity_id(path, start),
        name=_activity_name(str(session.get("sport_profile_name") or ""), local),
        type=activity_type,
        subtype=str(session.get("sub_sport") or ""),
        start_date=_format(start),
        start_date_local=_format(local),
        distance=float(distance),
        moving_time=int(moving),
        elapsed_time=int(elapsed),
        average_speed=float(speed),
        average_heartrate=float(heart_rate) if heart_rate is not None else None,
        elevation_gain=float(ascent),
        start_lat=start_lat,
        start_lng=start_lng,
        summary_polyline=polyline.encode(points) if points else "",
        source_file=path.name,
    )


def import_fit_files(
    input_dir: Path,
    db_path: Path,
    *,
    limit: int | None = None,
) -> tuple[list[int], list[int], list[tuple[str, str]]]:
    """Insert FIT activities that are not already stored under the same id."""

    if limit is not None and limit < 1:
        raise FitParseError("limit must be >= 1")
    if not input_dir.is_dir():
        raise FitParseError(f"{input_dir} is not a directory")
    files = sorted(input_dir.glob("*.fit"))
    if limit is not None:
        files = files[:limit]
    connection = _connect(db_path)
    imported: list[int] = []
    skipped: list[int] = []
    failed: list[tuple[str, str]] = []
    try:
        for path in files:
            try:
                activity = parse_fit(path)
            except FitParseError as exc:
                failed.append((path.name, str(exc)))
                logger.warning("failed %s: %s", path.name, exc)
                continue
            if _exists(connection, activity.id):
                skipped.append(activity.id)
                logger.info("skipped %s", activity.id)
                continue
            _insert(connection, activity)
            imported.append(activity.id)
            logger.info("saved %s", activity.id)
    finally:
        connection.close()
    return imported, skipped, failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import FIT files into SQLite.")
    parser.add_argument(
        "--input",
        default="data/raw",
        help="Directory of FIT files. Defaults to data/raw",
    )
    parser.add_argument(
        "--db",
        default="data/activities.db",
        help="SQLite database. Defaults to data/activities.db",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Import at most this many FIT files",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        imported, skipped, failed = import_fit_files(
            Path(args.input),
            Path(args.db),
            limit=args.limit,
        )
    except FitParseError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"imported {len(imported)}, skipped {len(skipped)}, failed {len(failed)}")
    for name, reason in failed:
        print(f"failed {name}: {reason}")
    return 1 if failed else 0


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            subtype TEXT NOT NULL,
            start_date TEXT NOT NULL,
            start_date_local TEXT NOT NULL,
            distance REAL NOT NULL,
            moving_time INTEGER NOT NULL,
            elapsed_time INTEGER NOT NULL,
            average_speed REAL NOT NULL,
            average_heartrate REAL,
            elevation_gain REAL NOT NULL,
            start_lat REAL,
            start_lng REAL,
            summary_polyline TEXT NOT NULL,
            source_file TEXT NOT NULL
        )
        """)
    connection.commit()
    return connection


def _exists(connection: sqlite3.Connection, activity_id: int) -> bool:
    row = connection.execute(
        "SELECT 1 FROM activities WHERE id = ?",
        (activity_id,),
    ).fetchone()
    return row is not None


def _insert(connection: sqlite3.Connection, activity: Activity) -> None:
    local_start = datetime.strptime(
        activity.start_date_local,
        "%Y-%m-%d %H:%M:%S",
    )
    name = _activity_name(activity.name, local_start)
    connection.execute(
        """
        INSERT INTO activities (
            id, name, type, subtype, start_date, start_date_local, distance,
            moving_time, elapsed_time, average_speed, average_heartrate,
            elevation_gain, start_lat, start_lng, summary_polyline, source_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            activity.id,
            name,
            activity.type,
            activity.subtype,
            activity.start_date,
            activity.start_date_local,
            activity.distance,
            activity.moving_time,
            activity.elapsed_time,
            activity.average_speed,
            activity.average_heartrate,
            activity.elevation_gain,
            activity.start_lat,
            activity.start_lng,
            activity.summary_polyline,
            activity.source_file,
        ),
    )
    connection.commit()


def _activity_name(name: str, local_start: datetime) -> str:
    """Keep the FIT profile name, or name a ride from its local start time."""

    if name.strip():
        return name.strip()
    hour = local_start.hour
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


def _activity_id(path: Path, start: datetime) -> int:
    if path.stem.isdigit():
        return int(path.stem)
    return int(start.timestamp() * 1000)


def _as_utc(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    if isinstance(value, int | float):
        return datetime.fromtimestamp(int(value) + FIT_EPOCH_S, UTC)
    raise FitParseError("FIT start time is missing")


def _local_time(activity_messages: object, start: datetime) -> datetime:
    activity = {}
    if isinstance(activity_messages, list) and activity_messages:
        first = activity_messages[0]
        if isinstance(first, dict):
            activity = first
    local_ts = activity.get("local_timestamp")
    timestamp = activity.get("timestamp")
    if isinstance(local_ts, int | float) and isinstance(timestamp, int | float):
        return start + timedelta(seconds=int(local_ts) - int(timestamp))
    return start


def _degrees(value: object) -> float | None:
    if not isinstance(value, int | float):
        return None
    degrees = float(value) * _SEMICIRCLE_TO_DEGREES
    return degrees


def _track(records: Iterable[object]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        lat = _degrees(record.get("position_lat"))
        lng = _degrees(record.get("position_long"))
        if lat is None or lng is None:
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        points.append((lat, lng))
    return points


def _format(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


if __name__ == "__main__":
    raise SystemExit(main())
