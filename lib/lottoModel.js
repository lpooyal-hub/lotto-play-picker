const MAX_NUMBER = 45;
const PICK_SIZE = 6;
const CANDIDATE_POOL_SIZE = 28;
const SHORTLIST_SIZE = 700;
const BASE_NUMBER_RATE = PICK_SIZE / MAX_NUMBER;
const BASE_PAIR_RATE = (PICK_SIZE * (PICK_SIZE - 1)) / (MAX_NUMBER * (MAX_NUMBER - 1));

export const LOTTO_MODEL_VERSION = '2.0';

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values) {
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) || 1;
}

function rankNormalize(metric) {
  const entries = [...metric.entries()].sort(
    (left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0]), 'en', { numeric: true }),
  );
  const divisor = Math.max(entries.length - 1, 1);
  const normalized = new Map();

  for (let start = 0; start < entries.length; ) {
    let end = start;
    while (end + 1 < entries.length && entries[end + 1][1] === entries[start][1]) end += 1;
    const averageRank = (start + end) / 2 / divisor;
    for (let index = start; index <= end; index += 1) normalized.set(entries[index][0], averageRank);
    start = end + 1;
  }

  return normalized;
}

function canonicalDraws(draws) {
  const normalized = (draws || [])
    .map((draw) => ({
      drawNo: Number(draw.drawNo),
      numbers: [...new Set((draw.numbers || []).map(Number))].sort((a, b) => a - b),
    }))
    .filter(
      (draw) =>
        Number.isInteger(draw.drawNo) &&
        draw.numbers.length === PICK_SIZE &&
        draw.numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= MAX_NUMBER),
    )
    .sort((a, b) => a.drawNo - b.drawNo);

  if (!normalized.length) {
    throw new Error('No valid lotto draw history available.');
  }

  return normalized;
}

function buildWeightedNumberRates(draws, halfLife, priorStrength) {
  const counts = new Map(Array.from({ length: MAX_NUMBER }, (_, index) => [index + 1, 0]));
  let totalWeight = 0;

  draws.forEach((draw, index) => {
    const age = draws.length - index - 1;
    const weight = 2 ** (-age / halfLife);
    totalWeight += weight;
    draw.numbers.forEach((number) => counts.set(number, counts.get(number) + weight));
  });

  return new Map(
    [...counts].map(([number, count]) => [
      number,
      (count + priorStrength * BASE_NUMBER_RATE) / (totalWeight + priorStrength),
    ]),
  );
}

function buildNumberModel(draws) {
  const allTimeRates = buildWeightedNumberRates(draws, Number.POSITIVE_INFINITY, 24);
  const mediumRates = buildWeightedNumberRates(draws, 104, 16);
  const recentRates = buildWeightedNumberRates(draws, 36, 12);
  const gaps = new Map();
  const reversed = [...draws].reverse();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const index = reversed.findIndex((draw) => draw.numbers.includes(number));
    gaps.set(number, Math.min(index >= 0 ? index + 1 : draws.length + 1, 24));
  }

  const longRank = rankNormalize(allTimeRates);
  const mediumRank = rankNormalize(mediumRates);
  const recentRank = rankNormalize(recentRates);
  const gapRank = rankNormalize(gaps);
  const scores = new Map();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    scores.set(
      number,
      longRank.get(number) * 0.3 +
        mediumRank.get(number) * 0.24 +
        recentRank.get(number) * 0.39 +
        gapRank.get(number) * 0.07,
    );
  }

  return { scores, allTimeRates, mediumRates, recentRates, gaps };
}

function pairKey(first, second) {
  return first < second ? `${first}-${second}` : `${second}-${first}`;
}

