import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { comparePension720PickWithDraw, generatePension720Predictions } from './pension720Picker';
import { fetchLatestPension720Draw, fetchPension720Draws } from './pension720Store';
import { createSupabaseAdmin } from './supabase';

async function loadFallbackDraws() {
  const filePath = path.join(process.cwd(), 'data', 'pension720Draws.json');
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function loadAnalysisDraws() {
  const storedDraws = await fetchPension720Draws({ limit: null, ascending: true });
  if (storedDraws.length) {
    return storedDraws;
  }

  return loadFallbackDraws();
}

export async function fetchPension720PredictionHistory(limit = 20) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pension720_predictions')
    .select('*')
    .order('target_draw_no', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function generateWeeklyPension720Prediction() {
  const latestStoredDraw = await fetchLatestPension720Draw();
  if (!latestStoredDraw) {
    throw new Error('연금720 당첨 회차 데이터가 없습니다. 먼저 draw 데이터를 준비하세요.');
  }

  const targetDrawNo = latestStoredDraw.drawNo + 1;
  const supabase = createSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('pension720_predictions')
    .select('*')
    .eq('target_draw_no', targetDrawNo)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const draws = await loadAnalysisDraws();
  const picks = generatePension720Predictions(draws, { count: 5 });
  const { data, error } = await supabase
    .from('pension720_predictions')
    .insert({
      target_draw_no: targetDrawNo,
      picks,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkLatestPension720PredictionResult() {
  const latestStoredDraw = await fetchLatestPension720Draw();
  if (!latestStoredDraw) return [];

  const latestDrawNo = latestStoredDraw.drawNo;
  const supabase = createSupabaseAdmin();
  const { data: predictions, error: readError } = await supabase
    .from('pension720_predictions')
    .select('*')
    .lte('target_draw_no', latestDrawNo)
    .is('checked_at', null)
    .order('target_draw_no', { ascending: true });

  if (readError) throw readError;

  const checked = [];
  const storedDraws = await fetchPension720Draws({ limit: null, ascending: true });

  for (const prediction of predictions || []) {
    const draw = storedDraws.find((item) => item.drawNo === prediction.target_draw_no);
    if (!draw) continue;

    const matchResults = (prediction.picks || []).map((pick) => comparePension720PickWithDraw(pick, draw));
    const { data, error } = await supabase
      .from('pension720_predictions')
      .update({
        winning_group: draw.group,
        winning_number: draw.winningNumber,
        winning_digits: draw.digits,
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
