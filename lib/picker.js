const MAX_NUMBER = 45;
const PICK_SIZE = 6;

function createSeededRandom(seed) {
  if (!Number.isFinite(seed)) {
    return Math.random;
  }

  let value = Math.floor(seed) % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function countValues(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function normalizeScores(rawScores) {
  const values = [...rawScores.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  const normalized = new Map();

  for (const [key, value] of rawScores.entries()) {
    normalized.set(key, (value - min) / span);
  }

  return normalized;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values) {
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance) || 1;
}

function buildNumberScores(draws) {
  const allNumbers = draws.flatMap((draw) => draw.numbers);
  const frequency = countValues(allNumbers);
  const recentCutoff = Math.max(12, Math.min(80, Math.floor(draws.length / 8)));
  const recentFrequency = countValues(draws.slice(-recentCutoff).flatMap((draw) => draw.numbers));
  const gaps = new Map();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const reversedIndex = [...draws].reverse().findIndex((draw) => draw.numbers.includes(number));
    gaps.set(number, reversedIndex >= 0 ? reversedIndex + 1 : draws.length + 1);
  }

  const rawFrequency = new Map();
  const rawRecent = new Map();
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    rawFrequency.set(number, frequency.get(number) || 0);
    rawRecent.set(number, recentFrequency.get(number) || 0);
  }

  const normalizedFrequency = normalizeScores(rawFrequency);
  const normalizedRecent = normalizeScores(rawRecent);
  const normalizedGap = normalizeScores(gaps);
  const scores = new Map();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    scores.set(
      number,
      (normalizedFrequency.get(number) || 0) * 0.46 +
        (normalizedRecent.get(number) || 0) * 0.34 +
        (normalizedGap.get(number) || 0) * 0.2,
    );
  }

  return scores;
}

function buildPairScores(draws) {
  const pairs = new Map();

  for (const draw of draws) {
    for (let i = 0; i < draw.numbers.length; i += 1) {
      for (let j = i + 1; j < draw.numbers.length; j += 1) {
        const key = `${draw.numbers[i]}-${draw.numbers[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  const max = Math.max(...pairs.values(), 1);
  const normalized = new Map();
  for (const [key, value] of pairs.entries()) {
    normalized.set(key, value / max);
  }
  return normalized;
}

function weightedSampleWithoutReplacement(weights, count, rng) {
  const pool = Array.from({ length: MAX_NUMBER }, (_, idx) => idx + 1);
  const picked = [];

  for (let i = 0; i < count; i += 1) {
    const total = pool.reduce((acc, number) => acc + Math.max(weights.get(number) || 0, 0.001), 0);
    let cursor = rng() * total;

    for (const number of pool) {
      cursor -= Math.max(weights.get(number) || 0, 0.001);
      if (cursor <= 0) {
        picked.push(number);
        pool.splice(pool.indexOf(number), 1);
        break;
      }
    }
  }

  return picked;
}

function countConsecutivePairs(numbers) {
  let count = 0;
  for (let i = 0; i < numbers.length - 1; i += 1) {
    if (numbers[i + 1] - numbers[i] === 1) count += 1;
  }
  return count;
}

function combinationQuality(numbers, numberScores, pairScores, historicalSums) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const oddCount = sorted.filter((number) => number % 2).length;
  const lowCount = sorted.filter((number) => number <= 22).length;
  const totalSum = sorted.reduce((acc, number) => acc + number, 0);
  const medianSum = median(historicalSums);
  const sumStdev = stdev(historicalSums);
  const sumScore = Math.max(0, 1 - Math.abs(totalSum - medianSum) / (sumStdev * 2.2));
  const baseScore = mean(sorted.map((number) => numberScores.get(number) || 0));
  const pairValues = [];

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      pairValues.push(pairScores.get(`${sorted[i]}-${sorted[j]}`) || 0);
    }
  }

  let balanceScore = 1;
  if (![2, 3, 4].includes(oddCount)) balanceScore -= 0.25;
  if (![2, 3, 4].includes(lowCount)) balanceScore -= 0.2;

  const lastDigitPenalty = (PICK_SIZE - new Set(sorted.map((number) => number % 10)).size) * 0.03;
  const consecutivePenalty = countConsecutivePairs(sorted) * 0.08;

  return (
    baseScore * 0.42 +
    mean(pairValues) * 0.2 +
    sumScore * 0.22 +
    balanceScore * 0.16 -
    consecutivePenalty -
    lastDigitPenalty
  );
}

export function generateCombinations(draws, { count = 5, attempts = 3000, seed = undefined } = {}) {
  const rng = createSeededRandom(seed);
  const numberScores = buildNumberScores(draws);
  const pairScores = buildPairScores(draws);
  const historicalSums = draws.map((draw) => draw.numbers.reduce((acc, number) => acc + number, 0));
  const historicalSets = new Set(draws.map((draw) => draw.numbers.join(',')));
  const candidates = [];

  for (let i = 0; i < attempts; i += 1) {
    const combo = weightedSampleWithoutReplacement(numberScores, PICK_SIZE, rng).sort((a, b) => a - b);
    const key = combo.join(',');
    if (historicalSets.has(key)) continue;

    candidates.push({
      combo,
      quality: combinationQuality(combo, numberScores, pairScores, historicalSums),
    });
  }

  candidates.sort((a, b) => b.quality - a.quality);

  const result = [];
  const usage = new Map();
  for (const candidate of candidates) {
    if (result.length >= count) break;
    if (result.some((existing) => candidate.combo.filter((number) => existing.includes(number)).length >= 4)) {
      continue;
    }
    if (candidate.combo.some((number) => (usage.get(number) || 0) >= 2)) {
      continue;
    }

    result.push(candidate.combo);
    for (const number of candidate.combo) {
      usage.set(number, (usage.get(number) || 0) + 1);
    }
  }

  return result.length ? result : candidates.slice(0, count).map((candidate) => candidate.combo);
}

export function comparePickWithDraw(pick, draw) {
  const matchCount = pick.filter((number) => draw.numbers.includes(number)).length;
  const bonusMatched = pick.includes(draw.bonus);

  return {
    pick,
    matchCount,
    bonusMatched,
  };
}
