import { fetchPension720PredictionHistory } from '../../../../lib/pension720Predictions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const predictions = await fetchPension720PredictionHistory();
    return Response.json({ predictions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { predictions: [], error: error.message },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
