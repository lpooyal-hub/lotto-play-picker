from __future__ import annotations

FIXED_PRIZE_AMOUNTS = {
    "5등": 5_000,
}


def resolve_prize_amount(rank: str | None, prize_amount: int | str | None) -> int | None:
    try:
        stored_amount = int(prize_amount) if prize_amount is not None else 0
    except (TypeError, ValueError):
        stored_amount = 0

    if stored_amount > 0:
        return stored_amount
    return FIXED_PRIZE_AMOUNTS.get(rank)
