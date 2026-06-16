import { createSupabaseAdmin } from './supabase';

const MIN_ANALYSIS_DRAWS = 100;

function normalizeDraw(row) {
  return {
    drawNo: Number(row.draw_no),
    numbers: row.numbers,
    bonus: Number(row.bonus_number),
    drawDate: row.draw_date,
  };
}

export async function fetchStoredDraws() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('lotto_draws')
    .select('*')
    .order('draw_no', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeDraw);
}

export async function fetchLatestStoredDraw() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('lotto_draws')
    .select('*')
    .order('draw_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeDraw(data) : null;
}

export async function saveDraws(draws) {
  if (!draws.length) return [];

  const supabase = createSupabaseAdmin();
  const rows = draws.map((draw) => ({
    draw_no: draw.drawNo,
    numbers: draw.numbers,
    bonus_number: draw.bonus,
    draw_date: draw.drawDate || null,
  }));

  const { data, error } = await supabase
    .from('lotto_draws')
    .upsert(rows, { onConflict: 'draw_no' })
    .select('*')
    .order('draw_no', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeDraw);
}

export function assertEnoughDraws(draws) {
  if (draws.length < MIN_ANALYSIS_DRAWS) {
    throw new Error(
      `Not enough cached lotto draw history. Need at least ${MIN_ANALYSIS_DRAWS} draws, found ${draws.length}. Run draw sync first.`,
    );
  }
}
