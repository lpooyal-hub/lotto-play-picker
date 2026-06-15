const LOTTO_API = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const LOCAL_HISTORY_URL = './lotto_history.json';
const FIRST_DRAW_DATE = new Date('2002-12-07T00:00:00+09:00');
const MAX_NUMBER = 45;
const PICK_SIZE = 6;

const state = {
  draws: [],
  loading: false,
};

const els = {
  comboCount: document.querySelector('#comboCount'),
  historyLimit: document.querySelector('#historyLimit'),
  seedInput: document.querySelector('#seedInput'),
  attemptsInput: document.querySelector('#attemptsInput'),
  generateButton: document.querySelector('#generateButton'),
  reloadButton: document.querySelector('#reloadButton'),
  statusBadge: document.querySelector('#statusBadge'),
  dataSummary: document.querySelector('#dataSummary'),
  errorMessage: document.querySelector('#errorMessage'),
  resultList: document.querySelector('#resultList'),
};

function setStatus(text) {
  els.statusBadge.textContent = text;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorMessage.hidden = !message;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  els.generateButton.disabled = isLoading;
  els.reloadButton.disabled = isLoading;
  setStatus(isLoading ? '로딩' : '준비');
}

function estimateLatestDrawNo() {
  const now = new Date();
  const diffMs = now.getTime() - FIRST_DRAW_DATE.getTime();
  const weeks = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)));
  return weeks + 1;
}

async function fetchDraw(drawNo) {
  const response = await fetch(`${LOTTO_API}${drawNo}`, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.returnValue !== 'success') {
    return null;
  }

  return {
    drawNo: Number(data.drwNo),
    numbers: [1, 2, 3, 4, 5, 6].map((idx) => Number(data[`drwtNo${idx}`])).sort((a, b) => a - b),
    bonus: Number(data.bnusNo),
  };
}

async function findLatestDrawNo() {
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

async function fetchHistory(forceReload = false) {
  if (state.draws.length && !forceReload) {
    return state.draws;
  }

  setLoading(true);
  showError('');
  els.dataSummary.textContent = '동행복권 과거 회차 데이터를 불러오는 중입니다...';

  try {
    const localDraws = await fetchLocalHistory();
    if (localDraws.length) {
      state.draws = localDraws;
      els.dataSummary.textContent = `${localDraws[0].drawNo}회 ~ ${localDraws[localDraws.length - 1].drawNo}회, 총 ${localDraws.length}개 회차를 로컬 데이터에서 불러왔습니다.`;
      return state.draws;
    }

    const latest = await findLatestDrawNo();
    const draws = [];

    for (let drawNo = 1; drawNo <= latest; drawNo += 1) {
      const draw = await fetchDraw(drawNo);
      if (draw) draws.push(draw);

      if (drawNo % 80 === 0 || drawNo === latest) {
        els.dataSummary.textContent = `${drawNo}/${latest}회차 확인 중...`;
      }
    }

    if (!draws.length) {
      throw new Error('회차 데이터를 불러오지 못했습니다.');
    }

    state.draws = draws;
    els.dataSummary.textContent = `${draws[0].drawNo}회 ~ ${draws[draws.length - 1].drawNo}회, 총 ${draws.length}개 회차를 불러왔습니다.`;
    return state.draws;
  } catch (error) {
    const message =
      '브라우저에서 동행복권 API 접근이 차단됐을 수 있습니다. 로컬에서는 Python 스크립트를 사용하거나, 나중에 작은 프록시 API를 붙이면 안정적으로 웹에서 사용할 수 있습니다.';
    showError(`${message} (${error.message})`);
    els.dataSummary.textContent = '데이터 로딩 실패';
    return [];
  } finally {
    setLoading(false);
  }
}

async function fetchLocalHistory() {
  try {
    const response = await fetch(`${LOCAL_HISTORY_URL}?t=${Date.now()}`);
    if (!response.ok) return [];

    const data = await response.json();
    const rawDraws = Array.isArray(data) ? data : data.draws;
    if (!Array.isArray(rawDraws)) return [];

    return rawDraws
      .map((draw) => ({
        drawNo: Number(draw.drawNo ?? draw.draw_no),
        numbers: [...(draw.numbers || [])].map(Number).sort((a, b) => a - b),
        bonus: Number(draw.bonus),
      }))
      .filter((draw) => Number.isFinite(draw.drawNo) && draw.numbers.length === 6);
  } catch {
    return [];
  }
}

function createSeededRandom(seed) {
  if (!Number.isFinite(seed)) {
    return Math.random;
  }

  let value = Math.floor(seed) % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function countValues(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function normalizeScores(rawScores) {
  const values = [...rawScores.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  const normalized = new Map();

  for (const [key, value] of rawScores.entries()) {
    normalized.set(key, (value - min) / span);
  }

  return normalized;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values) {
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance) || 1;
}

function buildNumberScores(draws) {
  const allNumbers = draws.flatMap((draw) => draw.numbers);
  const frequency = countValues(allNumbers);

  const recentCutoff = Math.max(12, Math.min(80, Math.floor(draws.length / 8)));
  const recentDraws = draws.slice(-recentCutoff);
  const recentFrequency = countValues(recentDraws.flatMap((draw) => draw.numbers));

  const gaps = new Map();
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const reversedIndex = [...draws].reverse().findIndex((draw) => draw.numbers.includes(number));
    gaps.set(number, reversedIndex >= 0 ? reversedIndex + 1 : draws.length + 1);
  }

  const rawFrequency = new Map();
  const rawRecent = new Map();
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    rawFrequency.set(number, frequency.get(number) || 0);
    rawRecent.set(number, recentFrequency.get(number) || 0);
  }

  const normalizedFrequency = normalizeScores(rawFrequency);
  const normalizedRecent = normalizeScores(rawRecent);
  const normalizedGap = normalizeScores(gaps);
  const scores = new Map();

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    scores.set(
      number,
      (normalizedFrequency.get(number) || 0) * 0.46 +
        (normalizedRecent.get(number) || 0) * 0.34 +
        (normalizedGap.get(number) || 0) * 0.2,
    );
  }

  return scores;
}

