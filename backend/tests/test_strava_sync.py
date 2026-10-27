import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from igpsport.fit_data_parse import Activity, connect
from strava.activity_data_parse import activity_from_payload, import_rides
from strava.data_sync import (
    _REQUEST_INTERVAL,
    Strava,
    StravaError,
    is_complete,
    main,
    sync_rides,
)


def client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    client_id: str = "291008",
    client_secret: str = "secret",
    refresh_token: str = "refresh",
    sleep: Callable[[float], None] | None = None,
) -> Strava:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return Strava(
        client_id,
        client_secret,
        refresh_token,
        http=http,
        sleep=sleep or (lambda _seconds: None),
    )


def ride(activity_id: int = 11, **overrides: object) -> dict[str, object]:
    activity: dict[str, object] = {
        "id": activity_id,
        "name": "Night Ride",
        "distance": 1000.0,
        "moving_time": 200,
        "elapsed_time": 240,
        "total_elevation_gain": 12.0,
        "type": "Ride",
        "sport_type": "Ride",
        "start_date": "2026-10-25T13:23:09Z",
        "start_date_local": "2026-10-25T21:23:09Z",
        "average_speed": 5.0,
        "max_speed": 9.0,
        "average_heartrate": 140.0,
        "max_heartrate": 160.0,
        "average_cadence": 80.0,
        "average_watts": 180.0,
        "max_watts": 400.0,
        "elev_high": 520.0,
        "elev_low": 500.0,
        "start_latlng": [30.67, 104.06],
        "map": {"summary_polyline": "encoded"},
    }
    activity.update(overrides)
    return activity


def streams() -> dict[str, object]:
    return {
        "time": {"data": [0, 2]},
        "latlng": {"data": [[30.67, 104.06], [30.68, 104.07]]},
        "distance": {"data": [0, 20]},
        "altitude": {"data": [500, 512]},
        "velocity_smooth": {"data": [5.0, 6.0]},
        "heartrate": {"data": [130, 150]},
        "cadence": {"data": [80, 90]},
        "watts": {"data": [180, 210]},
        "temp": {"data": [24, 25]},
    }


def test_refresh_stores_the_access_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/oauth/token"
        body = request.content.decode()
        assert "grant_type=refresh_token" in body
        assert "client_id=291008" in body
        return httpx.Response(
            200,
            json={
                "token_type": "Bearer",
                "access_token": "access",
                "refresh_token": "refresh",
            },
        )

    strava = client(handler)
    strava.refresh()

    assert strava._http.headers["Authorization"] == "Bearer access"
    assert strava.refresh_token_rotated is False


def test_refresh_without_a_token_does_not_echo_the_secret() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"message": "bad"})

    strava = client(handler, client_secret="super-secret")
    with pytest.raises(StravaError, match="HTTP 400") as exc_info:
        strava.refresh()

    assert "super-secret" not in str(exc_info.value)


def test_lists_rides_and_drops_runs() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer access"
        page = request.url.params["page"]
        if page == "1":
            rows = [ride(11), ride(12, type="Run", sport_type="Run"), {"id": "bad"}]
            rows.extend(ride(1000 + index) for index in range(197))
            return httpx.Response(200, json=rows)
        return httpx.Response(200, json=[ride(13, sport_type="VirtualRide")])

    strava = client(handler)
    strava._http.headers["Authorization"] = "Bearer access"

    assert [item["id"] for item in strava.iter_rides()] == [11, *range(1000, 1197), 13]


def test_download_keeps_streams_when_laps_are_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/streams"):
            assert "latlng" in request.url.params["keys"]
            return httpx.Response(200, json=streams())
        return httpx.Response(404, json={"message": "Resource Not Found"})

    strava = client(handler)
    payload = strava.download(ride())

    assert payload["streams"] == streams()
    assert payload["laps"] == []


