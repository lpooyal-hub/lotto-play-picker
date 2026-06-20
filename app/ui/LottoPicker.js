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

function formatCheckedAt(value) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function MatchBadge({ result }) {
  if (!result) return null;

  const label = result.rank || `${result.matchCount}개 일치${result.bonusMatched ? ' + 보너스' : ''}`;
  const tone = result.rank ? 'strong' : result.matchCount === 3 ? 'warm' : result.matchCount >= 1 ? 'soft' : 'muted';

  return <span className={`match-badge ${tone}`}>{label}</span>;
}

function formatPrizeAmount(value) {
  if (!value) return '';

  try {
    return new Intl.NumberFormat('ko-KR').format(value);
  } catch {
    return String(value);
  }
}

function WinningSummary({ prediction }) {
  if (!prediction?.winning_numbers?.length) return null;

  return (
    <div className="winning-summary">
      <div className="winning-summary-header">
        <span>실제 당첨번호</span>
        {prediction.checked_at ? <span>{formatCheckedAt(prediction.checked_at)} 확인</span> : null}
      </div>
      <div className="winning-row">
        <NumberBalls numbers={prediction.winning_numbers} />
        <div className="bonus-pill">
          <span>보너스</span>
          <span className={`ball tier-${ballTier(prediction.bonus_number)}`}>{String(prediction.bonus_number).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
}

function PredictionPickCard({ pick, index, result, showResult = false }) {
  return (
    <li key={pick.join('-')} className="result-item">
                  <div className="result-meta">
                    <span>Pick {index + 1}</span>
                    <div className="result-meta-right">
                      {showResult ? <MatchBadge result={result} /> : null}
                      {showResult && result?.rank && result?.prizeAmount ? (
                        <span className="prize-chip">{formatPrizeAmount(result.prizeAmount)}원</span>
                      ) : null}
                      <span>sum {pick.reduce((acc, number) => acc + number, 0)}</span>
                    </div>
                  </div>
      <NumberBalls numbers={pick} />
    </li>
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

function apiUrl(path) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  return baseUrl ? `${baseUrl}${path}` : path;
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
      const response = await fetch(apiUrl('/api/predictions'));
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || '추천 기록 조회 실패');
      }

      const nextPredictions = data.predictions || [];
      setPredictions(nextPredictions);
      setSummary(
        nextPredictions.length
          ? `${nextPredictions[0].target_draw_no}회차 추천 기록을 불러왔습니다.`
          : '아직 저장된 추천 기록이 없습니다. 백엔드 동기화 또는 수동 API 호출로 첫 추천을 생성하세요.',
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
            백엔드 작업이 전체 회차 데이터를 분석해 Supabase에 추천 번호 5조합을 저장합니다.
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

          <WinningSummary prediction={predictions[0]} />

          <ol className="result-list">
            {predictions[0]?.picks?.length ? (
              predictions[0].picks.map((pick, index) => (
                <PredictionPickCard
                  key={pick.join('-')}
                  pick={pick}
                  index={index}
                  result={predictions[0].match_results?.[index]}
                  showResult={Boolean(predictions[0].winning_numbers?.length)}
                />
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
                <WinningSummary prediction={prediction} />
                <ol className="history-pick-list">
                  {(prediction.picks || []).slice(0, 5).map((pick, index) => (
                    <PredictionPickCard
                      key={pick.join('-')}
                      pick={pick}
                      index={index}
                      result={prediction.match_results?.[index]}
                      showResult={Boolean(prediction.winning_numbers?.length)}
                    />
                  ))}
                </ol>
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
