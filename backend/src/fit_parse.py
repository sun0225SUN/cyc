import argparse
import json
import logging
import sqlite3
import sys
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
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
class Record:
    elapsed: float
    distance: float | None
    speed: float | None
    cadence: int | None
    altitude: float | None
    heart_rate: int | None
    power: int | None
    temperature: float | None = None


@dataclass(frozen=True)
class Lap:
    index: int
    elapsed: float
    distance: float | None
    lat: float | None
    lng: float | None
    timer_time: float | None = None
    average_speed: float | None = None
    max_speed: float | None = None
    average_heartrate: float | None = None
    max_heartrate: float | None = None
    average_cadence: float | None = None
    max_cadence: float | None = None
    average_power: float | None = None
    max_power: float | None = None
    stats: dict[str, float | None] = field(default_factory=dict)


@dataclass(frozen=True)
class SessionStats:
    calories: float | None = None
    elevation_loss: float | None = None
    max_speed: float | None = None
    average_cadence: float | None = None
    max_cadence: float | None = None
    max_heartrate: float | None = None
    average_power: float | None = None
    max_power: float | None = None
    average_altitude: float | None = None
    max_altitude: float | None = None
    min_altitude: float | None = None
    average_temperature: float | None = None
    max_temperature: float | None = None
    timer_time: float | None = None
    avg_pos_grade: float | None = None
    max_pos_grade: float | None = None
    avg_neg_grade: float | None = None
    max_neg_grade: float | None = None
    avg_pos_vertical_speed: float | None = None
    max_pos_vertical_speed: float | None = None
    avg_neg_vertical_speed: float | None = None
    max_neg_vertical_speed: float | None = None


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
    records: tuple[Record, ...] = ()
    laps: tuple[Lap, ...] = ()
    session_stats: SessionStats = SessionStats()


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
    record_messages = messages.get("record_mesgs") or []
    points = _track(record_messages)
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
        records=_records(record_messages, start),
        laps=_laps(messages.get("lap_mesgs") or [], start),
        session_stats=_session_stats(session),
    )


