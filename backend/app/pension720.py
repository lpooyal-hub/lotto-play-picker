from __future__ import annotations

from datetime import datetime

from playwright.sync_api import Error, TimeoutError as PlaywrightTimeoutError, sync_playwright


RESULT_URL = "https://www.dhlottery.co.kr/pt720/result"


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip().replace(" 추첨", "")
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y.%m.%d").date().isoformat()
    except ValueError:
        return None


def fetch_recent_pension720_draws() -> list[dict]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            locale="ko-KR",
            viewport={"width": 1440, "height": 1800},
        )

        try:
            page.goto(RESULT_URL, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector(".resultWrap", timeout=15000)

            cards = page.locator(".resultWrap")
            draws: list[dict] = []

            for index in range(cards.count()):
                card = cards.nth(index)
                draw_text = card.locator(".result-txt .color-g").first.inner_text(timeout=3000).strip()
                if not draw_text.isdigit():
                    continue

                draw_no = int(draw_text)
                date_text = card.locator(".result-date").first.inner_text(timeout=3000).strip()

                group_digit = card.locator(".result-numBox .num").nth(0).inner_text(timeout=3000).strip()
                digit_nodes = card.locator(".result-numBox .num")
                digits = []
                for digit_index in range(1, min(digit_nodes.count(), 7)):
                    text = digit_nodes.nth(digit_index).inner_text(timeout=3000).strip()
                    if text.isdigit():
                        digits.append(int(text))

                if not group_digit.isdigit() or len(digits) != 6:
                    continue

                draws.append(
                    {
                        "drawNo": draw_no,
                        "drawDate": _normalize_draw_date(date_text),
                        "group": group_digit,
                        "winningNumber": "".join(str(digit) for digit in digits),
                        "digits": digits,
                    }
                )

            draws.sort(key=lambda draw: draw["drawNo"])
            return draws
        except (PlaywrightTimeoutError, Error):
            return []
        finally:
            browser.close()

