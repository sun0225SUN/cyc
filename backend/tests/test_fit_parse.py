import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import polyline
import pytest

from fit_parse import FitParseError, import_fit_files, parse_fit


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
                    {"position_lat": 268648533, "position_long": 1353072655},
                    {"position_lat": 268700000, "position_long": 1353100000},
                ],
            },
            [],
        )

    monkeypatch.setattr("fit_parse.Decoder.read", fake_read)
    monkeypatch.setattr("fit_parse.Stream.from_file", lambda name: object())
    activity = parse_fit(path)

    assert activity.id == 42
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


def test_running_sport_uses_the_run_label(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "7.fit"
    path.write_bytes(b"not-read")

    def fake_read(self, **kwargs):  # noqa: ARG001
        return ({"session_mesgs": [_session(sport="running")], "record_mesgs": []}, [])

    monkeypatch.setattr("fit_parse.Decoder.read", fake_read)
    monkeypatch.setattr("fit_parse.Stream.from_file", lambda name: object())

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
        from fit_parse import Activity

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
        )

    monkeypatch.setattr("fit_parse.parse_fit", fake_parse)
    db = tmp_path / "activities.db"
    imported, skipped, failed = import_fit_files(first.parent, db)
    again, skipped_again, failed_again = import_fit_files(first.parent, db)

    assert imported == [1, 2]
    assert skipped == []
    assert failed == []
    assert again == []
    assert skipped_again == [1, 2]
    assert failed_again == []
    with sqlite3.connect(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 2


def test_a_bad_file_does_not_stop_the_import(tmp_path: Path, monkeypatch) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "1.fit").write_bytes(b"a")
    (raw / "2.fit").write_bytes(b"b")

    def fake_parse(path: Path):
        if path.stem == "1":
            raise FitParseError("no session distance")
        from fit_parse import Activity

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

    monkeypatch.setattr("fit_parse.parse_fit", fake_parse)
    imported, skipped, failed = import_fit_files(raw, tmp_path / "activities.db")

    assert imported == [2]
    assert skipped == []
    assert failed == [("1.fit", "no session distance")]


def test_missing_directory_raises(tmp_path: Path) -> None:
    with pytest.raises(FitParseError, match="not a directory"):
        import_fit_files(tmp_path / "missing", tmp_path / "activities.db")


def test_cli_reports_the_summary(tmp_path: Path, monkeypatch, capsys) -> None:
    from fit_parse import main

    monkeypatch.setattr(
        "fit_parse.import_fit_files",
        lambda input_dir, db_path, limit=None: ([1], [2], [("bad.fit", "empty")]),
    )
    code = main(["--input", str(tmp_path), "--db", str(tmp_path / "a.db")])
    captured = capsys.readouterr()

    assert code == 1
    assert "imported 1, skipped 1, failed 1" in captured.out
    assert "failed bad.fit: empty" in captured.out


def test_start_without_a_timestamp_uses_the_clock_time() -> None:
    from fit_parse import _as_utc

    value = datetime(2024, 1, 2, 3, 4, 5)
    assert _as_utc(value) == value.replace(tzinfo=UTC)
