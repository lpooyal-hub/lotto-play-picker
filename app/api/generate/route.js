import { fetchHistory } from '../../../lib/dhlottery';
import { generateCombinations } from '../../../lib/picker';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const count = Math.max(1, Math.min(20, Number(body.count) || 5));
  const historyLimit = Math.max(80, Math.min(1000, Number(body.historyLimit) || 300));
  const attempts = Math.max(500, Math.min(20000, Number(body.attempts) || 3000));
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined;

  const draws = await fetchHistory({ limit: historyLimit });
  const picks = generateCombinations(draws, { count, attempts, seed });

  return Response.json({
    picks,
    history: {
      firstDraw: draws[0]?.drawNo,
      latestDraw: draws[draws.length - 1]?.drawNo,
      count: draws.length,
    },
  });
}
