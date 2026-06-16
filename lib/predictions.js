import { fetchDraw, fetchHistory, findLatestDrawNo } from './dhlottery';
import { assertEnoughDraws, fetchLatestStoredDraw, fetchStoredDraws, saveDraws } from './drawStore';
import { comparePickWithDraw, generateCombinations } from './picker';
import { createSupabaseAdmin } from './supabase';

async function loadAnalysisDraws() {
  const storedDraws = await fetchStoredDraws();
  if (storedDraws.length) {
    assertEnoughDraws(storedDraws);
    return storedDraws;
  }

  const fetchedDraws = await fetchHistory();
  await saveDraws(fetchedDraws);
  return fetchedDraws;
}

export async function generateWeeklyPrediction() {
  const latestStoredDraw = await fetchLatestStoredDraw();
  const latestDrawNo = latestStoredDraw?.drawNo || (await findLatestDrawNo());
  const targetDrawNo = latestDrawNo + 1;
  const supabase = createSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from('lotto_predictions')
    .select('*')
    .eq('target_draw_no', targetDrawNo)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const draws = await loadAnalysisDraws();
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
  const latestStoredDraw = await fetchLatestStoredDraw();
  const latestDrawNo = latestStoredDraw?.drawNo || (await findLatestDrawNo());
  const supabase = createSupabaseAdmin();
  const { data: predictions, error: readError } = await supabase
    .from('lotto_predictions')
    .select('*')
    .lte('target_draw_no', latestDrawNo)
    .is('checked_at', null)
    .order('target_draw_no', { ascending: true });

  if (readError) throw readError;

  const checked = [];
  const storedDraws = await fetchStoredDraws();
  for (const prediction of predictions || []) {
    const storedDraw = storedDraws.find((item) => item.drawNo === prediction.target_draw_no);
    const draw = storedDraw || (await fetchDraw(prediction.target_draw_no));
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
