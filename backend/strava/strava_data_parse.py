import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

import polyline

from igpsport.fit_data_parse import (
    Activity,
    FitParseError,
    Lap,
    Record,
    SessionStats,
    connect,
    save_activity,
)
from strava.data_sync import (
    StravaError,
    _activity_id,
    _is_ride,
    _normalize_streams,
    _sport,
)

logger = logging.getLogger(__name__)


_SUBTYPE = {
    "Ride": "road",
    "MountainBikeRide": "mountain",
    "GravelRide": "gravel",
    "EBikeRide": "ebike",
    "EMountainBikeRide": "emountain",
    "VirtualRide": "virtual",
    "Velomobile": "velomobile",
    "Handcycle": "handcycle",
}


def activity_from_payload(payload: dict[str, object]) -> Activity:
    """Turn one saved Strava ride into the same record the FIT importer stores."""

    raw = payload.get("activity")
    if not isinstance(raw, dict):
        raise StravaError("Strava ride is missing activity")
    if not _is_ride(raw):
        raise StravaError("Strava activity is not a ride")
    activity_id = _activity_id(raw.get("id"))
    start = _clock(raw.get("start_date"), "start_date")
    local = _clock(raw.get("start_date_local"), "start_date_local")
    streams = _normalize_streams(payload.get("streams"))
    times = _aligned(_stream_data(streams, "time"))
    latlngs = _stream_data(streams, "latlng")
    distances = _aligned(_stream_data(streams, "distance"))
    altitudes = _aligned(_stream_data(streams, "altitude"))
    speeds = _aligned(_stream_data(streams, "velocity_smooth"))
    hearts = _aligned(_stream_data(streams, "heartrate"))
    cadences = _aligned(_stream_data(streams, "cadence"))
    watts = _aligned(_stream_data(streams, "watts"))
    temps = _aligned(_stream_data(streams, "temp"))
    points = _points(latlngs)
    start_lat, start_lng = _start_latlng(raw, points)
    sport = _sport(raw)
    laps = payload.get("laps")
    if laps is None:
        laps = []
    if not isinstance(laps, list):
        raise StravaError("Strava laps returned an unexpected payload")
    return Activity(
        id=activity_id,
        name=str(raw.get("name") or ""),
        type="cycling",
        subtype=_SUBTYPE.get(sport, sport.lower()),
        start_date=_format(start),
        start_date_local=_format(local),
        distance=_required_number(raw.get("distance")),
        moving_time=_required_int(raw.get("moving_time")),
        elapsed_time=_required_int(raw.get("elapsed_time")),
        average_speed=_required_number(raw.get("average_speed")),
        average_heartrate=_optional_number(raw.get("average_heartrate")),
        elevation_gain=_required_number(raw.get("total_elevation_gain")),
        start_lat=start_lat,
        start_lng=start_lng,
        summary_polyline=_summary_polyline(raw, points),
        source_file=f"strava-{activity_id}.json",
        records=_records(
            times, distances, speeds, cadences, altitudes, hearts, watts, temps
        ),
        laps=_laps(laps, times, latlngs),
        session_stats=_session_stats(raw, altitudes, cadences, hearts, watts, temps),
    )


