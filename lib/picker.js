import { resolvePrizeAmount } from './lottoPrizes';

export { generateCombinations, LOTTO_MODEL_VERSION } from './lottoModel';

export function comparePickWithDraw(pick, draw) {
  const matchCount = pick.filter((number) => draw.numbers.includes(number)).length;
  const bonusMatched = pick.includes(draw.bonus);
  let rank = null;

  if (matchCount === 6) rank = '1등';
  else if (matchCount === 5 && bonusMatched) rank = '2등';
  else if (matchCount === 5) rank = '3등';
  else if (matchCount === 4) rank = '4등';
  else if (matchCount === 3) rank = '5등';

  return {
    pick,
    matchCount,
    bonusMatched,
    rank,
    prizeAmount: resolvePrizeAmount(rank, draw.prizes?.[rank]?.amount),
  };
}
