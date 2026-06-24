'use client';

import { useEffect, useMemo, useState } from 'react';

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

function digitTier(number) {
  if (number <= 1) return 1;
  if (number <= 3) return 2;
  if (number <= 5) return 3;
  if (number <= 7) return 4;
  return 5;
}

function DigitBalls({ digits, matchedCount = 0, dimUnmatched = false }) {
  return (
    <div className="numbers">
      {digits.map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          className={[
            'ball',
            `tier-${digitTier(digit)}`,
            index >= digits.length - matchedCount ? 'matched' : '',
            dimUnmatched && matchedCount && index < digits.length - matchedCount ? 'dimmed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}

function rankValue(rank) {
  if (!rank) return 999;
  return Number(rank.replace('등', '')) || 999;
}

function MatchBadge({ result }) {
  if (!result) return null;

  const label = result.rank || `${result.suffixMatchCount}자리 끝수 일치`;
  const tone = result.rank ? 'strong' : result.suffixMatchCount >= 2 || result.groupMatched ? 'warm' : 'muted';
  return <span className={`match-badge ${tone}`}>{label}</span>;
}

function GroupChip({ group, matched = false }) {
  return <span className={`pension-group-chip ${matched ? 'matched' : ''}`}>{group}조</span>;
}

function computeStats(predictions) {
  const checkedPredictions = predictions.filter((prediction) => prediction.checked_at);
  const settledResults = checkedPredictions.flatMap((prediction) => prediction.match_results || []);
  const winningResults = settledResults.filter((result) => result?.rank);
  const bestRank = winningResults.sort((left, right) => rankValue(left.rank) - rankValue(right.rank))[0]?.rank || '기록 없음';
  const latestPrediction = predictions[0];

  return [
    {
      label: '예측 기록',
      value: `${predictions.length}회`,
      caption: predictions.length ? '예측을 생성한 회차부터 누적' : '아직 예측 기록 없음',
    },
    {
      label: '결과 확인',
      value: `${checkedPredictions.length}회`,
      caption: checkedPredictions.length ? '실제 추첨 결과와 비교 완료' : '아직 결과 확인 전',
    },
    {
      label: '최고 적중',
      value: bestRank,
      caption: winningResults.length ? '공식 끝수 기준으로 판정' : '아직 적중 기록 없음',
    },
    {
      label: '최근 예측',
      value: latestPrediction ? `${latestPrediction.target_draw_no}회` : '-',
      caption: latestPrediction ? '가장 최근에 생성된 예측 회차' : '아직 생성된 예측 없음',
    },
  ];
}

function WinningSummary({ prediction }) {
  if (!prediction?.winning_number) return null;

  return (
    <div className="winning-summary">
      <div className="winning-summary-header">
        <span>실제 당첨번호</span>
        {prediction.checked_at ? <span>{formatCheckedAt(prediction.checked_at)} 확인</span> : null}
      </div>
      <div className="winning-row pension-winning-row">
        <GroupChip group={prediction.winning_group} matched />
        <DigitBalls digits={prediction.winning_digits || []} matchedCount={6} />
        <div className="bonus-pill">
          <span>본번호</span>
          <strong className="pension-number-text">{prediction.winning_number}</strong>
        </div>
      </div>
    </div>
  );
}

function PredictionPickCard({ pick, index, result, showResult = false, winningGroup }) {
  return (
    <li className="result-item">
      <div className="result-meta">
        <span>Pick {index + 1}</span>
        <div className="result-meta-right">
          {showResult ? <MatchBadge result={result} /> : null}
          {showResult && result?.prizeLabel ? <span className="prize-chip">{result.prizeLabel}</span> : null}
        </div>
      </div>
      <div className="pension-pick-row">
        <GroupChip group={pick.group} matched={Boolean(showResult && result?.groupMatched && pick.group === winningGroup)} />
        <DigitBalls digits={pick.digits} matchedCount={showResult ? result?.suffixMatchCount || 0 : 0} dimUnmatched={showResult} />
        <span className="pension-number-inline">{pick.number}</span>
      </div>
      {showResult ? (
        <p className="match-note">
          {result?.groupMatched ? '조 일치' : '조 불일치'}
          {` / 끝수 ${result?.suffixMatchCount || 0}자리 일치`}
          {result?.exactNumber ? ' / 본번호 완전 일치' : ''}
        </p>
      ) : null}
    </li>
  );
}

export default function Pension720Viewer() {
  const [predictions, setPredictions] = useState([]);
  const [status, setStatus] = useState('불러오는 중');
  const [summary, setSummary] = useState('연금720 예측 기록을 불러오는 중입니다.');
  const [error, setError] = useState('');
  const [openPredictionCards, setOpenPredictionCards] = useState({});
  const currentPrediction = predictions[0];
  const stats = useMemo(() => computeStats(predictions), [predictions]);

  function togglePredictionCard(id) {
    setOpenPredictionCards((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  async function loadData() {
    setStatus('불러오는 중');
    setError('');

    try {
      const predictionResponse = await fetch('/api/pension720/predictions', { cache: 'no-store' });
      const predictionData = await readJsonResponse(predictionResponse);
      if (!predictionResponse.ok || predictionData.error) {
        throw new Error(predictionData.error || '연금720 예측 기록 조회 실패');
      }

      const nextPredictions = predictionData.predictions || [];
      setPredictions(nextPredictions);

      setOpenPredictionCards((current) => {
        const next = {};
        nextPredictions.forEach((prediction) => {
          next[prediction.id] = current[prediction.id] ?? false;
        });
        return next;
      });

      if (nextPredictions.length) {
        setSummary(`${nextPredictions[0].target_draw_no}회차 예측 기록을 불러왔습니다.`);
      } else {
        setSummary('아직 저장된 연금720 예측 기록이 없습니다.');
      }

      setStatus(nextPredictions.length ? '준비 완료' : '기록 없음');
    } catch (err) {
      setStatus('오류');
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData().catch(() => undefined);
  }, []);

  return (
    <>
      <section className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <p className="stat-label">{stat.label}</p>
            <strong className="stat-value">{stat.value}</strong>
            <p className="stat-caption">{stat.caption}</p>
          </article>
        ))}
      </section>

      <section className="tool-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Pension 720+</p>
              <h2>이번 회차 예측 기록</h2>
            </div>
            <span className="status-badge">{status}</span>
          </div>

          <p className="summary">
            연금720도 로또처럼 예측을 생성한 회차부터 기록을 쌓고, 추첨 후 실제 결과와 비교해 누적 통계를
            남깁니다.
          </p>

          <div className="actions">
            <button className="secondary" type="button" onClick={loadData}>
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
              <h2>{currentPrediction ? `${currentPrediction.target_draw_no}회차 예상` : '예측 대기'}</h2>
            </div>
          </div>

          <WinningSummary prediction={currentPrediction} />

          <ol className="result-list">
            {currentPrediction?.picks?.length ? (
              currentPrediction.picks.map((pick, index) => (
                <PredictionPickCard
                  key={`${pick.group}-${pick.number}`}
                  pick={pick}
                  index={index}
                  result={currentPrediction.match_results?.[index]}
                  winningGroup={currentPrediction.winning_group}
                  showResult={Boolean(currentPrediction.checked_at)}
                />
              ))
            ) : (
              <li className="empty-state">아직 저장된 연금720 예측이 없습니다.</li>
            )}
          </ol>
        </article>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Prediction History</p>
            <h2>연금720 예측 기록</h2>
          </div>
        </div>

        <div className="history-list">
          {predictions.length ? (
            predictions.map((prediction) => (
              <article key={prediction.id} className="history-card">
                <button className="history-toggle" type="button" onClick={() => togglePredictionCard(prediction.id)}>
                  <div className="history-toggle-copy">
                    <span>{prediction.target_draw_no}회차 예상</span>
                    <span>{prediction.checked_at ? '결과 확인 완료' : '결과 대기'}</span>
                  </div>
                  <span className={`history-toggle-icon ${openPredictionCards[prediction.id] ? 'open' : ''}`}>⌄</span>
                </button>
                {openPredictionCards[prediction.id] ? (
                  <div className="history-card-body">
                    <WinningSummary prediction={prediction} />
                    <ol className="history-pick-list">
                      {(prediction.picks || []).map((pick, index) => (
                        <PredictionPickCard
                          key={`${pick.group}-${pick.number}`}
                          pick={pick}
                          index={index}
                          result={prediction.match_results?.[index]}
                          winningGroup={prediction.winning_group}
                          showResult={Boolean(prediction.checked_at)}
                        />
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">Supabase에 저장된 연금720 예측 기록이 아직 없습니다.</div>
          )}
        </div>
      </section>
    </>
  );
}