def import_rides(
    input_dir: Path,
    db_path: Path,
) -> tuple[list[int], list[int], list[int], list[tuple[str, str]]]:
    """Insert saved Strava rides into the activities database."""

    if not input_dir.is_dir():
        raise StravaError(f"{input_dir} is not a directory")
    imported: list[int] = []
    backfilled: list[int] = []
    skipped: list[int] = []
    failed: list[tuple[str, str]] = []
    connection = connect(db_path)
    try:
        for path in sorted(input_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(payload, dict):
                    raise StravaError("Strava ride file is not an object")
                activity = activity_from_payload(payload)
                result = save_activity(connection, activity)
            except (StravaError, FitParseError, OSError, json.JSONDecodeError) as exc:
                failed.append((path.name, str(exc)))
                logger.warning("failed %s: %s", path.name, exc)
                continue
            if result == "imported":
                imported.append(activity.id)
                logger.info("imported %s", activity.id)
            elif result == "backfilled":
                backfilled.append(activity.id)
                logger.info("backfilled %s", activity.id)
            elif result == "conflict":
                failed.append(
                    (
                        path.name,
                        f"activity {activity.id} already belongs to another source",
                    )
                )
                logger.warning(
                    "kept existing %s from another source",
                    activity.id,
                )
            else:
                skipped.append(activity.id)
                logger.info("skipped %s", activity.id)
    finally:
        connection.close()
    return imported, backfilled, skipped, failed


def _stream_data(streams: dict[str, object], key: str) -> list[object]:
    node = streams.get(key)
    if isinstance(node, dict) and isinstance(node.get("data"), list):
        return node["data"]
    if isinstance(node, list):
        return node
    return []


def _aligned(values: list[object]) -> list[float | None]:
    aligned: list[float | None] = []
    for value in values:
        aligned.append(_optional_number(value))
    return aligned


def _points(values: list[object]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for value in values:
        pair = _pair(value)
        if pair is not None:
            points.append(pair)
    return points


def _pair(value: object) -> tuple[float, float] | None:
    if not isinstance(value, list | tuple) or len(value) < 2:
        return None
    lat = _optional_number(value[0])
    lng = _optional_number(value[1])
    if lat is None or lng is None:
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def _start_latlng(
    activity: dict[str, object],
    points: list[tuple[float, float]],
) -> tuple[float | None, float | None]:
    pair = _pair(activity.get("start_latlng"))
    if pair is not None:
        return pair
    if points:
        return points[0]
    return None, None


def _summary_polyline(
    activity: dict[str, object],
    points: list[tuple[float, float]],
) -> str:
    raw_map = activity.get("map")
    if isinstance(raw_map, dict):
        encoded = raw_map.get("summary_polyline")
        if isinstance(encoded, str) and encoded:
            return encoded
    if points:
        return polyline.encode(points)
    return ""


def _records(
    times: list[float | None],
    distances: list[float | None],
    speeds: list[float | None],
    cadences: list[float | None],
    altitudes: list[float | None],
    hearts: list[float | None],
    watts: list[float | None],
    temps: list[float | None],
) -> tuple[Record, ...]:
    samples: list[Record] = []
    for index, elapsed in enumerate(times):
        if elapsed is None or elapsed < 0:
            continue
        samples.append(
            Record(
                elapsed=elapsed,
                distance=_at(distances, index),
                speed=_at(speeds, index),
                cadence=_int_at(cadences, index),
                altitude=_at(altitudes, index),
                heart_rate=_int_at(hearts, index),
                power=_int_at(watts, index),
                temperature=_at(temps, index),
            )
        )
    return tuple(samples)


def _laps(
    laps: list[object],
    times: list[float | None],
    latlngs: list[object],
) -> tuple[Lap, ...]:
    parsed: list[Lap] = []
    for offset, item in enumerate(laps, start=1):
        if not isinstance(item, dict):
            continue
        index = item.get("lap_index")
        lap_index = index if isinstance(index, int) and index > 0 else offset
        end_index = item.get("end_index")
        pair = None
        if isinstance(end_index, int) and 0 <= end_index < len(latlngs):
            pair = _pair(latlngs[end_index])
        lat, lng = pair if pair is not None else (None, None)
        timer = _optional_number(item.get("moving_time"))
        elapsed_time = _optional_number(item.get("elapsed_time"))
        stats: dict[str, float | None] = {}
        gain = _optional_number(item.get("total_elevation_gain"))
        if gain is not None:
            stats["elevation_gain"] = gain
        if elapsed_time is not None and elapsed_time != timer:
            stats["elapsed_time"] = elapsed_time
        parsed.append(
            Lap(
                index=lap_index,
                elapsed=_lap_elapsed(item, times),
                distance=_optional_number(item.get("distance")),
                lat=lat,
                lng=lng,
                timer_time=timer,
                average_speed=_optional_number(item.get("average_speed")),
                max_speed=_optional_number(item.get("max_speed")),
                average_heartrate=_optional_number(item.get("average_heartrate")),
                max_heartrate=_optional_number(item.get("max_heartrate")),
                average_cadence=_optional_number(item.get("average_cadence")),
                max_cadence=_optional_number(item.get("max_cadence")),
                average_power=_optional_number(item.get("average_watts")),
                max_power=_optional_number(item.get("max_watts")),
                stats=stats,
            )
        )
    return tuple(parsed)


def _lap_elapsed(lap: dict[str, object], times: list[float | None]) -> float:
    index = lap.get("start_index")
    if isinstance(index, int) and 0 <= index < len(times):
        elapsed = times[index]
        if elapsed is not None and elapsed >= 0:
            return elapsed
    return 0.0


def _session_stats(
    activity: dict[str, object],
    altitudes: list[float | None],
    cadences: list[float | None],
    hearts: list[float | None],
    watts: list[float | None],
    temps: list[float | None],
) -> SessionStats:
    present_alt = [value for value in altitudes if value is not None]
    return SessionStats(
        calories=_optional_number(activity.get("calories")),
        elevation_loss=_elevation_loss(present_alt),
        max_speed=_optional_number(activity.get("max_speed")),
        average_cadence=_optional_number(activity.get("average_cadence")),
        max_cadence=_maximum(cadences),
        max_heartrate=_optional_number(activity.get("max_heartrate"))
        or _maximum(hearts),
        average_power=_optional_number(activity.get("average_watts")),
        max_power=_optional_number(activity.get("max_watts")) or _maximum(watts),
        average_altitude=_mean(present_alt),
        max_altitude=_optional_number(activity.get("elev_high")) or _maximum(altitudes),
        min_altitude=_optional_number(activity.get("elev_low")) or _minimum(altitudes),
        average_temperature=_optional_number(activity.get("average_temp"))
        or _mean([value for value in temps if value is not None]),
        max_temperature=_maximum(temps),
        timer_time=_optional_number(activity.get("moving_time")),
    )


def _elevation_loss(altitudes: list[float]) -> float | None:
    if len(altitudes) < 2:
        return None
    loss = 0.0
    previous = altitudes[0]
    for altitude in altitudes[1:]:
        if altitude < previous:
            loss += previous - altitude
        previous = altitude
    return loss


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _maximum(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    if not present:
        return None
    return max(present)


def _minimum(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    if not present:
        return None
    return min(present)


def _at(values: list[float | None], index: int) -> float | None:
    if index >= len(values):
        return None
    return values[index]


def _int_at(values: list[float | None], index: int) -> int | None:
    value = _at(values, index)
    if value is None:
        return None
    return int(value)


def _optional_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _required_number(value: object) -> float:
    number = _optional_number(value)
    return 0.0 if number is None else number


def _required_int(value: object) -> int:
    return int(_required_number(value))


def _clock(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise StravaError(f"Strava {field} is missing")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise StravaError(f"Strava {field} is invalid") from exc
    return parsed


def _format(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import saved Strava rides into SQLite."
    )
    parser.add_argument(
        "--input",
        default="data/strava",
        help="Directory of ride JSON. Defaults to data/strava",
    )
    parser.add_argument(
        "--db",
        default="data/strava.db",
        help="SQLite database. Defaults to data/strava.db",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        imported, backfilled, skipped, failed = import_rides(
            Path(args.input), Path(args.db)
        )
    except StravaError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"imported {len(imported)}, backfilled {len(backfilled)}, "
        f"skipped {len(skipped)}, failed {len(failed)}"
    )
    for name, reason in failed:
        print(f"failed {name}: {reason}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
