from __future__ import annotations

from itertools import combinations
from math import exp, sqrt

MAX_NUMBER = 45
PICK_SIZE = 6
CANDIDATE_POOL_SIZE = 28
SHORTLIST_SIZE = 700
BASE_NUMBER_RATE = PICK_SIZE / MAX_NUMBER
BASE_PAIR_RATE = (PICK_SIZE * (PICK_SIZE - 1)) / (MAX_NUMBER * (MAX_NUMBER - 1))
LOTTO_MODEL_VERSION = "2.0"


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def stdev(values: list[float]) -> float:
    average = mean(values)
    variance = mean([(value - average) ** 2 for value in values])
    return sqrt(variance) or 1


def rank_normalize(metric: dict) -> dict:
    entries = sorted(metric.items(), key=lambda item: (item[1], item[0]))
    divisor = max(len(entries) - 1, 1)
    normalized = {}
    start = 0
    while start < len(entries):
        end = start
        while end + 1 < len(entries) and entries[end + 1][1] == entries[start][1]:
            end += 1
        average_rank = (start + end) / 2 / divisor
        for index in range(start, end + 1):
            normalized[entries[index][0]] = average_rank
        start = end + 1
    return normalized


def canonical_draws(draws: list[dict]) -> list[dict]:
    normalized = []
    for draw in draws or []:
        try:
            draw_no = int(draw["drawNo"])
            numbers = sorted({int(number) for number in draw.get("numbers", [])})
        except (KeyError, TypeError, ValueError):
            continue

        if len(numbers) != PICK_SIZE or any(number < 1 or number > MAX_NUMBER for number in numbers):
            continue
        normalized.append({"drawNo": draw_no, "numbers": numbers})

    normalized.sort(key=lambda draw: draw["drawNo"])
    if not normalized:
        raise RuntimeError("No valid lotto draw history available.")
    return normalized


def build_weighted_number_rates(draws: list[dict], half_life: float | None, prior_strength: float) -> dict[int, float]:
    counts = {number: 0.0 for number in range(1, MAX_NUMBER + 1)}
    total_weight = 0.0

    for index, draw in enumerate(draws):
        age = len(draws) - index - 1
        weight = 1.0 if half_life is None else 2 ** (-age / half_life)
        total_weight += weight
        for number in draw["numbers"]:
            counts[number] += weight

    return {
        number: (count + prior_strength * BASE_NUMBER_RATE) / (total_weight + prior_strength)
        for number, count in counts.items()
    }


def build_number_model(draws: list[dict]) -> dict:
    all_time_rates = build_weighted_number_rates(draws, None, 24)
    medium_rates = build_weighted_number_rates(draws, 104, 16)
    recent_rates = build_weighted_number_rates(draws, 36, 12)
    reversed_draws = list(reversed(draws))
    gaps = {}

    for number in range(1, MAX_NUMBER + 1):
        gap = next((index + 1 for index, draw in enumerate(reversed_draws) if number in draw["numbers"]), len(draws) + 1)
        gaps[number] = min(gap, 24)

    long_rank = rank_normalize(all_time_rates)
    medium_rank = rank_normalize(medium_rates)
    recent_rank = rank_normalize(recent_rates)
    gap_rank = rank_normalize(gaps)
    scores = {
        number: long_rank[number] * 0.3
        + medium_rank[number] * 0.24
        + recent_rank[number] * 0.39
        + gap_rank[number] * 0.07
        for number in range(1, MAX_NUMBER + 1)
    }

    return {
        "scores": scores,
        "allTimeRates": all_time_rates,
        "mediumRates": medium_rates,
        "recentRates": recent_rates,
        "gaps": gaps,
    }


def pair_key(first: int, second: int) -> str:
    return f"{min(first, second)}-{max(first, second)}"


def build_pair_scores(draws: list[dict]) -> dict[str, float]:
    long_counts = {pair_key(first, second): 0.0 for first in range(1, MAX_NUMBER + 1) for second in range(first + 1, MAX_NUMBER + 1)}
    recent_counts = {key: 0.0 for key in long_counts}
    recent_weight_total = 0.0

    for index, draw in enumerate(draws):
        age = len(draws) - index - 1
        recent_weight = 2 ** (-age / 52)
        recent_weight_total += recent_weight
        for first, second in combinations(draw["numbers"], 2):
            key = pair_key(first, second)
            long_counts[key] += 1
            recent_counts[key] += recent_weight

    blended = {}
    for key in long_counts:
        long_rate = (long_counts[key] + 30 * BASE_PAIR_RATE) / (len(draws) + 30)
        recent_rate = (recent_counts[key] + 18 * BASE_PAIR_RATE) / (recent_weight_total + 18)
        blended[key] = long_rate * 0.42 + recent_rate * 0.58
    return rank_normalize(blended)


