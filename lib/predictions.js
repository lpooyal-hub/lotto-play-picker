import { fetchDraw, fetchHistory, findLatestDrawNo } from './dhlottery';
import { comparePickWithDraw, generateCombinations } from './picker';
import { createSupabaseAdmin } from './supabase';

export async function generateWeeklyPrediction() {
  const latestDrawNo = await findLatestDrawNo();
  const targetDrawNo = latestDrawNo + 1;
  const supabase = createSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from('lotto_predictions')
    .select('*')
    .eq('target_draw_no', targetDrawNo)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const draws = await fetchHistory();
  const picks = generateCombinations(draws, {
    count: 5,
  });

  const { data, error } = await supabase
    .from('lotto_predictions')
    .insert(
      {
        target_draw_no: targetDrawNo,
        picks,
        generated_at: new Date().toISOString(),
      },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkLatestPredictionResult() {
  const latestDrawNo = await findLatestDrawNo();
  const supabase = createSupabaseAdmin();
  const { data: predictions, error: readError } = await supabase
    .from('lotto_predictions')
    .select('*')
    .lte('target_draw_no', latestDrawNo)
    .is('checked_at', null)
    .order('target_draw_no', { ascending: true });

  if (readError) throw readError;

  const checked = [];
  for (const prediction of predictions || []) {
    const draw = await fetchDraw(prediction.target_draw_no);
    if (!draw) continue;

    const matchResults = prediction.picks.map((pick) => comparePickWithDraw(pick, draw));
    const { data, error } = await supabase
      .from('lotto_predictions')
      .update({
        winning_numbers: draw.numbers,
        bonus_number: draw.bonus,
        match_results: matchResults,
        checked_at: new Date().toISOString(),
      })
      .eq('id', prediction.id)
      .select()
      .single();

    if (error) throw error;
    checked.push(data);
  }

  return checked;
}
