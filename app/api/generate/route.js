import { fetchHistory } from '../../../lib/dhlottery';
import { assertEnoughDraws, fetchStoredDraws, saveDraws } from '../../../lib/drawStore';
import { generateCombinations } from '../../../lib/picker';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.max(1, Math.min(20, Number(body.count) || 5));

    let draws = await fetchStoredDraws();
    if (!draws.length) {
      draws = await fetchHistory();
      await saveDraws(draws);
    }
    assertEnoughDraws(draws);

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
