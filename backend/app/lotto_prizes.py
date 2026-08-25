from __future__ import annotations

FIXED_PRIZE_AMOUNTS = {
    "4등": 50_000,
    "5등": 5_000,
}

VARIABLE_PRIZE_RANKS = frozenset({"1등", "2등", "3등"})


def resolve_prize_amount(rank: str | None, prize_amount: int | str | None) -> int | None:
    try:
        stored_amount = int(prize_amount) if prize_amount is not None else 0
    except (TypeError, ValueError):
        stored_amount = 0

    if stored_amount > 0:
        return stored_amount
    return FIXED_PRIZE_AMOUNTS.get(rank)


def normalize_match_results(match_results: list[dict] | None) -> list[dict]:
    normalized = []
    for result in match_results or []:
        if not isinstance(result, dict):
            normalized.append(result)
            continue
        normalized.append(
            {
                **result,
                "prizeAmount": resolve_prize_amount(result.get("rank"), result.get("prizeAmount")),
            }
        )
    return normalized


def has_unresolved_variable_prize(match_results: list[dict]) -> bool:
    return any(
        result.get("rank") in VARIABLE_PRIZE_RANKS
        and resolve_prize_amount(result.get("rank"), result.get("prizeAmount")) is None
        for result in match_results
        if isinstance(result, dict)
    )