def import_fit_files(
    input_dir: Path,
    db_path: Path,
    *,
    limit: int | None = None,
) -> tuple[list[int], list[int], list[int], list[tuple[str, str]]]:
    """Insert new FIT activities, and backfill record streams when they are missing."""

    if limit is not None and limit < 1:
        raise FitParseError("limit must be >= 1")
    if not input_dir.is_dir():
        raise FitParseError(f"{input_dir} is not a directory")
    files = sorted(input_dir.glob("*.fit"))
    if limit is not None:
        files = files[:limit]
    connection = _connect(db_path)
    imported: list[int] = []
    backfilled: list[int] = []
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
            if not _exists(connection, activity.id):
                _insert(connection, activity)
                imported.append(activity.id)
                logger.info("saved %s", activity.id)
                continue
            if _detail_imported(connection, activity.id):
                skipped.append(activity.id)
                logger.info("skipped %s", activity.id)
                continue
            _replace_detail(connection, activity)
            backfilled.append(activity.id)
            logger.info("backfilled %s", activity.id)
    finally:
        connection.close()
    return imported, backfilled, skipped, failed


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
        imported, backfilled, skipped, failed = import_fit_files(
            Path(args.input),
            Path(args.db),
            limit=args.limit,
        )
    except FitParseError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"imported {len(imported)}, backfilled {len(backfilled)}, "
        f"skipped {len(skipped)}, failed {len(failed)}"
    )
    for name, reason in failed:
        print(f"failed {name}: {reason}")
    return 1 if failed else 0


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA foreign_keys = ON")
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
            source_file TEXT NOT NULL,
            records_imported INTEGER NOT NULL DEFAULT 0,
            session_stats TEXT
        )
        """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS records (
            activity_id INTEGER NOT NULL,
            elapsed REAL NOT NULL,
            distance REAL,
            speed REAL,
            cadence INTEGER,
            altitude REAL,
            heart_rate INTEGER,
            power INTEGER,
            temperature REAL,
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
        )
        """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS laps (
            activity_id INTEGER NOT NULL,
            lap_index INTEGER NOT NULL,
            elapsed REAL NOT NULL,
            distance REAL,
            lat REAL,
            lng REAL,
            timer_time REAL,
            average_speed REAL,
            max_speed REAL,
            average_heartrate REAL,
            max_heartrate REAL,
            average_cadence REAL,
            max_cadence REAL,
            average_power REAL,
            max_power REAL,
            stats TEXT,
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
        )
        """)
    connection.execute(
        "CREATE INDEX IF NOT EXISTS records_activity_elapsed "
        "ON records(activity_id, elapsed)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS laps_activity ON laps(activity_id, lap_index)"
    )
    columns = {row[1] for row in connection.execute("PRAGMA table_info(activities)")}
    if "records_imported" not in columns:
        connection.execute(
            "ALTER TABLE activities ADD COLUMN records_imported "
            "INTEGER NOT NULL DEFAULT 0"
        )
    if "session_stats" not in columns:
        connection.execute("ALTER TABLE activities ADD COLUMN session_stats TEXT")
        connection.execute("UPDATE activities SET records_imported = 0")
    record_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(records)")
    }
    if "temperature" not in record_columns:
        connection.execute("ALTER TABLE records ADD COLUMN temperature REAL")
        connection.execute("UPDATE activities SET records_imported = 0")
    lap_columns = {row[1] for row in connection.execute("PRAGMA table_info(laps)")}
    added_lap_column = False
    for name in (
        "timer_time",
        "average_speed",
        "max_speed",
        "average_heartrate",
        "max_heartrate",
        "average_cadence",
        "max_cadence",
        "average_power",
        "max_power",
        "stats",
    ):
        if name not in lap_columns:
            kind = "TEXT" if name == "stats" else "REAL"
            connection.execute(f"ALTER TABLE laps ADD COLUMN {name} {kind}")
            added_lap_column = True
    if added_lap_column:
        connection.execute("UPDATE activities SET records_imported = 0")
    connection.commit()
    return connection


def _exists(connection: sqlite3.Connection, activity_id: int) -> bool:
    row = connection.execute(
        "SELECT 1 FROM activities WHERE id = ?",
        (activity_id,),
    ).fetchone()
    return row is not None


def _detail_imported(connection: sqlite3.Connection, activity_id: int) -> bool:
    row = connection.execute(
        "SELECT records_imported, session_stats FROM activities WHERE id = ?",
        (activity_id,),
    ).fetchone()
    return row is not None and row[0] == 1 and bool(row[1])


def _replace_detail(connection: sqlite3.Connection, activity: Activity) -> None:
    connection.execute(
        "UPDATE activities SET session_stats = ? WHERE id = ?",
        (json.dumps(asdict(activity.session_stats), ensure_ascii=False), activity.id),
    )
    connection.execute("DELETE FROM records WHERE activity_id = ?", (activity.id,))
    connection.executemany(
        """
        INSERT INTO records (
            activity_id, elapsed, distance, speed, cadence, altitude,
            heart_rate, power, temperature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                activity.id,
                record.elapsed,
                record.distance,
                record.speed,
                record.cadence,
                record.altitude,
                record.heart_rate,
                record.power,
                record.temperature,
            )
            for record in activity.records
        ],
    )
    connection.execute("DELETE FROM laps WHERE activity_id = ?", (activity.id,))
    connection.executemany(
        """
        INSERT INTO laps (
            activity_id, lap_index, elapsed, distance, lat, lng, timer_time,
            average_speed, max_speed, average_heartrate, max_heartrate,
            average_cadence, max_cadence, average_power, max_power, stats
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                activity.id,
                lap.index,
                lap.elapsed,
                lap.distance,
                lap.lat,
                lap.lng,
                lap.timer_time,
                lap.average_speed,
                lap.max_speed,
                lap.average_heartrate,
                lap.max_heartrate,
                lap.average_cadence,
                lap.max_cadence,
                lap.average_power,
                lap.max_power,
                json.dumps(lap.stats, ensure_ascii=False) if lap.stats else None,
            )
            for lap in activity.laps
        ],
    )
    connection.execute(
        "UPDATE activities SET records_imported = 1 WHERE id = ?",
        (activity.id,),
    )
    connection.commit()


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
            elevation_gain, start_lat, start_lng, summary_polyline, source_file,
            records_imported, session_stats
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            0,
            json.dumps(asdict(activity.session_stats), ensure_ascii=False),
        ),
    )
    _replace_detail(connection, activity)


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


def _records(records: Iterable[object], start: datetime) -> tuple[Record, ...]:
    samples: list[Record] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        timestamp = record.get("timestamp")
        if timestamp is None:
            continue
        try:
            elapsed = (_as_utc(timestamp) - start).total_seconds()
        except FitParseError:
            continue
        if elapsed < 0:
            continue
        speed = _number(record.get("enhanced_speed"))
        if speed is None:
            speed = _number(record.get("speed"))
        altitude = _number(record.get("enhanced_altitude"))
        if altitude is None:
            altitude = _number(record.get("altitude"))
        samples.append(
            Record(
                elapsed=elapsed,
                distance=_number(record.get("distance")),
                speed=speed,
                cadence=_int(record.get("cadence")),
                altitude=altitude,
                heart_rate=_int(record.get("heart_rate")),
                power=_int(record.get("power")),
                temperature=_number(record.get("temperature")),
            )
        )
    return tuple(samples)


def _laps(messages: Iterable[object], start: datetime) -> tuple[Lap, ...]:
    laps: list[Lap] = []
    for offset, message in enumerate(messages, start=1):
        if not isinstance(message, dict):
            continue
        timestamp = message.get("start_time")
        elapsed = 0.0
        if timestamp is not None:
            try:
                elapsed = max((_as_utc(timestamp) - start).total_seconds(), 0.0)
            except FitParseError:
                elapsed = 0.0
        index = message.get("message_index")
        if isinstance(index, dict):
            index = index.get("value")
        lat = _degrees(message.get("end_position_lat"))
        lng = _degrees(message.get("end_position_long"))
        if lat is None or lng is None:
            lat = _degrees(message.get("start_position_lat"))
            lng = _degrees(message.get("start_position_long"))
        timer = message.get("total_timer_time")
        if timer is None:
            timer = message.get("total_moving_time")
        laps.append(
            Lap(
                index=_int(index) or offset,
                elapsed=elapsed,
                distance=_number(message.get("total_distance")),
                lat=lat,
                lng=lng,
                timer_time=_number(timer),
                average_speed=_first_number(
                    message.get("enhanced_avg_speed"),
                    message.get("avg_speed"),
                ),
                max_speed=_first_number(
                    message.get("enhanced_max_speed"),
                    message.get("max_speed"),
                ),
                average_heartrate=_number(message.get("avg_heart_rate")),
                max_heartrate=_number(message.get("max_heart_rate")),
                average_cadence=_number(message.get("avg_cadence")),
                max_cadence=_number(message.get("max_cadence")),
                average_power=_number(message.get("avg_power")),
                max_power=_number(message.get("max_power")),
                stats=_lap_stats(message, _number(timer)),
            )
        )
    return tuple(laps)


def _lap_stats(
    message: dict[str, object], timer: float | None
) -> dict[str, float | None]:
    elapsed = _number(message.get("total_elapsed_time"))
    moving = _number(message.get("total_moving_time"))
    stats: dict[str, float | None] = {
        "calories": _number(message.get("total_calories")),
        "average_altitude": _first_number(
            message.get("enhanced_avg_altitude"),
            message.get("avg_altitude"),
        ),
        "max_altitude": _first_number(
            message.get("enhanced_max_altitude"),
            message.get("max_altitude"),
        ),
        "min_altitude": _first_number(
            message.get("enhanced_min_altitude"),
            message.get("min_altitude"),
        ),
        "elevation_gain": _number(message.get("total_ascent")),
        "elevation_loss": _number(message.get("total_descent")),
        "average_temperature": _number(message.get("avg_temperature")),
        "max_temperature": _number(message.get("max_temperature")),
        "avg_pos_grade": _number(message.get("avg_pos_grade")),
        "max_pos_grade": _number(message.get("max_pos_grade")),
        "avg_neg_grade": _number(message.get("avg_neg_grade")),
        "max_neg_grade": _number(message.get("max_neg_grade")),
        "avg_pos_vertical_speed": _number(message.get("avg_pos_vertical_speed")),
        "max_pos_vertical_speed": _number(message.get("max_pos_vertical_speed")),
        "avg_neg_vertical_speed": _number(message.get("avg_neg_vertical_speed")),
        "max_neg_vertical_speed": _number(message.get("max_neg_vertical_speed")),
    }
    if elapsed is not None and elapsed != timer:
        stats["elapsed_time"] = elapsed
    if moving is not None and moving != timer:
        stats["moving_time"] = moving
    return {key: value for key, value in stats.items() if value is not None}


def _session_stats(session: dict[str, object]) -> SessionStats:
    max_speed = session.get("enhanced_max_speed")
    if max_speed is None:
        max_speed = session.get("max_speed")
    return SessionStats(
        calories=_number(session.get("total_calories")),
        elevation_loss=_number(session.get("total_descent")),
        max_speed=_number(max_speed),
        average_cadence=_number(session.get("avg_cadence")),
        max_cadence=_number(session.get("max_cadence")),
        max_heartrate=_number(session.get("max_heart_rate")),
        average_power=_number(session.get("avg_power")),
        max_power=_number(session.get("max_power")),
        average_altitude=_first_number(
            session.get("enhanced_avg_altitude"),
            session.get("avg_altitude"),
        ),
        max_altitude=_first_number(
            session.get("enhanced_max_altitude"),
            session.get("max_altitude"),
        ),
        min_altitude=_first_number(
            session.get("enhanced_min_altitude"),
            session.get("min_altitude"),
        ),
        average_temperature=_number(session.get("avg_temperature")),
        max_temperature=_number(session.get("max_temperature")),
        timer_time=_number(session.get("total_timer_time")),
        avg_pos_grade=_number(session.get("avg_pos_grade")),
        max_pos_grade=_number(session.get("max_pos_grade")),
        avg_neg_grade=_number(session.get("avg_neg_grade")),
        max_neg_grade=_number(session.get("max_neg_grade")),
        avg_pos_vertical_speed=_number(session.get("avg_pos_vertical_speed")),
        max_pos_vertical_speed=_number(session.get("max_pos_vertical_speed")),
        avg_neg_vertical_speed=_number(session.get("avg_neg_vertical_speed")),
        max_neg_vertical_speed=_number(session.get("max_neg_vertical_speed")),
    )


def _first_number(*values: object) -> float | None:
    for value in values:
        number = _number(value)
        if number is not None:
            return number
    return None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _int(value: object) -> int | None:
    number = _number(value)
    if number is None:
        return None
    return int(number)


def _format(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


if __name__ == "__main__":
    raise SystemExit(main())
