import { fetchPension720Draws } from '../../../../lib/pension720Store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const draws = await fetchPension720Draws({ limit: 30, ascending: false });
    return Response.json({ draws }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ draws: [], error: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