function buildPairScores(draws) {
  const longCounts = new Map();
  const recentCounts = new Map();
  let recentWeightTotal = 0;

  for (let first = 1; first <= MAX_NUMBER; first += 1) {
    for (let second = first + 1; second <= MAX_NUMBER; second += 1) {
      const key = pairKey(first, second);
      longCounts.set(key, 0);
      recentCounts.set(key, 0);
    }
  }

  draws.forEach((draw, index) => {
    const age = draws.length - index - 1;
    const recentWeight = 2 ** (-age / 52);
    recentWeightTotal += recentWeight;

    for (let firstIndex = 0; firstIndex < PICK_SIZE; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < PICK_SIZE; secondIndex += 1) {
        const key = pairKey(draw.numbers[firstIndex], draw.numbers[secondIndex]);
        longCounts.set(key, longCounts.get(key) + 1);
        recentCounts.set(key, recentCounts.get(key) + recentWeight);
      }
    }
  });

  const blended = new Map();
  for (const key of longCounts.keys()) {
    const longRate = (longCounts.get(key) + 30 * BASE_PAIR_RATE) / (draws.length + 30);
    const recentRate = (recentCounts.get(key) + 18 * BASE_PAIR_RATE) / (recentWeightTotal + 18);
    blended.set(key, longRate * 0.42 + recentRate * 0.58);
  }

  return rankNormalize(blended);
}

function buildHistogram(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const maximum = Math.max(...counts.values(), 1);
  return new Map([...counts].map(([key, count]) => [key, (count + 1) / (maximum + 1)]));
}

function countConsecutivePairs(numbers) {
  let count = 0;
  for (let index = 0; index < numbers.length - 1; index += 1) {
    if (numbers[index + 1] - numbers[index] === 1) count += 1;
  }
  return count;
}

function buildShapeModel(draws) {
  const sums = draws.map((draw) => draw.numbers.reduce((total, number) => total + number, 0));
  const spreads = draws.map((draw) => draw.numbers[PICK_SIZE - 1] - draw.numbers[0]);

  return {
    sumMean: mean(sums),
    sumStdev: stdev(sums),
    spreadMean: mean(spreads),
    spreadStdev: stdev(spreads),
    odd: buildHistogram(draws.map((draw) => draw.numbers.filter((number) => number % 2).length)),
    low: buildHistogram(draws.map((draw) => draw.numbers.filter((number) => number <= 22).length)),
    consecutive: buildHistogram(draws.map((draw) => countConsecutivePairs(draw.numbers))),
    lastDigits: buildHistogram(draws.map((draw) => new Set(draw.numbers.map((number) => number % 10)).size)),
  };
}

function bellScore(value, average, deviation) {
  const zScore = (value - average) / deviation;
  return Math.exp(-0.5 * zScore ** 2);
}

function combinationQuality(numbers, numberScores, pairScores, shapeModel) {
  const pairValues = [];
  for (let firstIndex = 0; firstIndex < PICK_SIZE; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < PICK_SIZE; secondIndex += 1) {
      pairValues.push(pairScores.get(pairKey(numbers[firstIndex], numbers[secondIndex])) || 0);
    }
  }

  const total = numbers.reduce((sum, number) => sum + number, 0);
  const oddCount = numbers.filter((number) => number % 2).length;
  const lowCount = numbers.filter((number) => number <= 22).length;
  const spread = numbers[PICK_SIZE - 1] - numbers[0];
  const consecutiveCount = countConsecutivePairs(numbers);
  const uniqueLastDigits = new Set(numbers.map((number) => number % 10)).size;

  return (
    mean(numbers.map((number) => numberScores.get(number) || 0)) * 0.34 +
    mean(pairValues) * 0.12 +
    bellScore(total, shapeModel.sumMean, shapeModel.sumStdev) * 0.18 +
    (shapeModel.odd.get(oddCount) || 0) * 0.09 +
    (shapeModel.low.get(lowCount) || 0) * 0.09 +
    bellScore(spread, shapeModel.spreadMean, shapeModel.spreadStdev) * 0.1 +
    (shapeModel.consecutive.get(consecutiveCount) || 0) * 0.05 +
    (shapeModel.lastDigits.get(uniqueLastDigits) || 0) * 0.03
  );
}

