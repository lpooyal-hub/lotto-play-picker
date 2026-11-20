MAX_NUMBER = 45
PICK_SIZE = 6

BASE_NUMBER_RATE = PICK_SIZE / MAX_NUMBER
RECENT_DECAY = 2 ** (-1 / 104)
RECENT_SHARE = 0.25
VALIDATION_BLOCK_SIZE = 104
MIN_TRAINING_DRAWS = 100


def smoothed_rate(count: float, weight: float, prior_strength: int) -> float:
    return (count + prior_strength * BASE_NUMBER_RATE) / (weight + prior_strength)


def blend_rates(all_time_rate: float, recent_rate: float) -> float:
    return (1 - RECENT_SHARE) * all_time_rate + RECENT_SHARE * recent_rate


def build_number_rates(draws: list[dict]) -> tuple[dict[int, float], dict[int, float]]:
    all_time_counts = [0] * (MAX_NUMBER + 1)
    recent_counts = [0.0] * (MAX_NUMBER + 1)
    validation_start = len(draws) - 2 * VALIDATION_BLOCK_SIZE
    can_validate = validation_start >= MIN_TRAINING_DRAWS
    validation = [{"against_uniform": 0.0, "against_all_time": 0.0} for _ in range(2)]
    recent_weight = 0.0

    for index, draw in enumerate(draws):
        numbers = draw["numbers"]
        # Score each draw before adding its winning numbers to the history.
        if can_validate and index >= validation_start:
            block = validation[(index - validation_start) // VALIDATION_BLOCK_SIZE]
            winning_numbers = set(numbers)
            for number in range(1, MAX_NUMBER + 1):
                observed = int(number in winning_numbers)
                all_time_rate = smoothed_rate(all_time_counts[number], index, 24)
                recent_rate = smoothed_rate(recent_counts[number], recent_weight, 16)
                blended_error = (blend_rates(all_time_rate, recent_rate) - observed) ** 2
                block["against_uniform"] += blended_error - (BASE_NUMBER_RATE - observed) ** 2
                block["against_all_time"] += blended_error - (all_time_rate - observed) ** 2

        for number in range(1, MAX_NUMBER + 1):
            recent_counts[number] *= RECENT_DECAY
        for number in numbers:
            all_time_counts[number] += 1
            recent_counts[number] += 1
        recent_weight = recent_weight * RECENT_DECAY + 1

    use_recent = can_validate and all(
        block["against_uniform"] < 0 and block["against_all_time"] < 0
        for block in validation
    )
    all_time_rates = {}
    number_rates = {}
    for number in range(1, MAX_NUMBER + 1):
        all_time_rate = smoothed_rate(all_time_counts[number], len(draws), 24)
        recent_rate = smoothed_rate(recent_counts[number], recent_weight, 16)
        all_time_rates[number] = all_time_rate
        number_rates[number] = blend_rates(all_time_rate, recent_rate) if use_recent else all_time_rate

    return all_time_rates, number_rates
