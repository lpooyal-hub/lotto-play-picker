import { checkLatestPredictionResult } from '../../../../lib/predictions';

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
    const checked = await checkLatestPredictionResult();
    return Response.json({ ok: true, checked });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return Response.json({ ok: false, error: error.message }, { status });
  }
}
