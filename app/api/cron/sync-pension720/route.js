import { fetchLatestPension720Draw, savePension720Draws } from '../../../../lib/pension720Store';
import { syncPension720Draws } from '../../../../lib/pension720';

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

    const result = await syncPension720Draws({
      fetchLatest: fetchLatestPension720Draw,
      saveDraws: savePension720Draws,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return Response.json({ ok: false, error: error.message }, { status });
  }
}
