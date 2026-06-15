import { createSupabaseAdmin } from '../../../lib/supabase';

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('lotto_predictions')
      .select('*')
      .order('target_draw_no', { ascending: false })
      .limit(20);

    if (error) throw error;
    return Response.json({ predictions: data || [] });
  } catch (error) {
    return Response.json({ predictions: [], error: error.message }, { status: 200 });
  }
}
