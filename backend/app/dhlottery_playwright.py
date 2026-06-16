from __future__ import annotations

from datetime import datetime

from playwright.sync_api import Error, TimeoutError as PlaywrightTimeoutError, sync_playwright


MAIN_URL = "https://www.dhlottery.co.kr/"


def _normalize_draw_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y.%m.%d").date().isoformat()
    except ValueError:
        return None


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
            page.goto(MAIN_URL, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector(".lt645-inbox[data-ltepsd]", timeout=15000)

            cards = page.locator(".lt645-inbox[data-ltepsd]")
            draws: list[dict] = []

            for index in range(cards.count()):
                card = cards.nth(index)
                draw_no_attr = card.get_attribute("data-ltepsd")
                if not draw_no_attr or not draw_no_attr.isdigit():
                    continue

                draw_no = int(draw_no_attr)
                date_text = card.locator(".lt645-date").first.inner_text(timeout=3000).strip()

                ball_nodes = card.locator(".lt645-list span.lt-ball")
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