def test_sync_skips_a_complete_file_and_continues_after_failure(tmp_path: Path) -> None:
    (tmp_path / "11.json").write_text(
        json.dumps({"activity": ride(11), "streams": {}}),
        encoding="utf-8",
    )
    calls = {"streams": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/activities"):
            return httpx.Response(200, json=[ride(11), ride(12), ride(13)])
        if request.url.path.endswith("/12/streams"):
            calls["streams"] += 1
            raise httpx.ConnectError("down")
        if "/streams" in request.url.path:
            return httpx.Response(200, json=streams())
        return httpx.Response(200, json=[])

    strava = client(handler)
    downloaded, skipped, failed, rate_limit = sync_rides(strava, tmp_path)

    assert rate_limit is None
    assert skipped == ["11"]
    assert [path.name for path in downloaded] == ["13.json"]
    assert failed[0][0] == "12"
    assert calls["streams"] == 6
    assert is_complete(tmp_path / "13.json")
    assert not list(tmp_path.glob("*.part"))


def test_request_interval_follows_the_read_quota() -> None:
    assert _REQUEST_INTERVAL == 15 * 60 / 100


def test_rate_limit_headers_do_not_change_the_interval() -> None:
    pauses: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[],
            headers={
                "X-RateLimit-Usage": "10,10",
                "X-RateLimit-Limit": "200,2000",
                "X-ReadRateLimit-Usage": "40,40",
                "X-ReadRateLimit-Limit": "100,1000",
            },
        )

    strava = client(handler, sleep=pauses.append)
    strava._get("/athlete")
    strava._get("/athlete")

    assert pauses == [_REQUEST_INTERVAL]
    assert strava._daily_limit_hit is False


