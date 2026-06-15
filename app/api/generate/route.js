import { fetchHistory } from '../../../lib/dhlottery';
import { generateCombinations } from '../../../lib/picker';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.max(1, Math.min(20, Number(body.count) || 5));

    const draws = await fetchHistory();
    const picks = generateCombinations(draws, { count });

    return Response.json({
      picks,
      history: {
        firstDraw: draws[0]?.drawNo,
        latestDraw: draws[draws.length - 1]?.drawNo,
        count: draws.length,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message || 'Failed to generate lotto picks.',
      },
      { status: 500 },
    );
  }
}
