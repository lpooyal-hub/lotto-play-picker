from __future__ import annotations

from .pension720 import fetch_recent_pension720_draws
from .dhlottery import fetch_draw, fetch_draw_with_fallback, fetch_history, find_latest_draw_no
from .picker import (
    compare_pick_with_draw,
    compare_pension720_pick_with_draw,
    generate_combinations,
    generate_pension720_predictions,
)
from .store import (
    assert_enough_draws,
    fetch_latest_stored_draw,
    fetch_latest_pension720_draw,
    fetch_prediction_by_draw,
    fetch_pension720_prediction_by_draw,
    fetch_pension720_predictions,
    fetch_recent_pension720_prediction_picks,
    fetch_pension720_draws,
    fetch_stored_draws,
    fetch_unchecked_pension720_predictions,
    fetch_unchecked_predictions,
    insert_prediction,
    insert_pension720_prediction,
    save_pension720_draws,
    save_draws,
    update_pension720_prediction_result,
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
        cached_draw = next((item for item in stored_draws if item["drawNo"] == prediction["target_draw_no"]), None)
        live_draw = fetch_draw_with_fallback(prediction["target_draw_no"])
        draw = live_draw or cached_draw
        if not draw:
            continue

        match_results = [compare_pick_with_draw(pick, draw) for pick in prediction["picks"]]
        checked.append(update_prediction_result(prediction["id"], draw, match_results))

    return checked


def run_weekly_maintenance() -> dict:
    lotto_result = run_lotto_maintenance()
    pension720_result = run_pension720_maintenance()

    return {
        **lotto_result,
        **pension720_result,
    }


def run_lotto_maintenance() -> dict:
    sync_result = sync_draws()
    checked = check_prediction_results()
    prediction = generate_weekly_prediction()

    return {
        "sync": sync_result,
        "checkedCount": len(checked),
        "prediction": prediction,
    }


def ensure_lotto_current() -> dict:
    latest_stored_draw = fetch_latest_stored_draw()
    latest_live_draw_no = find_latest_draw_no()
    latest_stored_draw_no = latest_stored_draw["drawNo"] if latest_stored_draw else 0
    target_draw_no = latest_live_draw_no + 1
    existing_prediction = fetch_prediction_by_draw(target_draw_no)
    unchecked_predictions = fetch_unchecked_predictions(latest_live_draw_no)

    maintenance_needed = (
        latest_stored_draw_no < latest_live_draw_no
        or existing_prediction is None
        or bool(unchecked_predictions)
    )

    if not maintenance_needed:
        return {
            "ok": True,
            "needed": False,
            "latestStoredDraw": latest_stored_draw_no,
            "latestLiveDraw": latest_live_draw_no,
            "targetDraw": target_draw_no,
        }

    result = run_lotto_maintenance()
    return {
        "ok": True,
        "needed": True,
        "latestStoredDraw": latest_stored_draw_no,
        "latestLiveDraw": latest_live_draw_no,
        "targetDraw": target_draw_no,
        **result,
    }


def sync_pension720_draws() -> dict:
    existing_latest = fetch_latest_pension720_draw()
    recent_draws = fetch_recent_pension720_draws()
    if not recent_draws:
        return {"synced": 0, "latestDraw": existing_latest["drawNo"] if existing_latest else None}

    if not existing_latest:
        saved = save_pension720_draws(recent_draws)
        return {
            "synced": len(saved),
            "firstDraw": saved[0]["drawNo"] if saved else None,
            "latestDraw": saved[-1]["drawNo"] if saved else None,
        }

    missing = [draw for draw in recent_draws if draw["drawNo"] > existing_latest["drawNo"]]
    saved = save_pension720_draws(missing) if missing else []
    return {
        "synced": len(saved),
        "firstDraw": saved[0]["drawNo"] if saved else None,
        "latestDraw": saved[-1]["drawNo"] if saved else existing_latest["drawNo"],
    }


def run_pension720_maintenance() -> dict:
    pension720_sync_result = sync_pension720_draws()
    pension720_checked = check_pension720_prediction_results()
    pension720_prediction = generate_weekly_pension720_prediction()

    return {
        "pension720Sync": pension720_sync_result,
        "pension720CheckedCount": len(pension720_checked),
        "pension720Prediction": pension720_prediction,
    }


def ensure_pension720_current() -> dict:
    latest_stored_draw = fetch_latest_pension720_draw()
    recent_draws = fetch_recent_pension720_draws()
    latest_live_draw_no = recent_draws[-1]["drawNo"] if recent_draws else (latest_stored_draw["drawNo"] if latest_stored_draw else 0)
    latest_stored_draw_no = latest_stored_draw["drawNo"] if latest_stored_draw else 0
    target_draw_no = latest_live_draw_no + 1
    existing_prediction = fetch_pension720_prediction_by_draw(target_draw_no)
    unchecked_predictions = fetch_unchecked_pension720_predictions(latest_live_draw_no)

    maintenance_needed = (
        latest_stored_draw_no < latest_live_draw_no
        or existing_prediction is None
        or bool(unchecked_predictions)
    )

    if not maintenance_needed:
        return {
            "ok": True,
            "needed": False,
            "latestStoredDraw": latest_stored_draw_no,
            "latestLiveDraw": latest_live_draw_no,
            "targetDraw": target_draw_no,
        }

    result = run_pension720_maintenance()
    return {
        "ok": True,
        "needed": True,
        "latestStoredDraw": latest_stored_draw_no,
        "latestLiveDraw": latest_live_draw_no,
        "targetDraw": target_draw_no,
        **result,
    }


def generate_weekly_pension720_prediction() -> dict:
    latest_stored_draw = fetch_latest_pension720_draw()
    if not latest_stored_draw:
        raise RuntimeError("No stored pension720 draws available.")

    target_draw_no = latest_stored_draw["drawNo"] + 1
    existing = fetch_pension720_prediction_by_draw(target_draw_no)
    if existing:
        return existing

    draws = fetch_pension720_draws()
    recent_prediction_rows = fetch_recent_pension720_prediction_picks(limit=2)
    recent_prediction_picks = [
        pick
        for row in recent_prediction_rows
        for pick in row.get("picks", [])
        if isinstance(pick, dict) and pick.get("group") and pick.get("number") and pick.get("digits")
    ]
    picks = generate_pension720_predictions(draws, count=5, recent_prediction_picks=recent_prediction_picks)
    return insert_pension720_prediction(target_draw_no, picks)


def check_pension720_prediction_results() -> list[dict]:
    latest_stored_draw = fetch_latest_pension720_draw()
    if not latest_stored_draw:
        return []

    latest_draw_no = latest_stored_draw["drawNo"]
    stored_draws = fetch_pension720_draws()
    checked = []

    for prediction in fetch_unchecked_pension720_predictions(latest_draw_no):
        draw = next((item for item in stored_draws if item["drawNo"] == prediction["target_draw_no"]), None)
        if not draw:
            continue

        match_results = [compare_pension720_pick_with_draw(pick, draw) for pick in prediction["picks"]]
        checked.append(update_pension720_prediction_result(prediction["id"], draw, match_results))

    return checked
