import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import polyline
import pytest

from igpsport.fit_data_parse import (
    FitParseError,
    Record,
    _activity_name,
    import_fit_files,
    parse_fit,
)


def _session(**overrides: object) -> dict[str, object]:
    session = {
        "sport": "cycling",
        "sub_sport": "road",
        "start_time": 1072988502,
        "total_distance": 1000.0,
        "total_moving_time": 200.0,
        "total_elapsed_time": 240.0,
        "enhanced_avg_speed": 5.0,
        "avg_heart_rate": 140,
        "total_ascent": 12,
        "total_descent": 9,
        "total_calories": 180,
        "max_cadence": 111,
        "avg_cadence": 50,
        "avg_temperature": 24,
        "start_position_lat": 268648533,
        "start_position_long": 1353072655,
    }
    session.update(overrides)
    return session


def test_parse_fit_reads_the_session_and_track(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "42.fit"
    path.write_bytes(b"not-read")

    def fake_read(self, **kwargs):  # noqa: ARG001
        return (
            {
                "session_mesgs": [_session()],
                "activity_mesgs": [
                    {"timestamp": 1072988502, "local_timestamp": 1073017302}
                ],
                "record_mesgs": [
                    {
                        "timestamp": 1072988502,
                        "position_lat": 268648533,
                        "position_long": 1353072655,
                        "enhanced_speed": 5.5,
                        "cadence": 90,
                        "enhanced_altitude": 12.0,
                        "heart_rate": 130,
                        "power": 180,
                        "distance": 10.0,
                        "temperature": 24,
                    },
                    {
                        "timestamp": 1072988504,
                        "position_lat": 268700000,
                        "position_long": 1353100000,
                        "speed": 6.0,
                        "altitude": 13.0,
                        "distance": 22.0,
                    },
                    {"cadence": 10},
                ],
                "lap_mesgs": [
                    {
                        "message_index": 1,
                        "start_time": 1072988502,
                        "total_distance": 5000.0,
                        "total_timer_time": 860.0,
                        "enhanced_avg_speed": 5.81,
                        "enhanced_max_speed": 9.61,
                        "avg_cadence": 54,
                        "max_cadence": 86,
                        "total_calories": 141,
                        "total_ascent": 12,
                        "avg_temperature": 27,
                        "end_position_lat": 268700000,
                        "end_position_long": 1353100000,
                    }
                ],
            },
            [],
        )

    monkeypatch.setattr("igpsport.fit_data_parse.Decoder.read", fake_read)
    monkeypatch.setattr(
        "igpsport.fit_data_parse.Stream.from_file", lambda name: object()
    )
    activity = parse_fit(path)

    assert activity.id == 42
    assert activity.name == "lateNight"
    assert activity.type == "cycling"
    assert activity.subtype == "road"
    assert activity.distance == 1000.0
    assert activity.moving_time == 200
    assert activity.elapsed_time == 240
    assert activity.average_heartrate == 140
    assert activity.elevation_gain == 12
    assert activity.start_date_local != activity.start_date
    assert activity.start_lat == pytest.approx(22.518, abs=0.01)
    assert activity.start_lng == pytest.approx(113.412, abs=0.01)
    assert len(polyline.decode(activity.summary_polyline)) == 2
    assert activity.records == (
        Record(
            elapsed=0.0,
            distance=10.0,
            speed=5.5,
            cadence=90,
            altitude=12.0,
            heart_rate=130,
            power=180,
            temperature=24.0,
        ),
        Record(
            elapsed=2.0,
            distance=22.0,
            speed=6.0,
            cadence=None,
            altitude=13.0,
            heart_rate=None,
            power=None,
        ),
    )
    assert activity.laps[0].index == 1
    assert activity.laps[0].distance == 5000.0
    assert activity.laps[0].timer_time == 860.0
    assert activity.laps[0].average_speed == 5.81
    assert activity.laps[0].max_cadence == 86
    assert activity.laps[0].stats["calories"] == 141
    assert activity.laps[0].stats["elevation_gain"] == 12
    assert activity.session_stats.calories == 180
    assert activity.session_stats.elevation_loss == 9
    assert activity.session_stats.average_cadence == 50
    assert activity.session_stats.average_temperature == 24


def test_running_sport_uses_the_run_label(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "7.fit"
    path.write_bytes(b"not-read")

    def fake_read(self, **kwargs):  # noqa: ARG001
        return ({"session_mesgs": [_session(sport="running")], "record_mesgs": []}, [])

    monkeypatch.setattr("igpsport.fit_data_parse.Decoder.read", fake_read)
    monkeypatch.setattr(
        "igpsport.fit_data_parse.Stream.from_file", lambda name: object()
    )

    assert parse_fit(path).type == "Run"


def test_import_skips_an_id_already_in_the_database(
    tmp_path: Path, monkeypatch
) -> None:
    first = tmp_path / "raw" / "1.fit"
    second = tmp_path / "raw" / "2.fit"
    first.parent.mkdir()
    first.write_bytes(b"a")
    second.write_bytes(b"b")

    def fake_parse(path: Path):
        from igpsport.fit_data_parse import Activity

        return Activity(
            id=int(path.stem),
            name="",
            type="cycling",
            subtype="road",
            start_date="2024-01-01 00:00:00",
            start_date_local="2024-01-01 08:00:00",
            distance=10.0,
            moving_time=3,
            elapsed_time=4,
            average_speed=2.5,
            average_heartrate=None,
            elevation_gain=0.0,
            start_lat=None,
            start_lng=None,
            summary_polyline="",
            source_file=path.name,
            records=(
                Record(
                    elapsed=0.0,
                    distance=1.0,
                    speed=2.5,
                    cadence=80,
                    altitude=10.0,
                    heart_rate=None,
                    power=None,
                ),
            ),
        )

    monkeypatch.setattr("igpsport.fit_data_parse.parse_fit", fake_parse)
    db = tmp_path / "activities.db"
    imported, backfilled, skipped, failed = import_fit_files(first.parent, db)
    again, backfilled_again, skipped_again, failed_again = import_fit_files(
        first.parent, db
    )

    assert imported == [1, 2]
    assert backfilled == []
    assert skipped == []
    assert failed == []
    assert again == []
    assert backfilled_again == []
    assert skipped_again == [1, 2]
    assert failed_again == []
    with sqlite3.connect(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 2
        assert connection.execute(
            "SELECT DISTINCT name FROM activities"
        ).fetchall() == [("earlyMorning",)]
        assert connection.execute(
            "SELECT DISTINCT records_imported FROM activities"
        ).fetchall() == [(1,)]
        assert connection.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 2


def test_import_adds_records_to_an_existing_database(
    tmp_path: Path, monkeypatch
) -> None:
    db = tmp_path / "activities.db"
    with sqlite3.connect(db) as connection:
        connection.execute("""
            CREATE TABLE activities (
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
        connection.execute(
            """
            INSERT INTO activities (
                id, name, type, subtype, start_date, start_date_local, distance,
                moving_time, elapsed_time, average_speed, average_heartrate,
                elevation_gain, start_lat, start_lng, summary_polyline, source_file
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "earlyMorning",
                "cycling",
                "road",
                "2024-01-01 00:00:00",
                "2024-01-01 08:00:00",
                10.0,
                3,
                4,
                2.5,
                None,
                0.0,
                None,
                None,
                "",
                "1.fit",
            ),
        )

    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "1.fit").write_bytes(b"a")

    def fake_parse(path: Path):
        from igpsport.fit_data_parse import Activity

        return Activity(
            id=1,
            name="",
            type="cycling",
            subtype="road",
            start_date="2024-01-01 00:00:00",
            start_date_local="2024-01-01 08:00:00",
            distance=10.0,
            moving_time=3,
            elapsed_time=4,
            average_speed=2.5,
            average_heartrate=None,
            elevation_gain=0.0,
            start_lat=None,
            start_lng=None,
            summary_polyline="",
            source_file=path.name,
            records=(
                Record(
                    elapsed=0.0,
                    distance=1.0,
                    speed=3.0,
                    cadence=70,
                    altitude=8.0,
                    heart_rate=None,
                    power=None,
                ),
            ),
        )

    monkeypatch.setattr("igpsport.fit_data_parse.parse_fit", fake_parse)
    imported, backfilled, skipped, failed = import_fit_files(raw, db)

    assert imported == []
    assert backfilled == [1]
    assert skipped == []
    assert failed == []
    with sqlite3.connect(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 1
        assert connection.execute(
            "SELECT records_imported FROM activities WHERE id = 1"
        ).fetchone() == (1,)


def test_import_backfills_records_for_an_existing_activity(
    tmp_path: Path, monkeypatch
) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "1.fit").write_bytes(b"a")

    def fake_parse(path: Path):
        from igpsport.fit_data_parse import Activity

        return Activity(
            id=1,
            name="",
            type="cycling",
            subtype="road",
            start_date="2024-01-01 00:00:00",
            start_date_local="2024-01-01 08:00:00",
            distance=10.0,
            moving_time=3,
            elapsed_time=4,
            average_speed=2.5,
            average_heartrate=None,
            elevation_gain=0.0,
            start_lat=None,
            start_lng=None,
            summary_polyline="",
            source_file=path.name,
            records=(
                Record(
                    elapsed=1.0,
                    distance=8.0,
                    speed=4.2,
                    cadence=88,
                    altitude=21.0,
                    heart_rate=142,
                    power=190,
                ),
            ),
        )

    monkeypatch.setattr("igpsport.fit_data_parse.parse_fit", fake_parse)
    db = tmp_path / "activities.db"
    imported, backfilled, skipped, failed = import_fit_files(raw, db)
    assert imported == [1]
    assert backfilled == []
    assert skipped == []
    assert failed == []

    with sqlite3.connect(db) as connection:
        connection.execute("DELETE FROM records")
        connection.execute("UPDATE activities SET records_imported = 0")
        connection.commit()

    imported, backfilled, skipped, failed = import_fit_files(raw, db)

    assert imported == []
    assert backfilled == [1]
    assert skipped == []
    assert failed == []
    with sqlite3.connect(db) as connection:
        row = connection.execute("""
            SELECT elapsed, distance, speed, cadence, altitude, heart_rate, power
            FROM records WHERE activity_id = 1
            """).fetchone()
        assert row == (1.0, 8.0, 4.2, 88, 21.0, 142, 190)
        assert connection.execute(
            "SELECT records_imported FROM activities WHERE id = 1"
        ).fetchone() == (1,)


@pytest.mark.parametrize(
    ("hour", "expected"),
    [
        (0, "lateNight"),
        (5, "earlyMorning"),
        (9, "morning"),
        (12, "noon"),
        (14, "afternoon"),
        (18, "evening"),
        (20, "night"),
    ],
)
def test_activity_name_uses_local_start(hour: int, expected: str) -> None:
    assert _activity_name("", datetime(2024, 1, 1, hour)) == expected


def test_activity_name_preserves_fit_profile_name() -> None:
    assert _activity_name("  周末长途  ", datetime(2024, 1, 1)) == "周末长途"


def test_a_bad_file_does_not_stop_the_import(tmp_path: Path, monkeypatch) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "1.fit").write_bytes(b"a")
    (raw / "2.fit").write_bytes(b"b")

    def fake_parse(path: Path):
        if path.stem == "1":
            raise FitParseError("no session distance")
        from igpsport.fit_data_parse import Activity

        return Activity(
            id=2,
            name="",
            type="cycling",
            subtype="",
            start_date="2024-01-01 00:00:00",
            start_date_local="2024-01-01 00:00:00",
            distance=1.0,
            moving_time=1,
            elapsed_time=1,
            average_speed=1.0,
            average_heartrate=None,
            elevation_gain=0.0,
            start_lat=None,
            start_lng=None,
            summary_polyline="",
            source_file=path.name,
        )

    monkeypatch.setattr("igpsport.fit_data_parse.parse_fit", fake_parse)
    imported, backfilled, skipped, failed = import_fit_files(
        raw, tmp_path / "activities.db"
    )

    assert imported == [2]
    assert backfilled == []
    assert skipped == []
    assert failed == [("1.fit", "no session distance")]


def test_missing_directory_raises(tmp_path: Path) -> None:
    with pytest.raises(FitParseError, match="not a directory"):
        import_fit_files(tmp_path / "missing", tmp_path / "activities.db")


def test_cli_reports_the_summary(tmp_path: Path, monkeypatch, capsys) -> None:
    from igpsport.fit_data_parse import main

    monkeypatch.setattr(
        "igpsport.fit_data_parse.import_fit_files",
        lambda input_dir, db_path, limit=None: (
            [1],
            [3],
            [2],
            [("bad.fit", "empty")],
        ),
    )
    code = main(["--input", str(tmp_path), "--db", str(tmp_path / "a.db")])
    captured = capsys.readouterr()

    assert code == 1
    assert "imported 1, backfilled 1, skipped 1, failed 1" in captured.out
    assert "failed bad.fit: empty" in captured.out


def test_start_without_a_timestamp_uses_the_clock_time() -> None:
    from igpsport.fit_data_parse import _as_utc

    value = datetime(2024, 1, 2, 3, 4, 5)
    assert _as_utc(value) == value.replace(tzinfo=UTC)
