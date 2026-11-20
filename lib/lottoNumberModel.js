export const MAX_NUMBER = 45;
export const PICK_SIZE = 6;

const BASE_NUMBER_RATE = PICK_SIZE / MAX_NUMBER;
const RECENT_DECAY = 2 ** (-1 / 104);
const RECENT_SHARE = 0.25;
const VALIDATION_BLOCK_SIZE = 104;
const MIN_TRAINING_DRAWS = 100;

function smoothedRate(count, weight, priorStrength) {
  return (count + priorStrength * BASE_NUMBER_RATE) / (weight + priorStrength);
}

function blendRates(allTimeRate, recentRate) {
  return (1 - RECENT_SHARE) * allTimeRate + RECENT_SHARE * recentRate;
}

export function buildNumberRates(draws) {
  const allTimeCounts = new Float64Array(MAX_NUMBER + 1);
  const recentCounts = new Float64Array(MAX_NUMBER + 1);
  const validationStart = draws.length - 2 * VALIDATION_BLOCK_SIZE;
  const canValidate = validationStart >= MIN_TRAINING_DRAWS;
  const validation = Array.from({ length: 2 }, () => ({ againstUniform: 0, againstAllTime: 0 }));
  let recentWeight = 0;

  draws.forEach(({ numbers }, index) => {
    // Score each draw before adding its winning numbers to the history.
    if (canValidate && index >= validationStart) {
      const block = validation[Math.floor((index - validationStart) / VALIDATION_BLOCK_SIZE)];
      const winningNumbers = new Set(numbers);
      for (let number = 1; number <= MAX_NUMBER; number += 1) {
        const observed = winningNumbers.has(number) ? 1 : 0;
        const allTimeRate = smoothedRate(allTimeCounts[number], index, 24);
        const recentRate = smoothedRate(recentCounts[number], recentWeight, 16);
        const blendedError = (blendRates(allTimeRate, recentRate) - observed) ** 2;
        block.againstUniform += blendedError - (BASE_NUMBER_RATE - observed) ** 2;
        block.againstAllTime += blendedError - (allTimeRate - observed) ** 2;
      }
    }

    for (let number = 1; number <= MAX_NUMBER; number += 1) {
      recentCounts[number] *= RECENT_DECAY;
    }
    for (const number of numbers) {
      allTimeCounts[number] += 1;
      recentCounts[number] += 1;
    }
    recentWeight = recentWeight * RECENT_DECAY + 1;
  });

  const useRecent =
    canValidate && validation.every(({ againstUniform, againstAllTime }) => againstUniform < 0 && againstAllTime < 0);
  const allTimeRates = new Map();
  const numberRates = new Map();
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const allTimeRate = smoothedRate(allTimeCounts[number], draws.length, 24);
    const recentRate = smoothedRate(recentCounts[number], recentWeight, 16);
    allTimeRates.set(number, allTimeRate);
    numberRates.set(number, useRecent ? blendRates(allTimeRate, recentRate) : allTimeRate);
  }

  return { allTimeRates, numberRates };
}
