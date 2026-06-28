from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests
from .dhlottery_playwright import fetch_draw_with_playwright

LOTTO_API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo="
FIRST_DRAW_DATE = datetime.fromisoformat("2002-12-07T00:00:00+09:00")

HEADERS = {
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "X-Requested-With": "XMLHttpRequest",
}


def estimate_latest_draw_no() -> int:
    now = datetime.now(timezone.utc)
    diff = now - FIRST_DRAW_DATE.astimezone(timezone.utc)
    return max(1, diff.days // 7 + 1)


def fetch_draw(draw_no: int) -> dict | None:
    response = requests.get(f"{LOTTO_API}{draw_no}", headers=HEADERS, timeout=10)
    response.raise_for_status()

    content_type = response.headers.get("content-type", "")
    if "json" not in content_type and not response.text.strip().startswith("{"):
        return None

    try:
        data = response.json()
    except ValueError:
        return None

    if data.get("returnValue") != "success":
        return None

    return {
        "drawNo": int(data["drwNo"]),
        "numbers": sorted(int(data[f"drwtNo{idx}"]) for idx in range(1, 7)),
        "bonus": int(data["bnusNo"]),
        "drawDate": data.get("drwNoDate"),
    }


def fetch_draw_with_fallback(draw_no: int) -> dict | None:
    try:
        draw = fetch_draw(draw_no)
        if draw:
            return draw
    except requests.RequestException:
        pass

    return fetch_draw_with_playwright(draw_no)


def find_latest_draw_no_from_known(known_draw_no: int) -> int:
    latest = known_draw_no
    candidate = known_draw_no + 1

    while True:
        try:
            draw = fetch_draw(candidate)
        except requests.RequestException:
            draw = None

        if not draw:
            return latest

        latest = candidate
        candidate += 1


def find_latest_draw_no() -> int:
    candidate = estimate_latest_draw_no()
    min_candidate = max(1, candidate - 20)

    while candidate >= min_candidate:
        try:
            draw = fetch_draw(candidate)
        except requests.RequestException:
            draw = None

        if draw:
            return candidate
        candidate -= 1

    raise RuntimeError("Could not determine latest lotto draw number from lotto API.")


def fetch_history() -> list[dict]:
    latest = find_latest_draw_no()
    draws: list[dict] = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_draw_with_fallback, draw_no): draw_no for draw_no in range(1, latest + 1)}
        for future in as_completed(futures):
            draw = future.result()
            if draw:
                draws.append(draw)

    draws.sort(key=lambda draw: draw["drawNo"])
    if not draws:
        raise RuntimeError("No lottery draw history could be fetched.")

    return draws
