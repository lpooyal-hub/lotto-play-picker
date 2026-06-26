from __future__ import annotations

from itertools import combinations
from math import sqrt

MAX_NUMBER = 45
PICK_SIZE = 6
PENSION720_DIGIT_COUNT = 6
PENSION720_GROUPS = ["1", "2", "3", "4", "5"]


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


def normalize_generic(scores: dict) -> dict:
    values = list(scores.values())
    low = min(values)
    high = max(values)
    span = max(high - low, 1e-9)
    return {key: (value - low) / span for key, value in scores.items()}


def build_pension720_group_scores(draws: list[dict]) -> dict:
    groups = [str(draw["group"]) for draw in draws]
    frequency: dict[str, int] = {}
    for group in groups:
        frequency[group] = frequency.get(group, 0) + 1

    recent_cutoff = max(10, min(48, len(draws) // 6))
    recent_frequency: dict[str, int] = {}
    for draw in draws[-recent_cutoff:]:
        group = str(draw["group"])
        recent_frequency[group] = recent_frequency.get(group, 0) + 1

    reversed_draws = list(reversed(draws))
    gaps: dict[str, int] = {}
    for group in PENSION720_GROUPS:
        gap = next((idx + 1 for idx, draw in enumerate(reversed_draws) if str(draw["group"]) == group), len(draws) + 1)
        gaps[group] = gap

    raw_frequency = {group: frequency.get(group, 0) for group in PENSION720_GROUPS}
    raw_recent = {group: recent_frequency.get(group, 0) for group in PENSION720_GROUPS}
    normalized_frequency = normalize_generic(raw_frequency)
    normalized_recent = normalize_generic(raw_recent)
    normalized_gap = normalize_generic(gaps)
    normalized_cold = normalize_generic({group: -value for group, value in raw_frequency.items()})

    scores = {
        group: normalized_frequency[group] * 0.34
        + normalized_recent[group] * 0.2
        + normalized_gap[group] * 0.26
        + normalized_cold[group] * 0.2
        for group in PENSION720_GROUPS
    }

    return {
        "scores": scores,
        "frequency": frequency,
    }


def build_pension720_position_digit_scores(draws: list[dict]) -> list[dict]:
    position_stats: list[dict] = []
    reversed_draws = list(reversed(draws))

    for position in range(PENSION720_DIGIT_COUNT):
        frequency: dict[int, int] = {}
        for draw in draws:
            digit = int(draw["digits"][position])
            frequency[digit] = frequency.get(digit, 0) + 1

        recent_cutoff = max(12, min(60, len(draws) // 5))
        recent_frequency: dict[int, int] = {}
        for draw in draws[-recent_cutoff:]:
            digit = int(draw["digits"][position])
            recent_frequency[digit] = recent_frequency.get(digit, 0) + 1

        gaps: dict[int, int] = {}
        for digit in range(10):
            gap = next(
                (idx + 1 for idx, draw in enumerate(reversed_draws) if int(draw["digits"][position]) == digit),
                len(draws) + 1,
            )
            gaps[digit] = gap

        raw_frequency = {digit: frequency.get(digit, 0) for digit in range(10)}
        raw_recent = {digit: recent_frequency.get(digit, 0) for digit in range(10)}
        normalized_frequency = normalize_generic(raw_frequency)
        normalized_recent = normalize_generic(raw_recent)
        normalized_gap = normalize_generic(gaps)
        normalized_cold = normalize_generic({digit: -value for digit, value in raw_frequency.items()})

        scores = {
            digit: normalized_frequency[digit] * 0.33
            + normalized_recent[digit] * 0.21
            + normalized_gap[digit] * 0.24
            + normalized_cold[digit] * 0.22
            for digit in range(10)
        }

        position_stats.append(
            {
                "scores": scores,
                "frequency": frequency,
            }
        )

    return position_stats


def build_pension720_suffix_scores(draws: list[dict], length: int) -> dict[str, float]:
    counts: dict[str, int] = {}
    for draw in draws:
        suffix = str(draw["winningNumber"])[-length:]
        counts[suffix] = counts.get(suffix, 0) + 1

    max_value = max(counts.values() or [1])
    return {key: value / max_value for key, value in counts.items()}


def sorted_top_keys(metric: dict, limit: int) -> list:
    return [key for key, _ in sorted(metric.items(), key=lambda item: (-item[1], str(item[0])))[:limit]]


def build_pension720_digit_pools(position_stats: list[dict]) -> list[list[int]]:
    pools: list[list[int]] = []
    for stats in position_stats:
        hot = [int(key) for key in sorted_top_keys(stats["scores"], 4)]
        cold = [
            int(key)
            for key, _ in sorted(stats["frequency"].items(), key=lambda item: (item[1], item[0]))[:2]
        ]
        pool = []
        for digit in hot + cold:
            if digit not in pool:
                pool.append(digit)
        pools.append(pool[:5])
    return pools


def pension720_repeated_digit_penalty(digits: list[int]) -> float:
    return (PENSION720_DIGIT_COUNT - len(set(digits))) * 0.035


def pension720_consecutive_digit_penalty(digits: list[int]) -> float:
    penalty = 0.0
    for idx in range(len(digits) - 1):
        if digits[idx] == digits[idx + 1]:
            penalty += 0.03
    return penalty


def pension720_candidate_quality(
    candidate: dict,
    group_scores: dict[str, float],
    position_stats: list[dict],
    suffix2_scores: dict[str, float],
    suffix3_scores: dict[str, float],
) -> float:
    digits = candidate["digits"]
    digit_scores = [position_stats[idx]["scores"].get(digit, 0) for idx, digit in enumerate(digits)]
    cold_scores = []
    for idx, digit in enumerate(digits):
        frequency = position_stats[idx]["frequency"]
        max_frequency = max(frequency.values() or [1])
        cold_scores.append(1 - (frequency.get(digit, 0) / max_frequency))

    suffix2 = candidate["number"][-2:]
    suffix3 = candidate["number"][-3:]

    return (
        group_scores.get(candidate["group"], 0) * 0.18
        + mean(digit_scores) * 0.42
        + suffix2_scores.get(suffix2, 0) * 0.12
        + suffix3_scores.get(suffix3, 0) * 0.16
        + mean(cold_scores) * 0.12
        - pension720_repeated_digit_penalty(digits)
        - pension720_consecutive_digit_penalty(digits)
    )


def pension720_too_similar(left: dict, right: dict) -> bool:
    if left["group"] == right["group"] and left["number"] == right["number"]:
        return True

    same_position_count = sum(1 for idx in range(PENSION720_DIGIT_COUNT) if left["digits"][idx] == right["digits"][idx])
    if left["group"] == right["group"] and same_position_count >= 5:
        return True
    if left["number"][-3:] == right["number"][-3:]:
        return True
    return False


def pension720_similarity_penalty(candidate: dict, recent_picks: list[dict]) -> float:
    penalty = 0.0
    for previous in recent_picks:
        if candidate["group"] == previous["group"] and candidate["number"] == previous["number"]:
            return 10.0

        same_position_count = sum(
            1 for idx in range(PENSION720_DIGIT_COUNT) if int(candidate["digits"][idx]) == int(previous["digits"][idx])
        )

        if candidate["group"] == previous["group"]:
            penalty += same_position_count * 0.08
        else:
            penalty += same_position_count * 0.03

        if candidate["number"][-3:] == previous["number"][-3:]:
            penalty += 0.2

        if candidate["number"][-2:] == previous["number"][-2:]:
            penalty += 0.08

    return penalty


def generate_pension720_predictions(draws: list[dict], count: int = 5, recent_prediction_picks: list[dict] | None = None) -> list[dict]:
    if not draws:
        raise RuntimeError("No pension720 draw history available.")

    recent_prediction_picks = recent_prediction_picks or []
    history_set = {f"{draw['group']}-{draw['winningNumber']}" for draw in draws}
    group_stats = build_pension720_group_scores(draws)
    position_stats = build_pension720_position_digit_scores(draws)
    suffix2_scores = build_pension720_suffix_scores(draws, 2)
    suffix3_scores = build_pension720_suffix_scores(draws, 3)
    group_pool = [str(key) for key in sorted_top_keys(group_stats["scores"], len(PENSION720_GROUPS))]
    digit_pools = build_pension720_digit_pools(position_stats)
    candidates = []

    for group in group_pool:
        for digit0 in digit_pools[0]:
            for digit1 in digit_pools[1]:
                for digit2 in digit_pools[2]:
                    for digit3 in digit_pools[3]:
                        for digit4 in digit_pools[4]:
                            for digit5 in digit_pools[5]:
                                digits = [digit0, digit1, digit2, digit3, digit4, digit5]
                                number = "".join(str(digit) for digit in digits)
                                if f"{group}-{number}" in history_set:
                                    continue
                                candidate = {"group": group, "digits": digits, "number": number}
                                similarity_penalty = pension720_similarity_penalty(candidate, recent_prediction_picks)
                                if similarity_penalty >= 10:
                                    continue
                                candidates.append(
                                    {
                                        **candidate,
                                        "quality": pension720_candidate_quality(
                                            candidate,
                                            group_stats["scores"],
                                            position_stats,
                                            suffix2_scores,
                                            suffix3_scores,
                                        )
                                        - similarity_penalty,
                                    }
                                )

    candidates.sort(key=lambda item: item["quality"], reverse=True)

    picks: list[dict] = []
    for candidate in candidates:
        picked_candidate = {
            "group": candidate["group"],
            "digits": candidate["digits"],
            "number": candidate["number"],
        }
        if any(pension720_too_similar(existing, picked_candidate) for existing in picks):
            continue
        picks.append(picked_candidate)
        if len(picks) >= count:
            break

    return picks


def compare_pension720_pick_with_draw(pick: dict, draw: dict) -> dict:
    group_matched = str(pick["group"]) == str(draw["group"])
    exact_number = str(pick["number"]) == str(draw["winningNumber"])
    suffix_match_count = 0

    for idx in range(PENSION720_DIGIT_COUNT - 1, -1, -1):
        if int(pick["digits"][idx]) != int(draw["digits"][idx]):
            break
        suffix_match_count += 1

    rank = None
    prize_label = None
    if group_matched and exact_number:
        rank = "1등"
        prize_label = "월 700만원 x 20년"
    elif exact_number:
        rank = "2등"
        prize_label = "월 100만원 x 10년"
    elif suffix_match_count >= 5:
        rank = "3등"
        prize_label = "100만원"
    elif suffix_match_count == 4:
        rank = "4등"
        prize_label = "10만원"
    elif suffix_match_count == 3:
        rank = "5등"
        prize_label = "5만원"
    elif suffix_match_count == 2:
        rank = "6등"
        prize_label = "5천원"
    elif suffix_match_count == 1:
        rank = "7등"
        prize_label = "1천원"

    return {
        "pick": pick,
        "groupMatched": group_matched,
        "exactNumber": exact_number,
        "suffixMatchCount": suffix_match_count,
        "rank": rank,
        "prizeLabel": prize_label,
    }
