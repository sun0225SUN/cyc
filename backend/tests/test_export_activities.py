import json
import sqlite3
from pathlib import Path

import pytest

from export_activities import ExportError, _activity_name, export_activities, main


def _create_db(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute("""
            CREATE TABLE activities (
                id INTEGER PRIMARY KEY,
                name TEXT,
                type TEXT,
                subtype TEXT,
                start_date TEXT,
                start_date_local TEXT,
                distance REAL,
                moving_time INTEGER,
                elapsed_time INTEGER,
                average_speed REAL,
                average_heartrate REAL,
                elevation_gain REAL,
                start_lat REAL,
                start_lng REAL,
                summary_polyline TEXT,
                source_file TEXT
            )
            """)
        connection.executemany(
            """
            INSERT INTO activities (
                id, name, type, subtype, start_date, start_date_local, distance,
                moving_time, elapsed_time, average_speed, average_heartrate,
                elevation_gain, summary_polyline, source_file
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    2,
                    "",
                    "cycling",
                    "road",
                    "2024-01-02 00:00:00",
                    "2024-01-02 08:00:00",
                    1000,
                    3661,
                    3700,
                    5,
                    None,
                    10,
                    "abc",
                    "2.fit",
                ),
                (
                    1,
                    "ride",
                    "cycling",
                    "road",
                    "2024-01-01 00:00:00",
                    "2024-01-01 08:00:00",
                    2000,
                    120,
                    130,
                    4,
                    140,
                    3,
                    "xyz",
                    "1.fit",
                ),
                (
                    3,
                    "",
                    "cycling",
                    "road",
                    "2024-01-04 00:00:00",
                    "2024-01-04 08:00:00",
                    0.05,
                    10,
                    10,
                    1,
                    None,
                    0,
                    "",
                    "3.fit",
                ),
                (
                    4,
                    "",
                    "cycling",
                    "road",
                    "2024-01-02 02:00:00",
                    "2024-01-02 10:00:00",
                    500,
                    60,
                    60,
                    3,
                    None,
                    0,
                    "same-day",
                    "4.fit",
                ),
            ],
        )


def test_export_orders_by_local_time_and_counts_streak(tmp_path: Path) -> None:
    db = tmp_path / "activities.db"
    output = tmp_path / "out" / "activities.json"
    _create_db(db)

    count = export_activities(db, output)
    activities = json.loads(output.read_text(encoding="utf-8"))

    assert count == 3
    assert [item["run_id"] for item in activities] == [1, 2, 4]
    assert [item["streak"] for item in activities] == [1, 2, 2]
    assert activities[0]["moving_time"] == "0:02:00"
    assert activities[1]["moving_time"] == "1:01:01"
    assert activities[0]["location_country"] == ""
    assert activities[0]["average_heartrate"] == 140
    assert activities[1]["average_heartrate"] is None
    assert activities[0]["name"] == "ride"
    assert activities[1]["name"] == "earlyMorning"
    assert activities[2]["name"] == "morning"
    assert "elapsed_time" not in activities[0]
    ride = json.loads((output.parent / "rides" / "1.json").read_text(encoding="utf-8"))
    assert ride["run_id"] == 1
    assert ride["streams"] == {}
    assert ride["laps"] == []


@pytest.mark.parametrize(
    ("time", "expected"),
    [
        ("2024-01-01 00:00:00", "lateNight"),
        ("2024-01-01 05:00:00", "earlyMorning"),
        ("2024-01-01 09:00:00", "morning"),
        ("2024-01-01 12:00:00", "noon"),
        ("2024-01-01 14:00:00", "afternoon"),
        ("2024-01-01 18:00:00", "evening"),
        ("2024-01-01 20:00:00", "night"),
    ],
)
def test_activity_name_uses_local_time(time: str, expected: str) -> None:
    assert _activity_name("", time) == expected


def test_activity_name_preserves_source_name() -> None:
    assert _activity_name("  周末长途  ", "2024-01-01 08:00:00") == "周末长途"


def test_missing_database_raises(tmp_path: Path) -> None:
    with pytest.raises(ExportError, match="does not exist"):
        export_activities(tmp_path / "missing.db", tmp_path / "activities.json")


def test_cli_writes_the_output_path(tmp_path: Path, capsys) -> None:
    db = tmp_path / "activities.db"
    output = tmp_path / "data" / "activities.json"
    _create_db(db)

    code = main(["--db", str(db), "--output", str(output)])

    assert code == 0
    assert f"exported 3 activities to {output}" in capsys.readouterr().out
    assert output.is_file()
