from __future__ import annotations

from datetime import datetime
from html import unescape
import re

import requests


RESULT_URL = "https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do"
RESULT_PAGE_URL = "https://www.dhlottery.co.kr/pt720/result"
REQUEST_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "X-Requested-With": "XMLHttpRequest",
}
HTML_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": REQUEST_HEADERS["User-Agent"],
}


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def _strip_tags(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def _extract_result_blocks(html: str) -> list[str]:
    return html.split('<div class="resultWrap')[1:]


def _parse_result_block(block: str) -> dict | None:
    draw_match = re.search(r"result-txt[\s\S]*?color-g[^>]*>\s*(\d+)\s*<", block)
    date_match = re.search(r"result-date[^>]*>\s*([^<]+)\s*<", block)
    number_box_match = re.search(r"result-numBox[\s\S]*?</div>", block)

    if not draw_match or not number_box_match:
        return None

    digit_matches = [
        int(match.group(1))
        for match in re.finditer(r'class="num[^"]*"[^>]*>\s*(\d)\s*<', number_box_match.group(0))
    ]
    if len(digit_matches) < 7:
        return None

    group, *digits = digit_matches
    if len(digits) != 6:
        return None

    return {
        "drawNo": int(draw_match.group(1)),
        "drawDate": _normalize_draw_date(_strip_tags(date_match.group(1) if date_match else "")),
        "group": str(group),
        "winningNumber": "".join(str(digit) for digit in digits),
        "digits": digits,
    }


def _fetch_recent_pension720_draws_from_html() -> list[dict]:
    response = requests.get(
        RESULT_PAGE_URL,
        headers=HTML_HEADERS,
        timeout=(10, 30),
    )
    response.raise_for_status()

    draws = [
        parsed
        for parsed in (_parse_result_block(block) for block in _extract_result_blocks(response.text))
        if parsed
    ]
    draws.sort(key=lambda draw: draw["drawNo"])
    if not draws:
        raise RuntimeError("Could not parse pension720 results page.")
    return draws


def fetch_recent_pension720_draws() -> list[dict]:
    last_request_error: Exception | None = None
    for _ in range(3):
        try:
            response = requests.get(
                RESULT_URL,
                headers=REQUEST_HEADERS,
                timeout=(10, 30),
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
            if draws:
                return draws
        except (requests.RequestException, ValueError) as exc:
            last_request_error = exc
            continue

    try:
        return _fetch_recent_pension720_draws_from_html()
    except Exception:
        if last_request_error:
            raise last_request_error
        raise
