from __future__ import annotations

from .dhlottery import fetch_draw, fetch_draw_with_fallback, fetch_history, find_latest_draw_no
from .picker import compare_pick_with_draw, generate_combinations
from .store import (
    assert_enough_draws,
    fetch_latest_stored_draw,
    fetch_prediction_by_draw,
    fetch_stored_draws,
    fetch_unchecked_predictions,
    insert_prediction,
    save_draws,
    update_prediction_result,
)


def sync_draws() -> dict:
    latest_stored_draw = fetch_latest_stored_draw()
    if not latest_stored_draw:
        draws = fetch_history()
        saved = save_draws(draws)
        return {
            "synced": len(saved),
            "firstDraw": saved[0]["drawNo"] if saved else None,
            "latestDraw": saved[-1]["drawNo"] if saved else None,
        }

    latest_stored_draw_no = latest_stored_draw["drawNo"]
    latest_live_draw_no = find_latest_draw_no()
    missing_draws = []

    for draw_no in range(latest_stored_draw_no + 1, latest_live_draw_no + 1):
        draw = fetch_draw_with_fallback(draw_no)
        if draw:
            missing_draws.append(draw)

    saved = save_draws(missing_draws) if missing_draws else []
    return {
        "synced": len(saved),
        "firstDraw": missing_draws[0]["drawNo"] if missing_draws else None,
        "latestDraw": missing_draws[-1]["drawNo"] if missing_draws else latest_stored_draw_no,
    }


def load_analysis_draws() -> list[dict]:
    draws = fetch_stored_draws()
    if draws:
        assert_enough_draws(draws)
        return draws

    draws = fetch_history()
    save_draws(draws)
    return draws


def generate_weekly_prediction() -> dict:
    latest_stored_draw = fetch_latest_stored_draw()
    latest_draw_no = latest_stored_draw["drawNo"] if latest_stored_draw else find_latest_draw_no()
    target_draw_no = latest_draw_no + 1
    existing = fetch_prediction_by_draw(target_draw_no)
    if existing:
        return existing

    draws = load_analysis_draws()
    picks = generate_combinations(draws, count=5)
    return insert_prediction(target_draw_no, picks)


def check_prediction_results() -> list[dict]:
    latest_stored_draw = fetch_latest_stored_draw()
    latest_draw_no = latest_stored_draw["drawNo"] if latest_stored_draw else find_latest_draw_no()
    stored_draws = fetch_stored_draws()
    checked = []

    for prediction in fetch_unchecked_predictions(latest_draw_no):
        draw = next((item for item in stored_draws if item["drawNo"] == prediction["target_draw_no"]), None)
        if not draw:
            draw = fetch_draw_with_fallback(prediction["target_draw_no"])
        if not draw:
            continue

        match_results = [compare_pick_with_draw(pick, draw) for pick in prediction["picks"]]
        checked.append(update_prediction_result(prediction["id"], draw, match_results))

    return checked


def run_weekly_maintenance() -> dict:
    sync_result = sync_draws()
    checked = check_prediction_results()
    prediction = generate_weekly_prediction()

    return {
        "sync": sync_result,
        "checkedCount": len(checked),
        "prediction": prediction,
    }
