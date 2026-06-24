const GROUPS = ['1', '2', '3', '4', '5'];
const DIGIT_COUNT = 6;

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
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildGroupScores(draws) {
  const groups = draws.map((draw) => draw.group);
  const frequency = countValues(groups);
  const recentCutoff = Math.max(10, Math.min(48, Math.floor(draws.length / 6)));
  const recentFrequency = countValues(draws.slice(-recentCutoff).map((draw) => draw.group));
  const gaps = new Map();

  for (const group of GROUPS) {
    const reversedIndex = [...draws].reverse().findIndex((draw) => draw.group === group);
    gaps.set(group, reversedIndex >= 0 ? reversedIndex + 1 : draws.length + 1);
  }

  const rawFrequency = new Map();
  const rawRecent = new Map();
  for (const group of GROUPS) {
    rawFrequency.set(group, frequency.get(group) || 0);
    rawRecent.set(group, recentFrequency.get(group) || 0);
  }

  const normalizedFrequency = normalizeScores(rawFrequency);
  const normalizedRecent = normalizeScores(rawRecent);
  const normalizedGap = normalizeScores(gaps);
  const normalizedCold = normalizeScores(new Map([...rawFrequency].map(([key, value]) => [key, -value])));
  const scores = new Map();

  for (const group of GROUPS) {
    scores.set(
      group,
      (normalizedFrequency.get(group) || 0) * 0.34 +
        (normalizedRecent.get(group) || 0) * 0.2 +
        (normalizedGap.get(group) || 0) * 0.26 +
        (normalizedCold.get(group) || 0) * 0.2,
    );
  }

  return { scores, frequency, recentFrequency, gaps };
}

function buildPositionDigitScores(draws) {
  return Array.from({ length: DIGIT_COUNT }, (_, position) => {
    const values = draws.map((draw) => draw.digits[position]);
    const frequency = countValues(values);
    const recentCutoff = Math.max(12, Math.min(60, Math.floor(draws.length / 5)));
    const recentFrequency = countValues(draws.slice(-recentCutoff).map((draw) => draw.digits[position]));
    const gaps = new Map();

    for (let digit = 0; digit <= 9; digit += 1) {
      const reversedIndex = [...draws].reverse().findIndex((draw) => draw.digits[position] === digit);
      gaps.set(digit, reversedIndex >= 0 ? reversedIndex + 1 : draws.length + 1);
    }

    const rawFrequency = new Map();
    const rawRecent = new Map();
    for (let digit = 0; digit <= 9; digit += 1) {
      rawFrequency.set(digit, frequency.get(digit) || 0);
      rawRecent.set(digit, recentFrequency.get(digit) || 0);
    }

    const normalizedFrequency = normalizeScores(rawFrequency);
    const normalizedRecent = normalizeScores(rawRecent);
    const normalizedGap = normalizeScores(gaps);
    const normalizedCold = normalizeScores(new Map([...rawFrequency].map(([key, value]) => [key, -value])));
    const scores = new Map();

    for (let digit = 0; digit <= 9; digit += 1) {
      scores.set(
        digit,
        (normalizedFrequency.get(digit) || 0) * 0.33 +
          (normalizedRecent.get(digit) || 0) * 0.21 +
          (normalizedGap.get(digit) || 0) * 0.24 +
          (normalizedCold.get(digit) || 0) * 0.22,
      );
    }

    return { scores, frequency, recentFrequency, gaps };
  });
}

function buildSuffixScores(draws, length) {
  const counts = countValues(draws.map((draw) => draw.winningNumber.slice(-length)));
  const max = Math.max(...counts.values(), 1);
  const normalized = new Map();

  for (const [key, value] of counts.entries()) {
    normalized.set(key, value / max);
  }

  return normalized;
}

function sortedTopKeys(metric, cast = (value) => value, limit = 4) {
  return [...metric.entries()]
    .sort((left, right) => {
      const diff = right[1] - left[1];
      return diff || Number(left[0]) - Number(right[0]);
    })
    .slice(0, limit)
    .map(([key]) => cast(key));
}

function buildDigitPools(positionStats) {
  return positionStats.map((stats) => {
    const hot = sortedTopKeys(stats.scores, Number, 4);
    const cold = [...stats.frequency.entries()]
      .sort((left, right) => left[1] - right[1] || Number(left[0]) - Number(right[0]))
      .slice(0, 2)
      .map(([digit]) => Number(digit));

    return [...new Set([...hot, ...cold])].slice(0, 5);
  });
}

function repeatedDigitPenalty(digits) {
  const uniqueCount = new Set(digits).size;
  return (DIGIT_COUNT - uniqueCount) * 0.035;
}

function consecutiveDigitPenalty(digits) {
  let penalty = 0;
  for (let index = 0; index < digits.length - 1; index += 1) {
    if (digits[index] === digits[index + 1]) {
      penalty += 0.03;
    }
  }
  return penalty;
}

