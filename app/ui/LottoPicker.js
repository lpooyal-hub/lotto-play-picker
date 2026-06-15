'use client';

import { useEffect, useState } from 'react';

function ballTier(number) {
  if (number <= 10) return 1;
  if (number <= 20) return 2;
  if (number <= 30) return 3;
  if (number <= 40) return 4;
  return 5;
}

function NumberBalls({ numbers }) {
  return (
    <div className="numbers">
      {numbers.map((number) => (
        <span key={number} className={`ball tier-${ballTier(number)}`}>
          {String(number).padStart(2, '0')}
        </span>
      ))}
    </div>
  );
}

export default function LottoPicker() {
  const [count, setCount] = useState(5);
  const [historyLimit, setHistoryLimit] = useState(300);
  const [seed, setSeed] = useState('');
  const [attempts, setAttempts] = useState(3000);
  const [status, setStatus] = useState('대기');
  const [summary, setSummary] = useState('아직 번호를 생성하지 않았습니다.');
  const [error, setError] = useState('');
  const [picks, setPicks] = useState([]);
  const [predictions, setPredictions] = useState([]);

  async function loadPredictions() {
    const response = await fetch('/api/predictions');
    const data = await response.json();
    setPredictions(data.predictions || []);
  }

  async function generate() {
    setStatus('계산');
    setError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          historyLimit,
          attempts,
          seed: seed ? Number(seed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '번호 생성 실패');
      }

      setPicks(data.picks || []);
      setSummary(
        `${data.history.firstDraw}회 ~ ${data.history.latestDraw}회, ${data.history.count}개 회차 기준으로 계산했습니다.`,
      );
      setStatus('완료');
    } catch (err) {
      setStatus('오류');
      setError(err.message);
    }
  }

  useEffect(() => {
    loadPredictions().catch(() => undefined);
  }, []);

  return (
    <>
      <section className="tool-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Settings</p>
              <h2>이번 주 조합 만들기</h2>
            </div>
            <span className="status-badge">{status}</span>
          </div>

          <div className="field-grid">
            <label>
              조합 수
              <input type="number" min="1" max="20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </label>

            <label>
              분석 회차
              <select value={historyLimit} onChange={(e) => setHistoryLimit(Number(e.target.value))}>
                <option value="500">최근 500회</option>
                <option value="300">최근 300회</option>
                <option value="150">최근 150회</option>
                <option value="80">최근 80회</option>
              </select>
            </label>

            <label>
              랜덤 시드
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="비우면 매번 다르게" />
            </label>

            <label>
              후보 탐색 수
              <input
                type="number"
                min="500"
                max="20000"
                step="500"
                value={attempts}
                onChange={(e) => setAttempts(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="actions">
            <button type="button" onClick={generate} disabled={status === '계산'}>
              번호 생성
            </button>
            <button className="secondary" type="button" onClick={loadPredictions}>
              기록 새로고침
            </button>
          </div>

          <p className="summary">{summary}</p>
          {error ? <p className="error-message">{error}</p> : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Picks</p>
              <h2>추천 조합</h2>
            </div>
          </div>

          <ol className="result-list">
            {picks.length ? (
              picks.map((pick, index) => (
                <li key={pick.join('-')} className="result-item">
                  <div className="result-meta">
                    <span>Pick {index + 1}</span>
                    <span>sum {pick.reduce((acc, number) => acc + number, 0)}</span>
                  </div>
                  <NumberBalls numbers={pick} />
                </li>
              ))
            ) : (
              <li className="empty-state">번호 생성 버튼을 눌러주세요.</li>
            )}
          </ol>
        </article>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">History</p>
            <h2>저장된 추천 기록</h2>
          </div>
        </div>

        <div className="history-list">
          {predictions.length ? (
            predictions.map((prediction) => (
              <article key={prediction.id} className="history-card">
                <header>
                  <span>{prediction.target_draw_no}회차 추천</span>
                  <span>{prediction.checked_at ? '결과 확인 완료' : '결과 대기'}</span>
                </header>
                {(prediction.picks || []).slice(0, 5).map((pick) => (
                  <NumberBalls key={pick.join('-')} numbers={pick} />
                ))}
              </article>
            ))
          ) : (
            <div className="empty-state">Supabase에 저장된 추천 기록이 아직 없습니다.</div>
          )}
        </div>
      </section>
    </>
  );
}