def build_histogram(values: list[int]) -> dict[int, float]:
    counts: dict[int, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    maximum = max(counts.values() or [1])
    return {key: (count + 1) / (maximum + 1) for key, count in counts.items()}


def count_consecutive_pairs(numbers: list[int] | tuple[int, ...]) -> int:
    return sum(1 for index in range(len(numbers) - 1) if numbers[index + 1] - numbers[index] == 1)


def build_shape_model(draws: list[dict]) -> dict:
    sums = [sum(draw["numbers"]) for draw in draws]
    spreads = [draw["numbers"][-1] - draw["numbers"][0] for draw in draws]
    return {
        "sumMean": mean(sums),
        "sumStdev": stdev(sums),
        "spreadMean": mean(spreads),
        "spreadStdev": stdev(spreads),
        "odd": build_histogram([len([number for number in draw["numbers"] if number % 2]) for draw in draws]),
        "low": build_histogram([len([number for number in draw["numbers"] if number <= 22]) for draw in draws]),
        "consecutive": build_histogram([count_consecutive_pairs(draw["numbers"]) for draw in draws]),
        "lastDigits": build_histogram([len({number % 10 for number in draw["numbers"]}) for draw in draws]),
    }


def bell_score(value: float, average: float, deviation: float) -> float:
    z_score = (value - average) / deviation
    return exp(-0.5 * z_score ** 2)


def combination_quality(numbers: tuple[int, ...], number_scores: dict[int, float], pair_scores: dict[str, float], shape_model: dict) -> float:
    pair_values = [pair_scores.get(pair_key(first, second), 0) for first, second in combinations(numbers, 2)]
    total = sum(numbers)
    odd_count = len([number for number in numbers if number % 2])
    low_count = len([number for number in numbers if number <= 22])
    spread = numbers[-1] - numbers[0]
    consecutive_count = count_consecutive_pairs(numbers)
    unique_last_digits = len({number % 10 for number in numbers})

    return (
        mean([number_scores.get(number, 0) for number in numbers]) * 0.34
        + mean(pair_values) * 0.12
        + bell_score(total, shape_model["sumMean"], shape_model["sumStdev"]) * 0.18
        + shape_model["odd"].get(odd_count, 0) * 0.09
        + shape_model["low"].get(low_count, 0) * 0.09
        + bell_score(spread, shape_model["spreadMean"], shape_model["spreadStdev"]) * 0.1
        + shape_model["consecutive"].get(consecutive_count, 0) * 0.05
        + shape_model["lastDigits"].get(unique_last_digits, 0) * 0.03
    )


def numbers_by_metric(metric: dict[int, float], reverse: bool = True) -> list[int]:
    if reverse:
        return sorted(range(1, MAX_NUMBER + 1), key=lambda number: (-metric.get(number, 0), number))
    return sorted(range(1, MAX_NUMBER + 1), key=lambda number: (metric.get(number, 0), number))


def build_candidate_pool(number_model: dict) -> list[int]:
    rankings = [
        numbers_by_metric(number_model["scores"]),
        numbers_by_metric(number_model["recentRates"]),
        numbers_by_metric(number_model["mediumRates"]),
        numbers_by_metric(number_model["allTimeRates"]),
        numbers_by_metric(number_model["gaps"]),
        numbers_by_metric(number_model["allTimeRates"], reverse=False),
    ]
    pool: set[int] = set()

    for rank in range(MAX_NUMBER):
        for ranking in rankings:
            pool.add(ranking[rank])
            if len(pool) == CANDIDATE_POOL_SIZE:
                return sorted(pool)
    return sorted(pool)


def build_shortlist(pool: list[int], historical_sets: set[str], number_scores: dict[int, float], pair_scores: dict[str, float], shape_model: dict) -> list[dict]:
    shortlist = []
    for combo in combinations(pool, PICK_SIZE):
        key = ",".join(map(str, combo))
        if key in historical_sets:
            continue
        shortlist.append({"combo": list(combo), "quality": combination_quality(combo, number_scores, pair_scores, shape_model)})
        if len(shortlist) >= SHORTLIST_SIZE * 2:
            shortlist.sort(key=lambda candidate: (-candidate["quality"], candidate["combo"]))
            del shortlist[SHORTLIST_SIZE:]

    shortlist.sort(key=lambda candidate: (-candidate["quality"], candidate["combo"]))
    return shortlist[:SHORTLIST_SIZE]


def diversity_penalty(combo: list[int], selected: list[list[int]], usage: dict[int, int]) -> float:
    combo_set = set(combo)
    overlap_penalty = 0.0
    for pick in selected:
        overlap = len(combo_set.intersection(pick))
        similarity_penalty = 0.24 + (overlap - 4) * 0.18 if overlap >= 4 else overlap ** 2 * 0.009
        overlap_penalty = max(overlap_penalty, similarity_penalty)
    reuse_penalty = mean([usage.get(number, 0) for number in combo]) * 0.018
    return overlap_penalty + reuse_penalty


def select_diversified(shortlist: list[dict], count: int) -> list[list[int]]:
    selected: list[list[int]] = []
    usage: dict[int, int] = {}
    remaining = list(shortlist)

    while len(selected) < count and remaining:
        best_index = max(
            range(len(remaining)),
            key=lambda index: (
                remaining[index]["quality"] - diversity_penalty(remaining[index]["combo"], selected, usage),
                [-number for number in remaining[index]["combo"]],
            ),
        )
        picked = remaining.pop(best_index)["combo"]
        selected.append(picked)
        for number in picked:
            usage[number] = usage.get(number, 0) + 1
    return selected


def generate_combinations(draws: list[dict], count: int = 5) -> list[list[int]]:
    history = canonical_draws(draws)
    number_model = build_number_model(history)
    pair_scores = build_pair_scores(history)
    shape_model = build_shape_model(history)
    pool = build_candidate_pool(number_model)
    historical_sets = {",".join(map(str, draw["numbers"])) for draw in history}
    shortlist = build_shortlist(pool, historical_sets, number_model["scores"], pair_scores, shape_model)
    return select_diversified(shortlist, max(1, min(int(count or 5), 20)))
