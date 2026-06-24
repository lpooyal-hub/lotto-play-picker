import { createSupabaseAdmin } from './supabase';

function normalizePension720Draw(row) {
  return {
    drawNo: Number(row.draw_no),
    group: String(row.draw_group),
    winningNumber: String(row.winning_number).padStart(6, '0'),
    digits: Array.isArray(row.digits) ? row.digits.map((digit) => Number(digit)) : [],
    drawDate: row.draw_date || null,
  };
}

export async function fetchPension720Draws({ limit = 30, ascending = false } = {}) {
  const supabase = createSupabaseAdmin();
  let query = supabase.from('pension720_draws').select('*').order('draw_no', { ascending });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(normalizePension720Draw);
}

export async function fetchLatestPension720Draw() {
  const rows = await fetchPension720Draws({ limit: 1, ascending: false });
  return rows[0] || null;
}

export async function savePension720Draws(draws) {
  if (!draws.length) return [];

  const supabase = createSupabaseAdmin();
  const rows = draws.map((draw) => ({
    draw_no: draw.drawNo,
    draw_group: String(draw.group),
    winning_number: String(draw.winningNumber).padStart(6, '0'),
    digits: draw.digits.map((digit) => Number(digit)),
    draw_date: draw.drawDate || null,
  }));

  const { data, error } = await supabase
    .from('pension720_draws')
    .upsert(rows, { onConflict: 'draw_no' })
    .select('*')
    .order('draw_no', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizePension720Draw);
}
