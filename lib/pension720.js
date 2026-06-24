const PENSION720_RESULT_URL = 'https://www.dhlottery.co.kr/pt720/result';

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractResultBlocks(html) {
  return html
    .split(/<div class="resultWrap[^"]*">/g)
    .slice(1)
    .map((block) => block.split('<div class="resultWrap')[0]);
}

function normalizeDrawDate(value) {
  const match = value.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseBlock(block) {
  const drawMatch = block.match(/result-txt[\s\S]*?color-g[^>]*>\s*(\d+)\s*</);
  const dateMatch = block.match(/result-date[^>]*>\s*([^<]+)\s*</);
  const numberBoxMatch = block.match(/result-numBox[\s\S]*?<\/div>/);

  if (!drawMatch || !numberBoxMatch) return null;

  const digitMatches = [...numberBoxMatch[0].matchAll(/class="num[^"]*"[^>]*>\s*(\d)\s*</g)].map((match) =>
    Number(match[1]),
  );

  if (digitMatches.length < 7) return null;

  const [group, ...digits] = digitMatches;
  if (digits.length !== 6) return null;

  return {
    drawNo: Number(drawMatch[1]),
    drawDate: normalizeDrawDate(stripTags(dateMatch?.[1] || '')),
    group: String(group),
    winningNumber: digits.join(''),
    digits,
  };
}

export async function fetchRecentPension720Draws() {
  const response = await fetch(PENSION720_RESULT_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Pension720 HTTP ${response.status}`);
  }

  const html = await response.text();
  const draws = extractResultBlocks(html)
    .map(parseBlock)
    .filter(Boolean)
    .sort((left, right) => left.drawNo - right.drawNo);

  if (!draws.length) {
    throw new Error('Could not parse pension720 results page.');
  }

  return draws;
}

export async function syncPension720Draws({ fetchLatest, saveDraws }) {
  const existingLatest = await fetchLatest();
  const recentDraws = await fetchRecentPension720Draws();

  if (!existingLatest) {
    const saved = await saveDraws(recentDraws);
    return {
      synced: saved.length,
      firstDraw: saved[0]?.drawNo ?? null,
      latestDraw: saved[saved.length - 1]?.drawNo ?? null,
    };
  }

  const missingDraws = recentDraws.filter((draw) => draw.drawNo > existingLatest.drawNo);
  const saved = await saveDraws(missingDraws);

  return {
    synced: saved.length,
    firstDraw: saved[0]?.drawNo ?? null,
    latestDraw: saved[saved.length - 1]?.drawNo ?? existingLatest.drawNo,
  };
}