def test_read_rate_limit_stops_at_the_daily_read_cap(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/activities"):
            return httpx.Response(
                200,
                json=[ride(11)],
                headers={
                    "X-RateLimit-Usage": "10,10",
                    "X-RateLimit-Limit": "200,2000",
                    "X-ReadRateLimit-Usage": "10,1000",
                    "X-ReadRateLimit-Limit": "100,1000",
                },
            )
        raise AssertionError(request.url.path)

    strava = client(handler)
    downloaded, skipped, failed, rate_limit = sync_rides(strava, tmp_path)

    assert downloaded == []
    assert skipped == []
    assert failed == []
    assert rate_limit is not None
    assert "midnight UTC" in rate_limit


def test_sync_stops_when_the_daily_limit_is_exhausted(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/activities"):
            return httpx.Response(
                200,
                json=[ride(11)],
                headers={
                    "X-RateLimit-Usage": "1,2000",
                    "X-RateLimit-Limit": "200,2000",
                },
            )
        raise AssertionError(request.url.path)

    strava = client(handler)
    downloaded, skipped, failed, rate_limit = sync_rides(strava, tmp_path)

    assert downloaded == []
    assert skipped == []
    assert failed == []
    assert rate_limit is not None
    assert "429" in rate_limit


def test_transport_error_names_the_cause() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection reset", request=request)

    strava = client(handler)

    with pytest.raises(StravaError, match="connection reset") as exc_info:
        strava._get("/athlete")

    message = str(exc_info.value)
    assert "ConnectError" in message
    assert "/athlete" in message


def test_429_stops_without_retrying_and_keeps_saved_rides(tmp_path: Path) -> None:
    calls = {"streams": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/activities"):
            return httpx.Response(200, json=[ride(11), ride(12), ride(13)])
        if "/streams" in request.url.path:
            calls["streams"] += 1
            if request.url.path.endswith("/11/streams"):
                return httpx.Response(200, json=streams())
            return httpx.Response(429, json={"message": "Rate Limit Exceeded"})
        return httpx.Response(200, json=[])

    strava = client(handler)
    downloaded, skipped, failed, rate_limit = sync_rides(strava, tmp_path)

    assert [path.name for path in downloaded] == ["11.json"]
    assert skipped == []
    assert failed == []
    assert rate_limit is not None
    assert "15, 30, and 45" in rate_limit
    assert calls["streams"] == 2


def test_main_treats_a_rate_limit_as_success(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    class Fake:
        refresh_token_rotated = False

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            return None

        def __enter__(self) -> "Fake":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def refresh(self) -> None:
            return None

    monkeypatch.setattr("strava.data_sync.Strava", Fake)
    monkeypatch.setattr(
        "strava.data_sync.sync_rides",
        lambda *_args, **_kwargs: (
            [],
            [],
            [],
            "Strava returned 429 Too Many Requests.",
        ),
    )

    code = main(
        [
            "--client-id",
            "1",
            "--client-secret",
            "2",
            "--refresh-token",
            "3",
            "--output",
            str(tmp_path),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert "================ warning ================" in captured.err
    assert "429" in captured.err
    assert "downloaded 0, skipped 0, failed 0" in captured.out


def test_activity_from_payload_matches_the_fit_record() -> None:
    payload = {
        "activity": ride(42, name="", sport_type="GravelRide"),
        "streams": streams(),
        "laps": [
            {
                "lap_index": 1,
                "start_index": 0,
                "end_index": 1,
                "distance": 1000,
                "moving_time": 200,
                "elapsed_time": 240,
                "average_speed": 5,
                "average_watts": 180,
                "total_elevation_gain": 12,
            }
        ],
    }

    activity = activity_from_payload(payload)

    assert isinstance(activity, Activity)
    assert activity.id == 42
    assert activity.type == "cycling"
    assert activity.subtype == "gravel"
    assert activity.start_date == "2026-10-25 13:23:09"
    assert activity.start_date_local == "2026-10-25 21:23:09"
    assert activity.summary_polyline == "encoded"
    assert activity.start_lat == 30.67
    assert activity.records[1].power == 210
    assert activity.records[1].heart_rate == 150
    assert activity.records[1].cadence == 90
    assert activity.laps[0].lat == 30.68
    assert activity.laps[0].stats["elevation_gain"] == 12
    assert activity.session_stats.elevation_loss == 0
    assert activity.session_stats.max_cadence == 90
    assert activity.session_stats.average_power == 180


def test_import_keeps_an_existing_fit_row(tmp_path: Path) -> None:
    raw = tmp_path / "rides"
    raw.mkdir()
    (raw / "42.json").write_text(
        json.dumps({"activity": ride(42), "streams": streams(), "laps": []}),
        encoding="utf-8",
    )
    db = tmp_path / "activities.db"
    imported, _backfilled, skipped, failed = import_rides(raw, db)
    assert imported == [42]
    assert skipped == []
    assert failed == []

    again = import_rides(raw, db)
    assert again[0] == []
    assert again[2] == [42]

    connection = connect(db)
    connection.execute(
        "UPDATE activities SET source_file = ? WHERE id = ?",
        ("42.fit", 42),
    )
    connection.commit()
    connection.close()
    conflict = import_rides(raw, db)
    assert conflict[3][0][0] == "42.json"
    assert "another source" in conflict[3][0][1]


def test_source_has_no_embedded_credentials() -> None:
    source = (
        Path(__file__)
        .parents[1]
        .joinpath("strava/data_sync.py")
        .read_text(encoding="utf-8")
    )
    assert "beae4bc75bb1bb6fc5e87a08d26fd934f4dc255c" not in source
    assert "6ba216c2d101c0ead95cf29c5ba121b60cb87db6" not in source


def test_cli_reads_env_and_does_not_print_the_secret(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    env = tmp_path / ".env"
    env.write_text(
        "\n".join(
            [
                "STRAVA_CLIENT_ID=291008",
                "STRAVA_CLIENT_SECRET=super-secret",
                "STRAVA_REFRESH_TOKEN=refresh-token",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("strava.data_sync._env_paths", lambda: [env])
    monkeypatch.delenv("STRAVA_CLIENT_ID", raising=False)
    monkeypatch.delenv("STRAVA_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("STRAVA_REFRESH_TOKEN", raising=False)

    class Fake:
        refresh_token_rotated = False

        def __init__(
            self, client_id: str, client_secret: str, refresh_token: str
        ) -> None:
            assert client_secret == "super-secret"
            self.refresh_token = refresh_token

        def __enter__(self) -> "Fake":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def refresh(self) -> None:
            return None

        def iter_rides(self):
            yield ride(7)

        def download(self, summary: dict[str, object]) -> dict[str, object]:
            return {"activity": summary, "streams": {}, "laps": []}

    monkeypatch.setattr("strava.data_sync.Strava", Fake)
    code = main(["--output", str(tmp_path / "strava")])

    captured = capsys.readouterr()
    assert code == 0
    assert "super-secret" not in captured.out
    assert "super-secret" not in captured.err
    assert "downloaded 1" in captured.out
    assert "imported" not in captured.out
    assert is_complete(tmp_path / "strava" / "7.json")


def test_cli_reports_missing_credentials(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.setattr("strava.data_sync._env_paths", lambda: [])
    monkeypatch.delenv("STRAVA_CLIENT_ID", raising=False)
    monkeypatch.delenv("STRAVA_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("STRAVA_REFRESH_TOKEN", raising=False)

    code = main([])

    captured = capsys.readouterr()
    assert code == 1
    assert "STRAVA_REFRESH_TOKEN" in captured.err
