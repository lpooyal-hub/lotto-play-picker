from __future__ import annotations

from datetime import datetime

import requests


RESULT_URL = "https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do"


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def fetch_recent_pension720_draws() -> list[dict]:
    response = requests.get(
        RESULT_URL,
        headers={
            "Accept": "application/json, text/plain, */*",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data", {}).get("result", [])

    draws: list[dict] = []
    for row in rows:
        draw_no = row.get("psltEpsd")
        group = str(row.get("wnBndNo", "")).strip()
        winning_number = str(row.get("wnRnkVl", "")).strip().zfill(6)

        if not draw_no or not group.isdigit() or len(winning_number) != 6 or not winning_number.isdigit():
            continue

        draws.append(
            {
                "drawNo": int(draw_no),
                "drawDate": _normalize_draw_date(str(row.get("psltRflYmd", "")).strip()),
                "group": group,
                "winningNumber": winning_number,
                "digits": [int(char) for char in winning_number],
            }
        )

    draws.sort(key=lambda draw: draw["drawNo"])
    return draws
