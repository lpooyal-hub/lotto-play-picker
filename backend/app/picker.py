from __future__ import annotations

from itertools import combinations
from math import sqrt

MAX_NUMBER = 45
PICK_SIZE = 6


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def median(values: list[int]) -> float:
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def stdev(values: list[int]) -> float:
    avg = mean(values)
    variance = mean([(value - avg) ** 2 for value in values])
    return sqrt(variance) or 1


def count_values(values: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return counts


def normalize(scores: dict[int, float]) -> dict[int, float]:
    values = list(scores.values())
    low = min(values)
    high = max(values)
    span = max(high - low, 1e-9)
    return {key: (value - low) / span for key, value in scores.items()}


def build_number_scores(draws: list[dict]) -> dict:
    all_numbers = [number for draw in draws for number in draw["numbers"]]
    frequency = count_values(all_numbers)
    recent_cutoff = max(12, min(80, len(draws) // 8))
    recent_frequency = count_values([number for draw in draws[-recent_cutoff:] for number in draw["numbers"]])
    gaps: dict[int, int] = {}

    reversed_draws = list(reversed(draws))
    for number in range(1, MAX_NUMBER + 1):
        gap = next((idx + 1 for idx, draw in enumerate(reversed_draws) if number in draw["numbers"]), len(draws) + 1)
        gaps[number] = gap

    raw_frequency = {number: frequency.get(number, 0) for number in range(1, MAX_NUMBER + 1)}
    raw_recent = {number: recent_frequency.get(number, 0) for number in range(1, MAX_NUMBER + 1)}

    normalized_frequency = normalize(raw_frequency)
    normalized_recent = normalize(raw_recent)
    normalized_gap = normalize(gaps)
    normalized_cold = normalize({number: -value for number, value in raw_frequency.items()})

    scores = {
        number: normalized_frequency[number] * 0.34
        + normalized_recent[number] * 0.24
        + normalized_gap[number] * 0.24
        + normalized_cold[number] * 0.18
        for number in range(1, MAX_NUMBER + 1)
    }

    return {
        "scores": scores,
        "frequency": frequency,
        "recentFrequency": recent_frequency,
        "gaps": gaps,
    }


def build_pair_scores(draws: list[dict]) -> dict[str, float]:
    pairs: dict[str, int] = {}
    for draw in draws:
        for first, second in combinations(draw["numbers"], 2):
            key = f"{first}-{second}"
            pairs[key] = pairs.get(key, 0) + 1

    max_value = max(pairs.values() or [1])
    return {key: value / max_value for key, value in pairs.items()}


def count_consecutive_pairs(numbers: tuple[int, ...]) -> int:
    return sum(1 for idx in range(len(numbers) - 1) if numbers[idx + 1] - numbers[idx] == 1)


def combination_quality(
    numbers: tuple[int, ...],
    number_scores: dict[int, float],
    pair_scores: dict[str, float],
    historical_sums: list[int],
) -> float:
    odd_count = len([number for number in numbers if number % 2])
    low_count = len([number for number in numbers if number <= 22])
    total_sum = sum(numbers)
    median_sum = median(historical_sums)
    sum_stdev = stdev(historical_sums)
    sum_score = max(0, 1 - abs(total_sum - median_sum) / (sum_stdev * 2.2))
    base_score = mean([number_scores.get(number, 0) for number in numbers])
    pair_values = [pair_scores.get(f"{first}-{second}", 0) for first, second in combinations(numbers, 2)]

    balance_score = 1
    if odd_count not in [2, 3, 4]:
        balance_score -= 0.25
    if low_count not in [2, 3, 4]:
        balance_score -= 0.2

    last_digit_penalty = (PICK_SIZE - len({number % 10 for number in numbers})) * 0.03
    consecutive_penalty = count_consecutive_pairs(numbers) * 0.08

    return (
        base_score * 0.48
        + mean(pair_values) * 0.16
        + sum_score * 0.2
        + balance_score * 0.16
        - consecutive_penalty
        - last_digit_penalty
    )


def sorted_numbers(metric: dict[int, float], reverse: bool = True) -> list[int]:
    return sorted(range(1, MAX_NUMBER + 1), key=lambda number: (metric.get(number, 0), -number), reverse=reverse)


def build_candidate_pool(stats: dict) -> list[int]:
    pool = set()
    pool.update(sorted_numbers(stats["scores"])[:18])
    pool.update(sorted_numbers(stats["frequency"])[:10])
    pool.update(sorted_numbers(stats["frequency"], reverse=False)[:10])
    pool.update(sorted_numbers(stats["recentFrequency"])[:8])
    pool.update(sorted_numbers(stats["gaps"])[:8])
    return sorted(pool)[:28]


def generate_combinations(draws: list[dict], count: int = 5) -> list[list[int]]:
    stats = build_number_scores(draws)
    pair_scores = build_pair_scores(draws)
    historical_sums = [sum(draw["numbers"]) for draw in draws]
    historical_sets = {",".join(map(str, draw["numbers"])) for draw in draws}
    pool = build_candidate_pool(stats)
    candidates = []

    for combo in combinations(pool, PICK_SIZE):
        key = ",".join(map(str, combo))
        if key in historical_sets:
            continue
        candidates.append(
            {
                "combo": list(combo),
                "quality": combination_quality(combo, stats["scores"], pair_scores, historical_sums),
            }
        )

    candidates.sort(key=lambda candidate: candidate["quality"], reverse=True)
    return [candidate["combo"] for candidate in candidates[:count]]


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

    return {
        "pick": pick,
        "matchCount": match_count,
        "bonusMatched": bonus_matched,
        "rank": rank,
        "prizeAmount": prize,
    }