function candidateQuality(candidate, groupScores, positionStats, suffix2Scores, suffix3Scores) {
  const digitScores = candidate.digits.map((digit, index) => positionStats[index].scores.get(digit) || 0);
  const coldScores = candidate.digits.map((digit, index) => {
    const frequencyEntries = [...positionStats[index].frequency.entries()];
    const maxFrequency = Math.max(...frequencyEntries.map((entry) => entry[1]), 1);
    return 1 - ((positionStats[index].frequency.get(digit) || 0) / maxFrequency);
  });
  const suffix2 = candidate.number.slice(-2);
  const suffix3 = candidate.number.slice(-3);

  return (
    (groupScores.get(candidate.group) || 0) * 0.18 +
    mean(digitScores) * 0.42 +
    (suffix2Scores.get(suffix2) || 0) * 0.12 +
    (suffix3Scores.get(suffix3) || 0) * 0.16 +
    mean(coldScores) * 0.12 -
    repeatedDigitPenalty(candidate.digits) -
    consecutiveDigitPenalty(candidate.digits)
  );
}

function enumerateCandidates(groupPool, digitPools, onCandidate) {
  for (const group of groupPool) {
    for (const digit0 of digitPools[0]) {
      for (const digit1 of digitPools[1]) {
        for (const digit2 of digitPools[2]) {
          for (const digit3 of digitPools[3]) {
            for (const digit4 of digitPools[4]) {
              for (const digit5 of digitPools[5]) {
                const digits = [digit0, digit1, digit2, digit3, digit4, digit5];
                onCandidate({
                  group,
                  digits,
                  number: digits.join(''),
                });
              }
            }
          }
        }
      }
    }
  }
}

function tooSimilar(left, right) {
  if (left.group === right.group && left.number === right.number) return true;

  const samePositionCount = left.digits.filter((digit, index) => digit === right.digits[index]).length;
  if (left.group === right.group && samePositionCount >= 5) return true;
  if (left.number.slice(-3) === right.number.slice(-3)) return true;

  return false;
}

export function generatePension720Predictions(draws, { count = 5 } = {}) {
  if (!draws.length) {
    throw new Error('연금720 분석용 회차 데이터가 없습니다.');
  }

  const historySet = new Set(draws.map((draw) => `${draw.group}-${draw.winningNumber}`));
  const groupStats = buildGroupScores(draws);
  const positionStats = buildPositionDigitScores(draws);
  const suffix2Scores = buildSuffixScores(draws, 2);
  const suffix3Scores = buildSuffixScores(draws, 3);
  const groupPool = sortedTopKeys(groupStats.scores, String, GROUPS.length);
  const digitPools = buildDigitPools(positionStats);
  const candidates = [];

  enumerateCandidates(groupPool, digitPools, (candidate) => {
    if (historySet.has(`${candidate.group}-${candidate.number}`)) return;
    candidates.push({
      ...candidate,
      quality: candidateQuality(candidate, groupStats.scores, positionStats, suffix2Scores, suffix3Scores),
    });
  });

  candidates.sort((left, right) => right.quality - left.quality);

  const picks = [];
  for (const candidate of candidates) {
    if (picks.some((picked) => tooSimilar(picked, candidate))) {
      continue;
    }

    picks.push({
      group: candidate.group,
      digits: candidate.digits,
      number: candidate.number,
    });

    if (picks.length >= count) break;
  }

  return picks;
}

export function comparePension720PickWithDraw(pick, draw) {
  const groupMatched = String(pick.group) === String(draw.group);
  const exactNumber = pick.number === draw.winningNumber;
  let suffixMatchCount = 0;

  for (let index = DIGIT_COUNT - 1; index >= 0; index -= 1) {
    if (pick.digits[index] !== draw.digits[index]) break;
    suffixMatchCount += 1;
  }

  let rank = null;
  let prizeLabel = null;

  if (groupMatched && exactNumber) {
    rank = '1등';
    prizeLabel = '월 700만원 x 20년';
  } else if (exactNumber) {
    rank = '2등';
    prizeLabel = '월 100만원 x 10년';
  } else if (suffixMatchCount >= 5) {
    rank = '3등';
    prizeLabel = '100만원';
  } else if (suffixMatchCount === 4) {
    rank = '4등';
    prizeLabel = '10만원';
  } else if (suffixMatchCount === 3) {
    rank = '5등';
    prizeLabel = '5만원';
  } else if (suffixMatchCount === 2) {
    rank = '6등';
    prizeLabel = '5천원';
  } else if (suffixMatchCount === 1) {
    rank = '7등';
    prizeLabel = '1천원';
  }

  return {
    pick,
    groupMatched,
    exactNumber,
    suffixMatchCount,
    rank,
    prizeLabel,
  };
}
