from __future__ import annotations

from datetime import datetime

import requests
from bs4 import BeautifulSoup

from .pension720_playwright import fetch_recent_pension720_draws_with_playwright


RESULT_PAGE_URL = "https://www.dhlottery.co.kr/pt720/result"
HTML_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
}


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y%m%d").date().isoformat()
    except ValueError:
        try:
            return datetime.strptime(value, "%Y.%m.%d").date().isoformat()
        except ValueError:
            return None


def _fetch_recent_pension720_draws_from_html() -> list[dict]:
    response = requests.get(
        RESULT_PAGE_URL,
        headers=HTML_HEADERS,
        timeout=(10, 30),
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    draws: list[dict] = []

    for wrap in soup.select(".resultWrap"):
        result_txt = wrap.select_one(".result-txt .color-g")
        result_date = wrap.select_one(".result-date")
        num_nodes = wrap.select(".result-numBox .num")

        draw_text = result_txt.get_text(strip=True) if result_txt else ""
        draw_no = int(draw_text) if draw_text.isdigit() else None
        if not draw_no:
            continue

        digits = []
        for node in num_nodes:
            value = node.get_text(strip=True)
            if value.isdigit():
                digits.append(int(value))

        if len(digits) < 7:
            continue

        group, *winning_digits = digits[:7]
        if len(winning_digits) != 6:
            continue

        draws.append(
            {
                "drawNo": draw_no,
                "drawDate": _normalize_draw_date(result_date.get_text(" ", strip=True) if result_date else ""),
                "group": str(group),
                "winningNumber": "".join(str(digit) for digit in winning_digits),
                "digits": winning_digits,
            }
        )

    draws.sort(key=lambda draw: draw["drawNo"])
    if not draws:
        raise RuntimeError("Could not parse pension720 results page.")
    return draws


def fetch_recent_pension720_draws() -> list[dict]:
    last_request_error: Exception | None = None
    try:
        return _fetch_recent_pension720_draws_from_html()
    except Exception as exc:
        last_request_error = exc
        draws = fetch_recent_pension720_draws_with_playwright()
        if draws:
            return draws
        if last_request_error:
            raise last_request_error
        raise
