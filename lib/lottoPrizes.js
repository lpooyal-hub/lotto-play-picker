const FIXED_PRIZE_AMOUNTS = {
  '5등': 5000,
};

export function resolvePrizeAmount(rank, prizeAmount) {
  const storedAmount = Number(prizeAmount);
  if (Number.isFinite(storedAmount) && storedAmount > 0) return storedAmount;
  return FIXED_PRIZE_AMOUNTS[rank] || 0;
}
