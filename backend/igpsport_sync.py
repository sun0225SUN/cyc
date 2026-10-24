import argparse
import logging
import os
import re
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from urllib.parse import urlsplit

import httpx

BASE_URL = "https://prod.zh.igpsport.com/service/"
LOGIN_URL = BASE_URL + "auth/account/login"
LIST_URL = BASE_URL + "web-gateway/web-analyze/activity/queryMyActivity"
DOWNLOAD_URL = BASE_URL + "web-gateway/web-analyze/activity/getDownloadUrl/"

_RETRY_STATUS = {429, 500, 502, 503, 504}
_ATTEMPTS = 3
_MAX_PAGES = 1000
_ACTIVITY_ID = re.compile(r"[A-Za-z0-9_-]+")
_ENV_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
logger = logging.getLogger(__name__)


class IGPSportError(Exception):
    """iGPSPORT rejected a request or the local settings are unusable."""


class IGPSport:
    """Login, list activities, and download the original FIT file."""

    def __init__(
        self,
        username: str = "",
        password: str = "",
        access_token: str = "",
        *,
        page_size: int = 20,
        http: httpx.Client | None = None,
    ) -> None:
        if page_size < 1:
            raise IGPSportError("page_size must be >= 1")
        self.username = username
        self.password = password
        self.access_token = access_token.strip()
        self.page_size = page_size
        self._owns_client = http is None
        self._http = http or httpx.Client(
            timeout=httpx.Timeout(30.0, read=120.0),
            follow_redirects=True,
            headers={"Accept": "application/json, */*", "User-Agent": "igpsport-sync"},
        )

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> "IGPSport":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def login(self) -> None:
        if self.access_token:
            self._http.headers["Authorization"] = f"Bearer {self.access_token}"
            return
        if not self.username or not self.password:
            raise IGPSportError("iGPSPORT username and password are required")
        response = self._send(
            lambda: self._http.build_request(
                "POST",
                LOGIN_URL,
                json={
                    "appId": "igpsport-web",
                    "username": self.username,
                    "password": self.password,
                },
            )
        )
        body = _json_object(response, "login")
        token = ""
        data = body.get("data")
        if isinstance(data, dict):
            raw_token = data.get("access_token") or ""
            if isinstance(raw_token, str):
                token = raw_token.strip()
        if not token:
            raise IGPSportError("iGPSPORT login did not return an access token")
        self.access_token = token
        self._http.headers["Authorization"] = f"Bearer {self.access_token}"

    def iter_activity_ids(self) -> Iterator[str]:
        page = 1
        while page <= _MAX_PAGES:
            current = page
            response = self._send(
                lambda current=current: self._http.build_request(
                    "GET",
                    LIST_URL,
                    params={
                        "pageNo": str(current),
                        "pageSize": str(self.page_size),
                        "sort": "1",
                        "reqType": "0",
                    },
                )
            )
            body = _json_object(response, "activity list")
            data = body.get("data")
            if not isinstance(data, dict):
                raise IGPSportError("iGPSPORT activity list is missing data")
            rows = data.get("rows") or []
            if not isinstance(rows, list):
                raise IGPSportError("iGPSPORT activity list is missing rows")
            for row in rows:
                activity_id = _activity_id(row)
                if activity_id is not None:
                    yield activity_id
            if not rows:
                return
            total_page = data.get("totalPage")
            if total_page is None:
                if len(rows) < self.page_size:
                    return
            else:
                try:
                    total = int(total_page)
                except (TypeError, ValueError) as exc:
                    raise IGPSportError(
                        "iGPSPORT activity list has an invalid totalPage"
                    ) from exc
                if page >= total:
                    return
            page += 1
        raise IGPSportError("iGPSPORT activity list exceeded the page limit")

    def download(self, activity_id: str) -> bytes:
        if not _ACTIVITY_ID.fullmatch(activity_id):
            raise IGPSportError("iGPSPORT activity id is invalid")
        response = self._send(
            lambda: self._http.build_request("GET", DOWNLOAD_URL + activity_id)
        )
        body = _json_object(response, "download url")
        url = _download_url(body.get("data"))
        file_response = self._send(lambda: _file_request(self._http, url))
        if file_response.is_error:
            raise IGPSportError(
                f"iGPSPORT file download failed with HTTP {file_response.status_code}"
            )
        content = file_response.content
        if not looks_like_fit(content):
            raise IGPSportError(
                f"iGPSPORT activity {activity_id} did not return a FIT file"
            )
        return content

    def _send(self, build: Callable[[], httpx.Request]) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(_ATTEMPTS):
            try:
                response = self._http.send(build())
            except httpx.TransportError as exc:
                last_error = exc
                continue
            if response.status_code in _RETRY_STATUS and attempt < _ATTEMPTS - 1:
                response.close()
                continue
            return response
        raise IGPSportError("iGPSPORT request failed") from last_error


def looks_like_fit(content: bytes) -> bool:
    """A FIT header is at least 12 bytes, with the ASCII magic ``.FIT`` at offset 8."""

    return len(content) >= 12 and content[0] >= 12 and content[8:12] == b".FIT"


