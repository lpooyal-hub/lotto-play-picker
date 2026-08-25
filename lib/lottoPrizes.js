const FIXED_PRIZE_AMOUNTS = {
  '4등': 50000,
  '5등': 5000,
};

const VARIABLE_PRIZE_RANKS = new Set(['1등', '2등', '3등']);

export function resolvePrizeAmount(rank, prizeAmount) {
  const storedAmount = Number(prizeAmount);
  if (Number.isFinite(storedAmount) && storedAmount > 0) return storedAmount;
  return FIXED_PRIZE_AMOUNTS[rank] || 0;
}

export function hasUnresolvedVariablePrize(matchResults) {
  return (matchResults || []).some(
    (result) => VARIABLE_PRIZE_RANKS.has(result?.rank) && !resolvePrizeAmount(result.rank, result.prizeAmount),
  );
}
