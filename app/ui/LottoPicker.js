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

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`서버가 빈 응답을 반환했습니다. (${response.status})`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`서버 응답을 JSON으로 읽지 못했습니다. (${response.status})`);
  }
}

export default function LottoPicker() {
  const [status, setStatus] = useState('불러오는 중');
  const [summary, setSummary] = useState('이번 주 추천 기록을 불러오는 중입니다.');
  const [error, setError] = useState('');
  const [predictions, setPredictions] = useState([]);

  async function loadPredictions() {
    setStatus('불러오는 중');
    setError('');
    try {
      const response = await fetch('/api/predictions');
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || '추천 기록 조회 실패');
      }

      const nextPredictions = data.predictions || [];
      setPredictions(nextPredictions);
      setSummary(
        nextPredictions.length
          ? `${nextPredictions[0].target_draw_no}회차 추천 기록을 불러왔습니다.`
          : '아직 저장된 추천 기록이 없습니다. Vercel Cron 또는 수동 cron 호출로 첫 추천을 생성하세요.',
      );
      setStatus(nextPredictions.length ? '준비 완료' : '기록 없음');
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
              <p className="panel-kicker">Weekly Picks</p>
              <h2>이번 주 저장된 추천</h2>
            </div>
            <span className="status-badge">{status}</span>
          </div>

          <p className="summary">
            Vercel Cron이 매주 한 번 전체 회차 데이터를 분석해 Supabase에 추천 번호 5조합을 저장합니다.
            화면은 저장된 추천과 추첨 후 검증 결과만 불러옵니다.
          </p>

          <div className="actions">
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
              <h2>{predictions[0] ? `${predictions[0].target_draw_no}회차 추천` : '추천 대기'}</h2>
            </div>
          </div>

          <ol className="result-list">
            {predictions[0]?.picks?.length ? (
              predictions[0].picks.map((pick, index) => (
                <li key={pick.join('-')} className="result-item">
                  <div className="result-meta">
                    <span>Pick {index + 1}</span>
                    <span>sum {pick.reduce((acc, number) => acc + number, 0)}</span>
                  </div>
                  <NumberBalls numbers={pick} />
                </li>
              ))
            ) : (
              <li className="empty-state">아직 저장된 추천 번호가 없습니다.</li>
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
