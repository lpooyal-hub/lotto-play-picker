const LOTTO_API = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const FIRST_DRAW_DATE = new Date('2002-12-07T00:00:00+09:00');

export function estimateLatestDrawNo() {
  const now = new Date();
  const diffMs = now.getTime() - FIRST_DRAW_DATE.getTime();
  const weeks = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)));
  return weeks + 1;
}

export async function fetchDraw(drawNo) {
  const response = await fetch(`${LOTTO_API}${drawNo}`, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Dhlottery HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (data.returnValue !== 'success') {
    return null;
  }

  return {
    drawNo: Number(data.drwNo),
    numbers: [1, 2, 3, 4, 5, 6].map((idx) => Number(data[`drwtNo${idx}`])).sort((a, b) => a - b),
    bonus: Number(data.bnusNo),
    drawDate: data.drwNoDate,
  };
}

export async function findLatestDrawNo() {
  let candidate = estimateLatestDrawNo();
  const minCandidate = Math.max(1, candidate - 80);

  while (candidate >= minCandidate) {
    const draw = await fetchDraw(candidate).catch(() => null);
    if (draw) break;
    candidate -= 1;
  }

  if (candidate < minCandidate) {
    throw new Error('Could not determine latest lotto draw number.');
  }

  while (await fetchDraw(candidate + 1).catch(() => null)) {
    candidate += 1;
  }

  return candidate;
}

export async function fetchHistory({ limit = 300 } = {}) {
  const latest = await findLatestDrawNo();
  const start = Math.max(1, latest - limit + 1);
  const draws = [];

  const drawNumbers = Array.from({ length: latest - start + 1 }, (_, index) => start + index);
  const batchSize = 12;

  for (let index = 0; index < drawNumbers.length; index += batchSize) {
    const batch = drawNumbers.slice(index, index + batchSize);
    const batchDraws = await Promise.all(batch.map((drawNo) => fetchDraw(drawNo).catch(() => null)));
    draws.push(...batchDraws.filter(Boolean));
  }

  if (!draws.length) {
    throw new Error('No lottery draw history could be fetched.');
  }

  return draws;
}
