const MAX_NUMBER = 45;
const PICK_SIZE = 6;

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
  const normalizedCold = normalizeScores(new Map([...rawFrequency].map(([number, value]) => [number, -value])));
  const scores = new Map();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    scores.set(
      number,
      (normalizedFrequency.get(number) || 0) * 0.34 +
        (normalizedRecent.get(number) || 0) * 0.24 +
        (normalizedGap.get(number) || 0) * 0.24 +
        (normalizedCold.get(number) || 0) * 0.18,
    );
  }

  return {
    scores,
    frequency,
    recentFrequency,
    gaps,
  };
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
    baseScore * 0.48 +
    mean(pairValues) * 0.16 +
    sumScore * 0.2 +
    balanceScore * 0.16 -
    consecutivePenalty -
    lastDigitPenalty
  );
}

function sortNumbersByMetric(metric, direction = 'desc') {
  return Array.from({ length: MAX_NUMBER }, (_, idx) => idx + 1).sort((a, b) => {
    const diff = (metric.get(b) || 0) - (metric.get(a) || 0);
    return direction === 'desc' ? diff || a - b : -diff || a - b;
  });
}

function buildDeterministicCandidatePool(numberStats) {
  const { scores, frequency, recentFrequency, gaps } = numberStats;
  const pool = new Set();

  for (const number of sortNumbersByMetric(scores).slice(0, 18)) pool.add(number);
  for (const number of sortNumbersByMetric(frequency).slice(0, 10)) pool.add(number);
  for (const number of sortNumbersByMetric(frequency, 'asc').slice(0, 10)) pool.add(number);
  for (const number of sortNumbersByMetric(recentFrequency).slice(0, 8)) pool.add(number);
  for (const number of sortNumbersByMetric(gaps).slice(0, 8)) pool.add(number);

  return [...pool].sort((a, b) => a - b).slice(0, 28);
}

function enumerateCombinations(pool, pickSize, onCombo) {
  const combo = [];

  function walk(start) {
    if (combo.length === pickSize) {
      onCombo([...combo]);
      return;
    }

    const remaining = pickSize - combo.length;
    for (let index = start; index <= pool.length - remaining; index += 1) {
      combo.push(pool[index]);
      walk(index + 1);
      combo.pop();
    }
  }

  walk(0);
}

export function generateCombinations(draws, { count = 5 } = {}) {
  const numberStats = buildNumberScores(draws);
  const numberScores = numberStats.scores;
  const pairScores = buildPairScores(draws);
  const historicalSums = draws.map((draw) => draw.numbers.reduce((acc, number) => acc + number, 0));
  const historicalSets = new Set(draws.map((draw) => draw.numbers.join(',')));
  const candidates = [];
  const pool = buildDeterministicCandidatePool(numberStats);

  enumerateCombinations(pool, PICK_SIZE, (combo) => {
    const key = combo.join(',');
    if (historicalSets.has(key)) return;

    candidates.push({
      combo,
      quality: combinationQuality(combo, numberScores, pairScores, historicalSums),
    });
  });

  candidates.sort((a, b) => b.quality - a.quality);

  return candidates.slice(0, count).map((candidate) => candidate.combo);
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
