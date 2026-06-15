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
      'User-Agent': 'lotto-play-picker/0.1',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Dhlottery HTTP ${response.status}`);
  }

  const data = await response.json();
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

  while (candidate > 1) {
    const draw = await fetchDraw(candidate);
    if (draw) break;
    candidate -= 1;
  }

  while (await fetchDraw(candidate + 1)) {
    candidate += 1;
  }

  return candidate;
}

export async function fetchHistory({ limit = 300 } = {}) {
  const latest = await findLatestDrawNo();
  const start = Math.max(1, latest - limit + 1);
  const draws = [];

  for (let drawNo = start; drawNo <= latest; drawNo += 1) {
    const draw = await fetchDraw(drawNo);
    if (draw) draws.push(draw);
  }

  return draws;
}