def sync_fit(
    client: IGPSport,
    output_dir: Path,
    *,
    limit: int | None = None,
) -> tuple[list[Path], list[str], list[tuple[str, str]]]:
    """Download FIT files that are not already valid files in ``output_dir``.

    One failed activity is recorded and the rest of the list continues.
    ``limit`` counts activities visited, including ones that are skipped.
    """

    if limit is not None and limit < 1:
        raise IGPSportError("limit must be >= 1")
    client.login()
    downloaded: list[Path] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []
    seen = 0
    for activity_id in client.iter_activity_ids():
        seen += 1
        try:
            path = _fit_path(output_dir, activity_id)
            if _has_valid_fit(path):
                skipped.append(activity_id)
                logger.info("skipped %s", activity_id)
            else:
                _write_fit(path, output_dir, client.download(activity_id))
                downloaded.append(path)
                logger.info("saved %s", path)
        except (IGPSportError, OSError) as exc:
            failed.append((activity_id, str(exc)))
            logger.warning("failed %s: %s", activity_id, exc)
        if limit is not None and seen >= limit:
            break
    return downloaded, skipped, failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download iGPSPORT FIT files.")
    parser.add_argument("--username", default=None, help="Overrides IGPSPORT_USERNAME")
    parser.add_argument("--password", default=None, help="Overrides IGPSPORT_PASSWORD")
    parser.add_argument(
        "--access-token",
        default=None,
        help="Overrides IGPSPORT_ACCESS_TOKEN and skips login",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Directory for FIT files. Defaults to ACTIVITY_DATA_DIR or data/raw",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Stop after this many activities from the remote list",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        username, password, access_token, output_dir, limit = _settings(args)
        with IGPSport(username, password, access_token) as client:
            downloaded, skipped, failed = sync_fit(client, output_dir, limit=limit)
    except IGPSportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"downloaded {len(downloaded)}, skipped {len(skipped)}, failed {len(failed)}")
    for activity_id, reason in failed:
        print(f"failed {activity_id}: {reason}")
    return 1 if failed else 0


def _settings(
    args: argparse.Namespace,
) -> tuple[str, str, str, Path, int | None]:
    if args.limit is not None and args.limit < 1:
        raise IGPSportError("limit must be >= 1")
    dotenv = Path.cwd() / ".env"
    merged: dict[str, str] = {}
    if dotenv.is_file():
        merged.update(_read_env_file(dotenv))
    merged.update(os.environ)
    if args.username is not None:
        merged["IGPSPORT_USERNAME"] = args.username
    if args.password is not None:
        merged["IGPSPORT_PASSWORD"] = args.password
    if args.access_token is not None:
        merged["IGPSPORT_ACCESS_TOKEN"] = args.access_token
    username = merged.get("IGPSPORT_USERNAME", "").strip()
    password = merged.get("IGPSPORT_PASSWORD", "").strip()
    access_token = merged.get("IGPSPORT_ACCESS_TOKEN", "").strip()
    if not access_token and (not username or not password):
        raise IGPSportError(
            "set IGPSPORT_ACCESS_TOKEN, or both IGPSPORT_USERNAME and IGPSPORT_PASSWORD"
        )
    output_value = (
        args.output if args.output is not None else merged.get("ACTIVITY_DATA_DIR")
    )
    output_dir = (
        Path(output_value.strip())
        if output_value and output_value.strip()
        else Path("data/raw")
    )
    return username, password, access_token, output_dir, args.limit


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not _ENV_KEY.fullmatch(key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def _fit_path(output_dir: Path, activity_id: str) -> Path:
    if not _ACTIVITY_ID.fullmatch(activity_id):
        raise IGPSportError("iGPSPORT activity id is invalid")
    return output_dir / f"{activity_id}.fit"


def _has_valid_fit(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    with path.open("rb") as handle:
        return looks_like_fit(handle.read(16))


def _write_fit(path: Path, output_dir: Path, content: bytes) -> None:
    if not looks_like_fit(content):
        raise IGPSportError("refusing to store bytes that are not a FIT file")
    destination = path.resolve()
    root = output_dir.resolve()
    if destination != root and root not in destination.parents:
        raise IGPSportError("refusing to write outside the data directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".fit.part")
    temporary.write_bytes(content)
    temporary.replace(destination)


def _activity_id(row: object) -> str | None:
    if not isinstance(row, dict):
        return None
    ride_id = row.get("rideId")
    if ride_id is None or ride_id == "":
        return None
    activity_id = str(ride_id)
    if not _ACTIVITY_ID.fullmatch(activity_id):
        return None
    return activity_id


def _download_url(data: object) -> str:
    url = ""
    if isinstance(data, str):
        url = data.strip()
    elif isinstance(data, dict):
        for key in ("url", "downloadUrl", "fileUrl"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                url = value.strip()
                break
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise IGPSportError("iGPSPORT returned an invalid download URL")
    return url


def _file_request(http: httpx.Client, url: str) -> httpx.Request:
    request = http.build_request("GET", url)
    request.headers.pop("authorization", None)
    return request


def _json_object(response: httpx.Response, what: str) -> dict[str, object]:
    if response.is_error:
        raise IGPSportError(f"iGPSPORT {what} failed with HTTP {response.status_code}")
    try:
        body = response.json()
    except ValueError as exc:
        raise IGPSportError(
            f"iGPSPORT {what} returned non-JSON (HTTP {response.status_code})"
        ) from exc
    if not isinstance(body, dict):
        raise IGPSportError(f"iGPSPORT {what} returned an unexpected payload")
    return body


if __name__ == "__main__":
    raise SystemExit(main())
