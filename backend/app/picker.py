from __future__ import annotations

from .lotto_model import LOTTO_MODEL_VERSION, generate_combinations
from .lotto_prizes import resolve_prize_amount

__all__ = ["LOTTO_MODEL_VERSION", "compare_pick_with_draw", "generate_combinations"]


def compare_pick_with_draw(pick: list[int], draw: dict) -> dict:
    match_count = len([number for number in pick if number in draw["numbers"]])
    bonus_matched = draw["bonus"] in pick

    rank = None
    if match_count == 6:
        rank = "1등"
    elif match_count == 5 and bonus_matched:
        rank = "2등"
    elif match_count == 5:
        rank = "3등"
    elif match_count == 4:
        rank = "4등"
    elif match_count == 3:
        rank = "5등"

    prize = None
    prizes = draw.get("prizes") or {}
    if rank:
        prize = prizes.get(rank, {}).get("amount")
    prize = resolve_prize_amount(rank, prize)

    return {
        "pick": pick,
        "matchCount": match_count,
        "bonusMatched": bonus_matched,
        "rank": rank,
        "prizeAmount": prize,
    }
