from __future__ import annotations

from datetime import datetime, timezone

import requests

from .config import settings

MIN_ANALYSIS_DRAWS = 100
SUPABASE_PAGE_SIZE = 1000


def _headers() -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError("Missing Supabase environment variables.")

    return {
        "apikey": settings.supabase_key,
        "Authorization": f"Bearer {settings.supabase_key}",
        "Content-Type": "application/json",
    }


def _url(path: str) -> str:
    return f"{settings.supabase_url}/rest/v1/{path}"


def _request(method: str, path: str, headers: dict | None = None, **kwargs):
    request_headers = headers or _headers()
    response = requests.request(method, _url(path), headers=request_headers, timeout=30, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase request failed: {response.status_code} {response.text[:300]}")
    if not response.text.strip():
        return None
    return response.json()


def _fetch_all(path: str, page_size: int = SUPABASE_PAGE_SIZE) -> list[dict]:
    offset = 0
    rows: list[dict] = []

    while True:
        batch = _request("GET", f"{path}&limit={page_size}&offset={offset}") or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    return rows


def normalize_draw(row: dict) -> dict:
    return {
        "drawNo": int(row["draw_no"]),
        "numbers": row["numbers"],
        "bonus": int(row["bonus_number"]),
        "drawDate": row.get("draw_date"),
    }


def fetch_stored_draws() -> list[dict]:
    rows = _fetch_all("lotto_draws?select=*&order=draw_no.asc")
    return [normalize_draw(row) for row in rows]


def fetch_latest_stored_draw() -> dict | None:
    rows = _request("GET", "lotto_draws?select=*&order=draw_no.desc&limit=1") or []
    return normalize_draw(rows[0]) if rows else None


def save_draws(draws: list[dict]) -> list[dict]:
    if not draws:
        return []

    rows = [
        {
            "draw_no": draw["drawNo"],
            "numbers": draw["numbers"],
            "bonus_number": draw["bonus"],
            "draw_date": draw.get("drawDate"),
        }
        for draw in draws
    ]

    response = requests.post(
        _url("lotto_draws?on_conflict=draw_no"),
        headers={**_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        json=rows,
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase draw upsert failed: {response.status_code} {response.text[:300]}")

    return [normalize_draw(row) for row in response.json()]


def assert_enough_draws(draws: list[dict]) -> None:
    if len(draws) < MIN_ANALYSIS_DRAWS:
        raise RuntimeError(
            f"Not enough cached lotto draw history. Need at least {MIN_ANALYSIS_DRAWS} draws, found {len(draws)}."
        )


def fetch_predictions(limit: int = 20) -> list[dict]:
    return _request("GET", f"lotto_predictions?select=*&order=target_draw_no.desc&limit={limit}") or []


def fetch_prediction_by_draw(target_draw_no: int) -> dict | None:
    rows = _request("GET", f"lotto_predictions?select=*&target_draw_no=eq.{target_draw_no}&limit=1") or []
    return rows[0] if rows else None


def insert_prediction(target_draw_no: int, picks: list[list[int]]) -> dict:
    rows = _request(
        "POST",
        "lotto_predictions?select=*",
        headers={**_headers(), "Prefer": "return=representation"},
        json={"target_draw_no": target_draw_no, "picks": picks},
    )
    return rows[0]


def fetch_unchecked_predictions(latest_draw_no: int) -> list[dict]:
    return (
        _request(
            "GET",
            f"lotto_predictions?select=*&target_draw_no=lte.{latest_draw_no}&checked_at=is.null&order=target_draw_no.asc",
        )
        or []
    )


def update_prediction_result(prediction_id: str, draw: dict, match_results: list[dict]) -> dict:
    rows = _request(
        "PATCH",
        f"lotto_predictions?id=eq.{prediction_id}&select=*",
        headers={**_headers(), "Prefer": "return=representation"},
        json={
            "winning_numbers": draw["numbers"],
            "bonus_number": draw["bonus"],
            "match_results": match_results,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return rows[0]