function numbersByMetric(metric, direction = 'desc') {
  return Array.from({ length: MAX_NUMBER }, (_, index) => index + 1).sort((left, right) => {
    const difference = (metric.get(right) || 0) - (metric.get(left) || 0);
    return (direction === 'desc' ? difference : -difference) || left - right;
  });
}

function buildCandidatePool(numberModel) {
  const rankings = [
    numbersByMetric(numberModel.scores),
    numbersByMetric(numberModel.recentRates),
    numbersByMetric(numberModel.mediumRates),
    numbersByMetric(numberModel.allTimeRates),
    numbersByMetric(numberModel.gaps),
    numbersByMetric(numberModel.allTimeRates, 'asc'),
  ];
  const pool = new Set();

  for (let rank = 0; pool.size < CANDIDATE_POOL_SIZE && rank < MAX_NUMBER; rank += 1) {
    for (const ranking of rankings) {
      pool.add(ranking[rank]);
      if (pool.size === CANDIDATE_POOL_SIZE) break;
    }
  }

  return [...pool].sort((a, b) => a - b);
}

function compareCandidates(left, right) {
  if (right.quality !== left.quality) return right.quality - left.quality;
  for (let index = 0; index < PICK_SIZE; index += 1) {
    if (left.combo[index] !== right.combo[index]) return left.combo[index] - right.combo[index];
  }
  return 0;
}

function buildShortlist(pool, historicalSets, scoreCandidate) {
  const shortlist = [];
  const combo = [];

  function walk(start) {
    if (combo.length === PICK_SIZE) {
      const key = combo.join(',');
      if (!historicalSets.has(key)) {
        shortlist.push({ combo: [...combo], quality: scoreCandidate(combo) });
        if (shortlist.length >= SHORTLIST_SIZE * 2) {
          shortlist.sort(compareCandidates);
          shortlist.length = SHORTLIST_SIZE;
        }
      }
      return;
    }

    const remaining = PICK_SIZE - combo.length;
    for (let index = start; index <= pool.length - remaining; index += 1) {
      combo.push(pool[index]);
      walk(index + 1);
      combo.pop();
    }
  }

  walk(0);
  shortlist.sort(compareCandidates);
  return shortlist.slice(0, SHORTLIST_SIZE);
}

function diversityPenalty(combo, selected, usage) {
  const comboSet = new Set(combo);
  const overlapPenalty = selected.reduce((penalty, pick) => {
    const overlap = pick.filter((number) => comboSet.has(number)).length;
    const similarityPenalty = overlap >= 4 ? 0.24 + (overlap - 4) * 0.18 : overlap ** 2 * 0.009;
    return Math.max(penalty, similarityPenalty);
  }, 0);
  const reusePenalty = mean(combo.map((number) => usage.get(number) || 0)) * 0.018;
  return overlapPenalty + reusePenalty;
}

function selectDiversified(shortlist, count) {
  const selected = [];
  const usage = new Map();
  const remaining = [...shortlist];

  while (selected.length < count && remaining.length) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const adjustedScore = candidate.quality - diversityPenalty(candidate.combo, selected, usage);
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked.combo);
    picked.combo.forEach((number) => usage.set(number, (usage.get(number) || 0) + 1));
  }

  return selected;
}

export function generateCombinations(draws, { count = 5 } = {}) {
  const history = canonicalDraws(draws);
  const numberModel = buildNumberModel(history);
  const pairScores = buildPairScores(history);
  const shapeModel = buildShapeModel(history);
  const pool = buildCandidatePool(numberModel);
  const historicalSets = new Set(history.map((draw) => draw.numbers.join(',')));
  const shortlist = buildShortlist(pool, historicalSets, (combo) =>
    combinationQuality(combo, numberModel.scores, pairScores, shapeModel),
  );

  return selectDiversified(shortlist, Math.max(1, Math.min(Number(count) || 5, 20)));
}
