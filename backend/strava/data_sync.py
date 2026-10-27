import argparse
import json
import logging
import os
import re
import sys
import time
from collections.abc import Callable
from pathlib import Path

import httpx

TOKEN_URL = "https://www.strava.com/oauth/token"
API_URL = "https://www.strava.com/api/v3"
_RETRY_STATUS = {500, 502, 503, 504}
_ATTEMPTS = 6
_MAX_PAGES = 1000
_PAGE_SIZE = 200
# Strava's default app quotas. GET requests use the read row, which is tighter
# than the overall row. The pause is fixed from that read row and does not
# follow the limits in the response headers.
#
# quota     15 minutes    day
# read      100           1,000
# overall   200           2,000
#
# 15 * 60 / 100 = 9 seconds between requests, so one window stays within 100.
_REQUEST_INTERVAL = 15 * 60 / 100
_ENV_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_RIDE_SPORTS = {
    "Ride",
    "MountainBikeRide",
    "GravelRide",
    "EBikeRide",
    "EMountainBikeRide",
    "VirtualRide",
    "Velomobile",
    "Handcycle",
}
_STREAM_KEYS = (
    "time,latlng,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp"
)
logger = logging.getLogger(__name__)


class StravaError(Exception):
    """Strava rejected a request or the local settings are unusable."""


class StravaRateLimit(StravaError):
    """Strava returned 429 or the daily quota is already spent.

    The download stops, and the fetch command still exits successfully so
    parse and export can use the rides already saved.
    """


# The 15-minute window resets at 0, 15, 30, and 45 minutes past the hour.
# The daily window resets at midnight UTC. A request that breaks the short
# window still counts against the daily window, so a 429 is not retried.
_RATE_LIMIT_MESSAGE = (
    "Strava returned 429 Too Many Requests. "
    "The 15-minute limit resets at 0, 15, 30, and 45 minutes past the hour. "
    "The daily limit resets at midnight UTC. "
    "Requests over the 15-minute limit still count toward the daily limit."
)


