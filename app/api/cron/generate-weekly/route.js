import { generateWeeklyPrediction } from '../../../../lib/predictions';

function assertCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const provided = request.headers.get('authorization')?.replace('Bearer ', '');
  if (provided !== secret && request.headers.get('user-agent') !== 'vercel-cron/1.0') {
    throw new Error('Unauthorized');
  }
}

export async function GET(request) {
  try {
    assertCronRequest(request);
    const prediction = await generateWeeklyPrediction();
    return Response.json({ ok: true, prediction });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return Response.json({ ok: false, error: error.message }, { status });
  }
}
