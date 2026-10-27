import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from igpsport.data_sync import IGPSport, IGPSportError, looks_like_fit, main, sync_fit


def fit_bytes(payload: bytes = b"records") -> bytes:
    header = bytearray(14)
    header[0] = 14
    header[8:12] = b".FIT"
    return bytes(header) + payload


def client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    phone: str = "",
    password: str = "",
    access_token: str = "",
    page_size: int = 20,
) -> IGPSport:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return IGPSport(
        phone,
        password,
        access_token,
        page_size=page_size,
        http=http,
    )


def test_access_token_skips_login() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected request {request.url}")

    sport = client(handler, access_token="saved-token")
    sport.login()

    assert sport._http.headers["Authorization"] == "Bearer saved-token"


def test_login_stores_access_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body == {
            "appId": "igpsport-web",
            "username": "13800000000",
            "password": "secret",
        }
        return httpx.Response(200, json={"data": {"access_token": "fresh"}})

    sport = client(handler, phone="13800000000", password="secret")
    sport.login()

    assert sport.access_token == "fresh"
    assert sport._http.headers["Authorization"] == "Bearer fresh"


def test_login_retries_then_reads_the_token() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] < 3:
            raise httpx.ConnectError("down")
        return httpx.Response(200, json={"data": {"access_token": "fresh"}})

    sport = client(handler, phone="user", password="secret")
    sport.login()

    assert calls["count"] == 3


def test_login_without_token_does_not_echo_the_password() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {}})

    sport = client(handler, phone="user", password="secret")
    with pytest.raises(IGPSportError, match="access token") as exc_info:
        sport.login()

    assert "secret" not in str(exc_info.value)


def test_lists_every_page_and_drops_unsafe_ids() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer tok"
        assert request.url.params["reqType"] == "0"
        page = request.url.params["pageNo"]
        if page == "1":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "totalPage": "2",
                        "rows": [{"rideId": 11}, {"rideId": ""}, {"rideId": "../etc"}],
                    }
                },
            )
        return httpx.Response(
            200, json={"data": {"totalPage": 2, "rows": [{"rideId": "12"}]}}
        )

    sport = client(handler, access_token="tok", page_size=2)
    sport.login()

    assert list(sport.iter_activity_ids()) == ["11", "12"]


def test_download_strips_authorization_on_the_file_host() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "getDownloadUrl" in request.url.path:
            assert request.headers["Authorization"] == "Bearer tok"
            return httpx.Response(
                200, json={"data": "https://files.example/a.fit?sig=1"}
            )
        assert "authorization" not in request.headers
        return httpx.Response(200, content=fit_bytes())

    sport = client(handler, access_token="tok")
    sport.login()

    assert looks_like_fit(sport.download("99"))


def test_download_rejects_non_fit_without_the_signed_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "getDownloadUrl" in request.url.path:
            return httpx.Response(
                200, json={"data": "https://files.example/a.fit?sig=secret"}
            )
        return httpx.Response(200, content=b"<html>nope</html>")

    sport = client(handler, access_token="tok")
    sport.login()
    with pytest.raises(IGPSportError, match="did not return a FIT file") as exc_info:
        sport.download("99")

    assert "sig=secret" not in str(exc_info.value)


def test_invalid_activity_id_is_rejected_before_a_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(request.url)

    sport = client(handler, access_token="tok")
    with pytest.raises(IGPSportError, match="invalid"):
        sport.download("../99")


class Listing:
    def __init__(self, ids: list[str], *, fail: set[str] | None = None) -> None:
        self.ids = ids
        self.fail = fail or set()
        self.downloaded: list[str] = []

    def login(self) -> None:
        return None

    def iter_activity_ids(self):
        yield from self.ids

    def download(self, activity_id: str) -> bytes:
        self.downloaded.append(activity_id)
        if activity_id in self.fail:
            raise IGPSportError("temporary failure")
        return fit_bytes(activity_id.encode())


def test_sync_skips_valid_files_and_continues_after_failure(tmp_path: Path) -> None:
    existing = tmp_path / "1.fit"
    existing.write_bytes(fit_bytes(b"already"))
    broken = tmp_path / "9.fit"
    broken.write_bytes(b"garbage-garbage")
    source = Listing(["1", "2", "9"], fail={"2"})

    downloaded, skipped, failed = sync_fit(source, tmp_path)  # type: ignore[arg-type]

    assert skipped == ["1"]
    assert [path.name for path in downloaded] == ["9.fit"]
    assert failed == [("2", "temporary failure")]
    assert looks_like_fit((tmp_path / "9.fit").read_bytes())
    assert source.downloaded == ["2", "9"]
    assert not list(tmp_path.glob("*.part"))


def test_sync_limit_counts_skipped_activities(tmp_path: Path) -> None:
    (tmp_path / "1.fit").write_bytes(fit_bytes())
    source = Listing(["1", "2", "3"])

    downloaded, skipped, failed = sync_fit(source, tmp_path, limit=2)  # type: ignore[arg-type]

    assert skipped == ["1"]
    assert [path.name for path in downloaded] == ["2.fit"]
    assert failed == []
    assert source.downloaded == ["2"]


def test_cli_does_not_print_the_password(tmp_path: Path, monkeypatch, capsys) -> None:
    class Fake:
        def __init__(self, phone: str, password: str, access_token: str) -> None:
            self.password = password

        def __enter__(self) -> "Fake":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def login(self) -> None:
            return None

        def iter_activity_ids(self):
            yield "42"

        def download(self, activity_id: str) -> bytes:
            return fit_bytes()

    monkeypatch.setattr("igpsport.data_sync.IGPSport", Fake)
    monkeypatch.chdir(tmp_path)
    code = main(
        [
            "--phone",
            "13800000000",
            "--password",
            "super-secret-password",
            "--output",
            str(tmp_path),
        ]
    )

    captured = capsys.readouterr()
    assert code == 0
    assert "super-secret-password" not in captured.out
    assert "super-secret-password" not in captured.err
    assert (tmp_path / "42.fit").is_file()


def test_cli_reports_missing_credentials(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("IGPSPORT_PHONE", raising=False)
    monkeypatch.delenv("IGPSPORT_PASSWORD", raising=False)
    monkeypatch.delenv("IGPSPORT_ACCESS_TOKEN", raising=False)

    code = main([])

    captured = capsys.readouterr()
    assert code == 1
    assert "IGPSPORT_ACCESS_TOKEN" in captured.err