function buildPairScores(draws) {
  const pairs = new Map();

  for (const draw of draws) {
    for (let i = 0; i < draw.numbers.length; i += 1) {
      for (let j = i + 1; j < draw.numbers.length; j += 1) {
        const key = `${draw.numbers[i]}-${draw.numbers[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  const max = Math.max(...pairs.values(), 1);
  const normalized = new Map();
  for (const [key, value] of pairs.entries()) {
    normalized.set(key, value / max);
  }
  return normalized;
}

function weightedSampleWithoutReplacement(weights, count, rng) {
  const pool = Array.from({ length: MAX_NUMBER }, (_, idx) => idx + 1);
  const picked = [];

  for (let i = 0; i < count; i += 1) {
    const total = pool.reduce((acc, number) => acc + Math.max(weights.get(number) || 0, 0.001), 0);
    let cursor = rng() * total;

    for (const number of pool) {
      cursor -= Math.max(weights.get(number) || 0, 0.001);
      if (cursor <= 0) {
        picked.push(number);
        pool.splice(pool.indexOf(number), 1);
        break;
      }
    }
  }

  return picked;
}

function countConsecutivePairs(numbers) {
  let count = 0;
  for (let i = 0; i < numbers.length - 1; i += 1) {
    if (numbers[i + 1] - numbers[i] === 1) count += 1;
  }
  return count;
}

function combinationQuality(numbers, numberScores, pairScores, historicalSums) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const oddCount = sorted.filter((number) => number % 2).length;
  const lowCount = sorted.filter((number) => number <= 22).length;
  const totalSum = sorted.reduce((acc, number) => acc + number, 0);

  const medianSum = median(historicalSums);
  const sumStdev = stdev(historicalSums);
  const sumScore = Math.max(0, 1 - Math.abs(totalSum - medianSum) / (sumStdev * 2.2));

  const baseScore = mean(sorted.map((number) => numberScores.get(number) || 0));
  const pairValues = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      pairValues.push(pairScores.get(`${sorted[i]}-${sorted[j]}`) || 0);
    }
  }

  let balanceScore = 1;
  if (![2, 3, 4].includes(oddCount)) balanceScore -= 0.25;
  if (![2, 3, 4].includes(lowCount)) balanceScore -= 0.2;

  const lastDigitPenalty = (PICK_SIZE - new Set(sorted.map((number) => number % 10)).size) * 0.03;
  const consecutivePenalty = countConsecutivePairs(sorted) * 0.08;

  return (
    baseScore * 0.42 +
    mean(pairValues) * 0.2 +
    sumScore * 0.22 +
    balanceScore * 0.16 -
    consecutivePenalty -
    lastDigitPenalty
  );
}

function generateCombinations(draws, { count, attempts, seed }) {
  const rng = createSeededRandom(seed);
  const numberScores = buildNumberScores(draws);
  const pairScores = buildPairScores(draws);
  const historicalSums = draws.map((draw) => draw.numbers.reduce((acc, number) => acc + number, 0));
  const historicalSets = new Set(draws.map((draw) => draw.numbers.join(',')));
  const candidates = [];

  for (let i = 0; i < attempts; i += 1) {
    const combo = weightedSampleWithoutReplacement(numberScores, PICK_SIZE, rng).sort((a, b) => a - b);
    const key = combo.join(',');
    if (historicalSets.has(key)) continue;

    candidates.push({
      combo,
      quality: combinationQuality(combo, numberScores, pairScores, historicalSums),
    });
  }

  candidates.sort((a, b) => b.quality - a.quality);

  const result = [];
  const usage = new Map();
  for (const candidate of candidates) {
    if (result.length >= count) break;
    if (result.some((existing) => candidate.combo.filter((number) => existing.includes(number)).length >= 4)) {
      continue;
    }
    if (candidate.combo.some((number) => (usage.get(number) || 0) >= 2)) {
      continue;
    }

    result.push(candidate.combo);
    for (const number of candidate.combo) {
      usage.set(number, (usage.get(number) || 0) + 1);
    }
  }

  return result.length ? result : candidates.slice(0, count).map((candidate) => candidate.combo);
}

function ballTier(number) {
  if (number <= 10) return 1;
  if (number <= 20) return 2;
  if (number <= 30) return 3;
  if (number <= 40) return 4;
  return 5;
}

function renderResults(combos) {
  if (!combos.length) {
    els.resultList.innerHTML = '<li class="empty-state">생성할 수 있는 조합이 없습니다.</li>';
    return;
  }

  els.resultList.innerHTML = combos
    .map(
      (combo, index) => `
        <li class="result-item">
          <div class="result-meta">
            <span>Pick ${index + 1}</span>
            <span>sum ${combo.reduce((acc, number) => acc + number, 0)}</span>
          </div>
          <div class="numbers">
            ${combo
              .map((number) => `<span class="ball tier-${ballTier(number)}">${String(number).padStart(2, '0')}</span>`)
              .join('')}
          </div>
        </li>
      `,
    )
    .join('');
}

function getVisibleDraws(draws) {
  const value = els.historyLimit.value;
  if (value === 'all') return draws;
  return draws.slice(-Number(value));
}

async function handleGenerate() {
  const draws = await fetchHistory(false);
  if (!draws.length) return;

  const visibleDraws = getVisibleDraws(draws);
  const count = Math.max(1, Math.min(20, Number(els.comboCount.value) || 5));
  const attempts = Math.max(500, Number(els.attemptsInput.value) || 3000);
  const seedText = els.seedInput.value.trim();
  const seed = seedText ? Number(seedText) : NaN;

  setStatus('계산');
  await new Promise((resolve) => setTimeout(resolve, 20));

  const combos = generateCombinations(visibleDraws, { count, attempts, seed });
  renderResults(combos);

  const first = visibleDraws[0];
  const last = visibleDraws[visibleDraws.length - 1];
  els.dataSummary.textContent = `${first.drawNo}회 ~ ${last.drawNo}회, ${visibleDraws.length}개 회차를 기준으로 계산했습니다.`;
  setStatus('완료');
}

els.generateButton.addEventListener('click', handleGenerate);
els.reloadButton.addEventListener('click', async () => {
  await fetchHistory(true);
});
