#!/usr/bin/env python3
"""
Fun Lotto 6/45 number picker.

This script fetches historical Korean Lotto 6/45 winning numbers from the
Dhlottery public JSON endpoint, scores numbers using simple historical signals,
and prints 5 playful combinations.

Important:
    Lottery draws are random. This does not improve or guarantee winning odds.
    Treat the output as a small weekly hobby tool, not financial advice.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Iterable
from urllib.error import URLError
from urllib.request import Request, urlopen


LOTTO_API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={draw_no}"
FIRST_DRAW_DATE = date(2002, 12, 7)
MAX_NUMBER = 45
PICK_SIZE = 6


@dataclass(frozen=True)
class Draw:
    draw_no: int
    numbers: tuple[int, int, int, int, int, int]
    bonus: int


def fetch_json(url: str, timeout: float = 8.0) -> dict:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 lotto-play-picker/0.1",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_draw(draw_no: int, retries: int = 2) -> Draw | None:
    url = LOTTO_API.format(draw_no=draw_no)

    for attempt in range(retries + 1):
        try:
            data = fetch_json(url)
            if data.get("returnValue") != "success":
                return None

            numbers = tuple(int(data[f"drwtNo{i}"]) for i in range(1, 7))
            return Draw(
                draw_no=int(data["drwNo"]),
                numbers=tuple(sorted(numbers)),
                bonus=int(data["bnusNo"]),
            )
        except (KeyError, ValueError, json.JSONDecodeError, URLError, TimeoutError) as exc:
            if attempt >= retries:
                print(f"[WARN] draw {draw_no} fetch failed: {exc}", file=sys.stderr)
                return None
            time.sleep(0.4 * (attempt + 1))

    return None


def estimate_latest_draw_no(today: date | None = None) -> int:
    today = today or date.today()
    weeks = max(0, (today - FIRST_DRAW_DATE).days // 7)
    return weeks + 1


def find_latest_draw_no() -> int:
    candidate = estimate_latest_draw_no()

    while fetch_draw(candidate) is None and candidate > 1:
        candidate -= 1

    while fetch_draw(candidate + 1) is not None:
        candidate += 1

    return candidate


def fetch_history(limit: int | None = None) -> list[Draw]:
    latest = find_latest_draw_no()
    start = 1 if limit is None else max(1, latest - limit + 1)

    draws: list[Draw] = []
    for draw_no in range(start, latest + 1):
        draw = fetch_draw(draw_no)
        if draw:
            draws.append(draw)

    if not draws:
        raise RuntimeError("No lotto history could be fetched.")

    return draws


def normalize_scores(raw_scores: dict[int, float]) -> dict[int, float]:
    values = list(raw_scores.values())
    min_score = min(values)
    max_score = max(values)
    span = max(max_score - min_score, 1e-9)
    return {number: (score - min_score) / span for number, score in raw_scores.items()}


def build_number_scores(draws: list[Draw]) -> dict[int, float]:
    frequency = Counter(number for draw in draws for number in draw.numbers)

    recent_cutoff = max(12, min(80, len(draws) // 8))
    recent_draws = draws[-recent_cutoff:]
    recent_frequency = Counter(number for draw in recent_draws for number in draw.numbers)

    gaps: dict[int, int] = {}
    for number in range(1, MAX_NUMBER + 1):
        last_seen_index = next(
            (idx for idx, draw in enumerate(reversed(draws), start=1) if number in draw.numbers),
            len(draws) + 1,
        )
        gaps[number] = last_seen_index

    normalized_frequency = normalize_scores({n: frequency[n] for n in range(1, MAX_NUMBER + 1)})
    normalized_recent = normalize_scores({n: recent_frequency[n] for n in range(1, MAX_NUMBER + 1)})
    normalized_gap = normalize_scores(gaps)

    scores: dict[int, float] = {}
    for number in range(1, MAX_NUMBER + 1):
        scores[number] = (
            normalized_frequency[number] * 0.46
            + normalized_recent[number] * 0.34
            + normalized_gap[number] * 0.20
        )

    return scores


def build_pair_scores(draws: list[Draw]) -> dict[tuple[int, int], float]:
    pair_counter: Counter[tuple[int, int]] = Counter()
    for draw in draws:
        numbers = draw.numbers
        for idx, first in enumerate(numbers):
            for second in numbers[idx + 1 :]:
                pair_counter[(first, second)] += 1

    if not pair_counter:
        return {}

    max_count = max(pair_counter.values())
    return {pair: count / max_count for pair, count in pair_counter.items()}


def weighted_sample_without_replacement(
    candidates: Iterable[int],
    weights: dict[int, float],
    count: int,
    rng: random.Random,
) -> list[int]:
    pool = list(candidates)
    picked: list[int] = []

    for _ in range(count):
        total = sum(max(weights.get(number, 0.0), 0.001) for number in pool)
        cursor = rng.random() * total
        upto = 0.0

        for number in pool:
            upto += max(weights.get(number, 0.0), 0.001)
            if upto >= cursor:
                picked.append(number)
                pool.remove(number)
                break

    return picked


def count_consecutive_pairs(numbers: list[int]) -> int:
    return sum(1 for a, b in zip(numbers, numbers[1:]) if b - a == 1)


def combination_quality(
    numbers: list[int],
    number_scores: dict[int, float],
    pair_scores: dict[tuple[int, int], float],
    historical_sums: list[int],
) -> float:
    sorted_numbers = sorted(numbers)
    odd_count = sum(number % 2 for number in sorted_numbers)
    low_count = sum(number <= 22 for number in sorted_numbers)
    total_sum = sum(sorted_numbers)

    median_sum = statistics.median(historical_sums)
    sum_stdev = statistics.pstdev(historical_sums) or 1.0
    sum_score = max(0.0, 1.0 - abs(total_sum - median_sum) / (sum_stdev * 2.2))

    base_score = sum(number_scores[number] for number in sorted_numbers) / PICK_SIZE
    pair_score_values = []
    for idx, first in enumerate(sorted_numbers):
        for second in sorted_numbers[idx + 1 :]:
            pair_score_values.append(pair_scores.get((first, second), 0.0))
    pair_score = statistics.mean(pair_score_values) if pair_score_values else 0.0

    balance_score = 1.0
    if odd_count not in {2, 3, 4}:
        balance_score -= 0.25
    if low_count not in {2, 3, 4}:
        balance_score -= 0.20

    consecutive_penalty = count_consecutive_pairs(sorted_numbers) * 0.08
    same_last_digit_penalty = (PICK_SIZE - len({number % 10 for number in sorted_numbers})) * 0.03

    return (
        base_score * 0.42
        + pair_score * 0.20
        + sum_score * 0.22
        + balance_score * 0.16
        - consecutive_penalty
        - same_last_digit_penalty
    )


def generate_combinations(
    draws: list[Draw],
    count: int = 5,
    seed: int | None = None,
    attempts: int = 3000,
) -> list[tuple[int, ...]]:
    rng = random.Random(seed)
    number_scores = build_number_scores(draws)
    pair_scores = build_pair_scores(draws)
    historical_sums = [sum(draw.numbers) for draw in draws]
    historical_sets = {draw.numbers for draw in draws}

    candidates: list[tuple[float, tuple[int, ...]]] = []
    all_numbers = range(1, MAX_NUMBER + 1)

    for _ in range(attempts):
        picked = weighted_sample_without_replacement(all_numbers, number_scores, PICK_SIZE, rng)
        combo = tuple(sorted(picked))

        if combo in historical_sets:
            continue

        quality = combination_quality(list(combo), number_scores, pair_scores, historical_sums)
        candidates.append((quality, combo))

    candidates.sort(reverse=True, key=lambda item: item[0])

    result: list[tuple[int, ...]] = []
    used_numbers: Counter[int] = Counter()

    for _, combo in candidates:
        if len(result) >= count:
            break

        # Keep the 5 recommendations from becoming too similar.
        if any(len(set(combo) & set(existing)) >= 4 for existing in result):
            continue
        if any(used_numbers[number] >= 2 for number in combo):
            continue

        result.append(combo)
        used_numbers.update(combo)

    return result or [combo for _, combo in candidates[:count]]


def format_combo(combo: tuple[int, ...]) -> str:
    return " ".join(f"{number:02d}" for number in combo)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate 5 playful Korean Lotto 6/45 combinations from historical draw data."
    )
    parser.add_argument("--count", type=int, default=5, help="number of combinations to print")
    parser.add_argument("--history", type=int, default=None, help="recent draw count to analyze; default: all")
    parser.add_argument("--seed", type=int, default=None, help="random seed for reproducible output")
    parser.add_argument("--attempts", type=int, default=3000, help="candidate combinations to evaluate")
    args = parser.parse_args()

    draws = fetch_history(limit=args.history)
    combos = generate_combinations(
        draws,
        count=max(1, args.count),
        seed=args.seed,
        attempts=max(args.attempts, args.count * 100),
    )

    print("Lotto 6/45 playful picks")
    print(f"History: draw {draws[0].draw_no} ~ {draws[-1].draw_no} ({len(draws)} draws)")
    print("Note: random lottery; no guarantee, just for fun.\n")

    for idx, combo in enumerate(combos, start=1):
        print(f"{idx}. {format_combo(combo)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
