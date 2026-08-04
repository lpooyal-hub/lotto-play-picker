import { fetchDraw, fetchHistory } from './dhlottery';
import { fetchLatestStoredDraw, saveDraws } from './drawStore';

export async function syncDrawHistory() {
  const latestStoredDraw = await fetchLatestStoredDraw();

  if (!latestStoredDraw) {
    const history = await fetchHistory();
    const saved = await saveDraws(history);
    return {
      synced: saved.length,
      firstDraw: saved[0]?.drawNo ?? null,
      latestDraw: saved[saved.length - 1]?.drawNo ?? null,
    };
  }

  const missingDraws = [];
  let nextDrawNo = latestStoredDraw.drawNo + 1;

  while (true) {
    const draw = await fetchDraw(nextDrawNo);
    if (!draw) break;
    missingDraws.push(draw);
    nextDrawNo += 1;
  }

  const saved = missingDraws.length ? await saveDraws(missingDraws) : [];
  return {
    synced: saved.length,
    firstDraw: saved[0]?.drawNo ?? null,
    latestDraw: saved[saved.length - 1]?.drawNo ?? latestStoredDraw.drawNo,
  };
}
