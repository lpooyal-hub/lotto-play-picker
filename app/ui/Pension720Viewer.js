'use client';

import { useEffect, useMemo, useState } from 'react';

function formatDrawDate(value) {
  if (!value) return '날짜 정보 없음';

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
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

function computeStats(predictions, draws) {
  const checkedPredictions = predictions.filter((prediction) => prediction.checked_at);
  const settledResults = checkedPredictions.flatMap((prediction) => prediction.match_results || []);
  const winningResults = settledResults.filter((result) => result?.rank);
  const bestRank = winningResults.sort((left, right) => rankValue(left.rank) - rankValue(right.rank))[0]?.rank || '기록 없음';
  const latestDraw = draws[0];
  const nextTarget = latestDraw ? `${latestDraw.drawNo + 1}회` : '-';

  return [
    {
      label: '분석 회차',
      value: `${draws.length}회`,
      caption: latestDraw ? `${latestDraw.drawNo}회까지 당첨 데이터 보관` : '기록 없음',
    },
    {
      label: '예측 기록',
      value: `${predictions.length}회`,
      caption: predictions.length ? '이번 회차부터 누적 기록' : '아직 예측 기록 없음',
    },
    {
      label: '최고 적중',
      value: bestRank,
      caption: winningResults.length ? '공식 끝수 기준으로 판정' : '아직 적중 기록 없음',
    },
    {
      label: '다음 타깃',
      value: nextTarget,
      caption: latestDraw ? '최신 당첨 회차 기준' : '당첨 회차 필요',
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
  const [draws, setDraws] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [status, setStatus] = useState('불러오는 중');
  const [summary, setSummary] = useState('연금720 예측 기록을 불러오는 중입니다.');
  const [error, setError] = useState('');
  const [openPredictionCards, setOpenPredictionCards] = useState({});
  const [openDrawCards, setOpenDrawCards] = useState({});
  const currentPrediction = predictions[0];
  const stats = useMemo(() => computeStats(predictions, draws), [predictions, draws]);

  function togglePredictionCard(id) {
    setOpenPredictionCards((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleDrawCard(drawNo) {
    setOpenDrawCards((current) => ({
      ...current,
      [drawNo]: !current[drawNo],
    }));
  }

  async function loadData() {
    setStatus('불러오는 중');
    setError('');

    try {
      const [drawResponse, predictionResponse] = await Promise.all([
        fetch('/api/pension720/draws', { cache: 'no-store' }),
        fetch('/api/pension720/predictions', { cache: 'no-store' }),
      ]);

      const [drawData, predictionData] = await Promise.all([
        readJsonResponse(drawResponse),
        readJsonResponse(predictionResponse),
      ]);

      if (!drawResponse.ok || drawData.error) {
        throw new Error(drawData.error || '연금720 회차 기록 조회 실패');
      }
      if (!predictionResponse.ok || predictionData.error) {
        throw new Error(predictionData.error || '연금720 예측 기록 조회 실패');
      }

      const nextDraws = drawData.draws || [];
      const nextPredictions = predictionData.predictions || [];
      setDraws(nextDraws);
      setPredictions(nextPredictions);

      setOpenDrawCards((current) => {
        const next = {};
        nextDraws.forEach((draw) => {
          next[draw.drawNo] = current[draw.drawNo] ?? false;
        });
        return next;
      });

      setOpenPredictionCards((current) => {
        const next = {};
        nextPredictions.forEach((prediction) => {
          next[prediction.id] = current[prediction.id] ?? false;
        });
        return next;
      });

      if (nextPredictions.length) {
        setSummary(`${nextPredictions[0].target_draw_no}회차 예측 기록을 불러왔습니다.`);
      } else if (nextDraws.length) {
        setSummary(
          `${nextDraws[0].drawNo}회차까지 분석 데이터가 있습니다. 다음 예측은 ${nextDraws[0].drawNo + 1}회차를 기준으로 생성됩니다.`,
        );
      } else {
        setSummary('아직 연금720 분석 데이터가 없습니다.');
      }

      setStatus(nextDraws.length ? '준비 완료' : '기록 없음');
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
            과거 320회 이상 당첨 데이터를 분석 재료로 사용하고, 실제 예측 기록은 이번 회차부터 따로 쌓습니다.
            이후 추첨 결과와 비교해 연금720도 로또처럼 누적 기록을 남깁니다.
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

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Draw History</p>
            <h2>연금720 당첨 회차 기록</h2>
          </div>
        </div>

        <div className="history-list">
          {draws.length ? (
            draws.map((draw) => (
              <article key={draw.drawNo} className="history-card">
                <button className="history-toggle" type="button" onClick={() => toggleDrawCard(draw.drawNo)}>
                  <div className="history-toggle-copy">
                    <span>{draw.drawNo}회</span>
                    <span>
                      {draw.group}조 / {draw.winningNumber}
                      {draw.drawDate ? ` / ${formatDrawDate(draw.drawDate)}` : ''}
                    </span>
                  </div>
                  <span className={`history-toggle-icon ${openDrawCards[draw.drawNo] ? 'open' : ''}`}>⌄</span>
                </button>
                {openDrawCards[draw.drawNo] ? (
                  <div className="history-card-body">
                    <div className="winning-summary compact">
                      <div className="winning-summary-header">
                        <span>{draw.group}조</span>
                        <span>{draw.winningNumber}</span>
                      </div>
                      <div className="pension-pick-row">
                        <GroupChip group={draw.group} matched />
                        <DigitBalls digits={draw.digits} matchedCount={6} />
                        <span className="pension-number-inline">{draw.winningNumber}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">연금720 당첨 회차 데이터가 아직 없습니다.</div>
          )}
        </div>
      </section>
    </>
  );
}
