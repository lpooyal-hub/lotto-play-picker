from __future__ import annotations

from datetime import datetime

from playwright.sync_api import Error, TimeoutError as PlaywrightTimeoutError, sync_playwright


RESULT_URL = "https://www.dhlottery.co.kr/lt645/result"


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y.%m.%d").date().isoformat()
    except ValueError:
        return None


def _parse_amount(value: str) -> int | None:
    digits = "".join(char for char in value if char.isdigit())
    return int(digits) if digits else None


def fetch_recent_draws_with_playwright() -> list[dict]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            locale="ko-KR",
            viewport={"width": 1440, "height": 1200},
        )

        try:
            page.goto(RESULT_URL, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector(".result-infoWrap", timeout=15000)

            cards = page.locator(".result-infoWrap")
            selected_draw_text = page.locator("#d-trigger_txt").first.inner_text(timeout=3000).strip().replace("회", "")
            selected_draw_no = int(selected_draw_text) if selected_draw_text.isdigit() else None

            prizes: dict[str, dict] = {}
            prize_rows = page.locator(".drawResult-tbl .tbody-tr .tbl-tr")
            for row_index in range(prize_rows.count()):
                row = prize_rows.nth(row_index)
                rank_text = row.locator(".td-rank").first.inner_text(timeout=3000).strip()
                if rank_text not in {"1등", "2등", "3등", "4등", "5등"}:
                    continue

                amount_text = row.locator(".perMoney").first.inner_text(timeout=3000).strip()
                prizes[rank_text] = {
                    "amount": _parse_amount(amount_text),
                    "amountText": amount_text,
                }

            draws: list[dict] = []

            for index in range(cards.count()):
                card = cards.nth(index)
                draw_no_text = card.locator(".color-g.ltEpsd").first.inner_text(timeout=3000).strip()
                if not draw_no_text.isdigit():
                    continue

                draw_no = int(draw_no_text)
                date_text = card.locator(".result-date").first.inner_text(timeout=3000).strip().replace(" 추첨", "")

                ball_nodes = card.locator(".result-ball")
                values = []
                for ball_index in range(ball_nodes.count()):
                    text = ball_nodes.nth(ball_index).inner_text(timeout=3000).strip()
                    if text.isdigit():
                        values.append(int(text))

                if len(values) < 7:
                    continue

                draws.append(
                    {
                        "drawNo": draw_no,
                        "numbers": sorted(values[:6]),
                        "bonus": values[6],
                        "drawDate": _normalize_draw_date(date_text),
                        "prizes": prizes if selected_draw_no == draw_no and prizes else None,
                    }
                )

            draws.sort(key=lambda draw: draw["drawNo"])
            return draws
        except (PlaywrightTimeoutError, Error):
            return []
        finally:
            browser.close()


def fetch_draw_with_playwright(draw_no: int) -> dict | None:
    for draw in fetch_recent_draws_with_playwright():
        if draw["drawNo"] == draw_no:
            return draw
    return None