class Strava:
    """Refresh an access token, list rides, and download streams and laps."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        *,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.refresh_token = refresh_token.strip()
        self.refresh_token_rotated = False
        self._sleep = sleep or time.sleep
        self._started = False
        self._daily_limit_hit = False
        self._owns_client = http is None
        self._http = http or httpx.Client(
            timeout=httpx.Timeout(30.0, read=120.0),
            follow_redirects=True,
            headers={"Accept": "application/json, */*", "User-Agent": "strava-sync"},
        )

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> "Strava":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def refresh(self) -> None:
        if not self.client_id or not self.client_secret or not self.refresh_token:
            raise StravaError(
                "set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN"
            )
        previous = self.refresh_token
        response = self._send(
            lambda: self._http.build_request(
                "POST",
                TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                },
            )
        )
        body = _json_object(response, "token refresh")
        access_token = body.get("access_token")
        if not isinstance(access_token, str) or not access_token.strip():
            raise StravaError("Strava token refresh did not return an access token")
        rotated = body.get("refresh_token")
        if isinstance(rotated, str) and rotated.strip():
            self.refresh_token = rotated.strip()
        self.refresh_token_rotated = self.refresh_token != previous
        self._http.headers["Authorization"] = f"Bearer {access_token.strip()}"

    def iter_rides(self):
        page = 1
        while page <= _MAX_PAGES:
            current = page
            response = self._send(
                lambda current=current: self._http.build_request(
                    "GET",
                    f"{API_URL}/athlete/activities",
                    params={"page": str(current), "per_page": str(_PAGE_SIZE)},
                )
            )
            body = _json_value(response, "activity list")
            if not isinstance(body, list):
                raise StravaError("Strava activity list returned an unexpected payload")
            for row in body:
                if isinstance(row, dict) and _is_ride(row):
                    yield row
            if len(body) < _PAGE_SIZE:
                return
            page += 1
        raise StravaError("Strava activity list exceeded the page limit")

    def download(self, summary: dict[str, object]) -> dict[str, object]:
        activity_id = _activity_id(summary.get("id"))
        streams = self._get(
            f"/activities/{activity_id}/streams",
            {
                "keys": _STREAM_KEYS,
                "key_by_type": "true",
            },
            missing_ok=True,
        )
        laps = self._get(f"/activities/{activity_id}/laps", missing_ok=True)
        return {
            "activity": summary,
            "streams": _normalize_streams(streams),
            "laps": laps if isinstance(laps, list) else [],
        }

    def _get(
        self,
        path: str,
        params: dict[str, str] | None = None,
        *,
        missing_ok: bool = False,
    ) -> object:
        response = self._send(
            lambda: self._http.build_request(
                "GET",
                API_URL + path,
                params=params,
            )
        )
        if missing_ok and response.status_code == 404:
            return None
        return _json_value(response, path)

    def _send(self, build: Callable[[], httpx.Request]) -> httpx.Response:
        if self._daily_limit_hit:
            raise StravaRateLimit(_RATE_LIMIT_MESSAGE)
        if self._started:
            self._sleep(_REQUEST_INTERVAL)
        self._started = True
        last_error: Exception | None = None
        for attempt in range(_ATTEMPTS):
            try:
                response = self._http.send(build())
            except httpx.TransportError as exc:
                last_error = exc
                continue
            if response.status_code == 429:
                response.close()
                raise StravaRateLimit(_RATE_LIMIT_MESSAGE)
            if response.status_code in _RETRY_STATUS and attempt < _ATTEMPTS - 1:
                response.close()
                self._sleep(15 * (attempt + 1))
                continue
            self._note_rate_limit(response)
            return response
        raise StravaError(
            f"Strava request failed: {_transport_detail(last_error)}"
        ) from last_error

    def _note_rate_limit(self, response: httpx.Response) -> None:
        for _used_15, _limit_15, used_day, limit_day in _rate_windows(response):
            if limit_day > 0 and used_day >= limit_day:
                self._daily_limit_hit = True


def _rate_windows(response: httpx.Response) -> list[tuple[int, int, int, int]]:
    """Usage from the response. The request pace is ``_REQUEST_INTERVAL``.

    Each item is ``(used_15, limit_15, used_day, limit_day)`` for the overall
    quota and, when present, the tighter read quota. Hitting the daily figure
    stops the download with a warning. It does not use these numbers to choose
    the pause.
    """

    windows: list[tuple[int, int, int, int]] = []
    for usage_name, limit_name in (
        ("X-RateLimit-Usage", "X-RateLimit-Limit"),
        ("X-ReadRateLimit-Usage", "X-ReadRateLimit-Limit"),
    ):
        usage = response.headers.get(usage_name)
        limit = response.headers.get(limit_name)
        if not usage or not limit:
            continue
        try:
            used_15, used_day = (int(part.strip()) for part in usage.split(","))
            limit_15, limit_day = (int(part.strip()) for part in limit.split(","))
        except ValueError:
            continue
        windows.append((used_15, limit_15, used_day, limit_day))
    return windows


def _transport_detail(error: Exception | None) -> str:
    if error is None:
        return "the connection failed"
    request = getattr(error, "request", None)
    url = getattr(request, "url", None)
    target = f" {url}" if url else ""
    return f"{error.__class__.__name__}{target}: {error}"


def _warn_rate_limit(message: str) -> None:
    print("\n================ warning ================", file=sys.stderr)
    print(message, file=sys.stderr)
    print("Download stopped. Already saved rides are kept.", file=sys.stderr)
    print("================ warning ================", file=sys.stderr)


def is_complete(path: Path) -> bool:
    """A saved ride has the summary and a streams object, and the id matches the name."""

    if not path.is_file() or path.stat().st_size == 0:
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    activity = payload.get("activity")
    if not isinstance(activity, dict):
        return False
    try:
        activity_id = _activity_id(activity.get("id"))
    except StravaError:
        return False
    return path.stem == str(activity_id) and isinstance(payload.get("streams"), dict)


def sync_rides(
    client: Strava,
    output_dir: Path,
    *,
    limit: int | None = None,
) -> tuple[list[Path], list[str], list[tuple[str, str]], str | None]:
    """Download ride JSON that is not already a complete file in ``output_dir``.

    One failed activity is recorded and the rest of the list continues.
    A rate limit stops the download and is returned separately from failures.
    ``limit`` counts rides visited, including ones that are skipped.
    """

    if limit is not None and limit < 1:
        raise StravaError("limit must be >= 1")
    downloaded: list[Path] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []
    rate_limit: str | None = None
    seen = 0
    try:
        rides = client.iter_rides()
        for summary in rides:
            seen += 1
            activity_id = ""
            try:
                activity_id = str(_activity_id(summary.get("id")))
                path = _ride_path(output_dir, int(activity_id))
                if is_complete(path):
                    skipped.append(activity_id)
                    logger.info("skipped %s", activity_id)
                else:
                    _write_ride(path, output_dir, client.download(summary))
                    downloaded.append(path)
                    logger.info("saved %s", path)
            except StravaRateLimit as exc:
                rate_limit = str(exc)
                break
            except (StravaError, OSError, ValueError) as exc:
                label = activity_id or "unknown"
                failed.append((label, str(exc)))
                logger.warning("failed %s: %s", label, exc)
            if limit is not None and seen >= limit:
                break
    except StravaRateLimit as exc:
        rate_limit = str(exc)
    except StravaError as exc:
        failed.append(("list", str(exc)))
        logger.warning("stopped: %s", exc)
    return downloaded, skipped, failed, rate_limit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download Strava rides.")
    parser.add_argument("--client-id", default=None, help="Overrides STRAVA_CLIENT_ID")
    parser.add_argument(
        "--client-secret",
        default=None,
        help="Overrides STRAVA_CLIENT_SECRET",
    )
    parser.add_argument(
        "--refresh-token",
        default=None,
        help="Overrides STRAVA_REFRESH_TOKEN",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Directory for ride JSON. Defaults to data/strava",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Stop after this many rides from the remote list",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    try:
        settings = _settings(args)
        with Strava(
            settings.client_id,
            settings.client_secret,
            settings.refresh_token,
        ) as client:
            client.refresh()
            downloaded, skipped, failed, rate_limit = sync_rides(
                client,
                settings.output_dir,
                limit=args.limit,
            )
            if client.refresh_token_rotated:
                _persist_refresh_token(settings.env_files, client.refresh_token)
    except StravaRateLimit as exc:
        _warn_rate_limit(str(exc))
        return 0
    except StravaError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"downloaded {len(downloaded)}, skipped {len(skipped)}, failed {len(failed)}")
    for activity_id, reason in failed:
        print(f"failed {activity_id}: {reason}")
    if rate_limit:
        _warn_rate_limit(rate_limit)
    return 1 if failed else 0


class _Settings:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        output_dir: Path,
        env_files: list[Path],
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self.output_dir = output_dir
        self.env_files = env_files


def _settings(args: argparse.Namespace) -> _Settings:
    if args.limit is not None and args.limit < 1:
        raise StravaError("limit must be >= 1")
    env_files = _env_paths()
    merged: dict[str, str] = {}
    for path in env_files:
        merged.update(_read_env_file(path))
    merged.update(os.environ)
    if args.client_id is not None:
        merged["STRAVA_CLIENT_ID"] = args.client_id
    if args.client_secret is not None:
        merged["STRAVA_CLIENT_SECRET"] = args.client_secret
    if args.refresh_token is not None:
        merged["STRAVA_REFRESH_TOKEN"] = args.refresh_token
    client_id = merged.get("STRAVA_CLIENT_ID", "").strip()
    client_secret = merged.get("STRAVA_CLIENT_SECRET", "").strip()
    refresh_token = merged.get("STRAVA_REFRESH_TOKEN", "").strip()
    if not client_id or not client_secret or not refresh_token:
        raise StravaError(
            "set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN"
        )
    output_dir = Path(args.output) if args.output is not None else Path("data/strava")
    return _Settings(
        client_id,
        client_secret,
        refresh_token,
        output_dir,
        env_files,
    )


def _env_paths() -> list[Path]:
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    cwd_env = Path.cwd() / ".env"
    paths: list[Path] = []
    if backend_env.is_file():
        paths.append(backend_env)
    if cwd_env.is_file() and cwd_env.resolve() != backend_env.resolve():
        paths.append(cwd_env)
    return paths


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


def _persist_refresh_token(paths: list[Path], refresh_token: str) -> None:
    updated = False
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if "STRAVA_REFRESH_TOKEN=" not in text:
            continue
        lines = []
        for raw_line in text.splitlines():
            stripped = raw_line.strip()
            prefix = ""
            body = stripped
            if body.startswith("export "):
                prefix = "export "
                body = body[len("export ") :].strip()
            if body.startswith("STRAVA_REFRESH_TOKEN="):
                lines.append(f"{prefix}STRAVA_REFRESH_TOKEN={refresh_token}")
                updated = True
            else:
                lines.append(raw_line)
        ending = "\n" if text.endswith("\n") or not text else ""
        path.write_text("\n".join(lines) + ending, encoding="utf-8")
    if not updated:
        print(
            "Strava issued a new refresh token. Update STRAVA_REFRESH_TOKEN.",
            file=sys.stderr,
        )


def _ride_path(output_dir: Path, activity_id: int) -> Path:
    if activity_id < 1:
        raise StravaError("Strava activity id is invalid")
    return output_dir / f"{activity_id}.json"


def _write_ride(path: Path, output_dir: Path, payload: dict[str, object]) -> None:
    destination = path.resolve()
    root = output_dir.resolve()
    if destination != root and root not in destination.parents:
        raise StravaError("refusing to write outside the data directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".json.part")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(destination)


def _is_ride(activity: dict[str, object]) -> bool:
    return _sport(activity) in _RIDE_SPORTS


def _sport(activity: dict[str, object]) -> str:
    sport = activity.get("sport_type") or activity.get("type") or ""
    return str(sport)


def _activity_id(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int | str):
        raise StravaError("Strava activity id is invalid")
    if isinstance(value, str) and not value.isdigit():
        raise StravaError("Strava activity id is invalid")
    activity_id = int(value)
    if activity_id < 1:
        raise StravaError("Strava activity id is invalid")
    return activity_id


def _json_object(response: httpx.Response, what: str) -> dict[str, object]:
    body = _json_value(response, what)
    if not isinstance(body, dict):
        raise StravaError(f"Strava {what} returned an unexpected payload")
    return body


def _json_value(response: httpx.Response, what: str) -> object:
    if response.is_error:
        raise StravaError(f"Strava {what} failed with HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise StravaError(
            f"Strava {what} returned non-JSON (HTTP {response.status_code})"
        ) from exc


def _normalize_streams(value: object) -> dict[str, object]:
    if value is None:
        return {}
    if isinstance(value, dict):
        if "message" in value and "time" not in value and "latlng" not in value:
            return {}
        return value
    if isinstance(value, list):
        streams: dict[str, object] = {}
        for item in value:
            if isinstance(item, dict) and isinstance(item.get("type"), str):
                streams[item["type"]] = item
        return streams
    raise StravaError("Strava streams returned an unexpected payload")


if __name__ == "__main__":
    raise SystemExit(main())
