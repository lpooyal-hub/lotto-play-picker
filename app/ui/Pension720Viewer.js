'use client';

import { useMemo, useState } from 'react';
import pension720Draws from '../../data/pension720Draws.json';

function digitTier(number) {
  if (number <= 1) return 1;
  if (number <= 3) return 2;
  if (number <= 5) return 3;
  if (number <= 7) return 4;
  return 5;
}

function DigitBalls({ digits }) {
  return (
    <div className="numbers">
      {digits.map((digit, index) => (
        <span key={`${digit}-${index}`} className={`ball tier-${digitTier(digit)}`}>
          {digit}
        </span>
      ))}
    </div>
  );
}

function computeStats(draws) {
  const latest = draws.at(-1);
  const groupCounts = draws.reduce((counts, draw) => {
    counts[draw.group] = (counts[draw.group] || 0) + 1;
    return counts;
  }, {});
  const topGroup =
    Object.entries(groupCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || '-';
  const recentTail = draws.slice(-10).map((draw) => draw.digits.at(-1));
  const avgLastDigit = recentTail.length
    ? (recentTail.reduce((sum, digit) => sum + digit, 0) / recentTail.length).toFixed(1)
    : '-';

  return [
    {
      label: '저장 회차',
      value: `${draws.length}회`,
      caption: latest ? `최신 반영 ${latest.drawNo}회` : '데이터 없음',
    },
    {
      label: '최신 당첨 조',
      value: latest ? `${latest.group}조` : '-',
      caption: latest ? `${latest.winningNumber}` : '데이터 없음',
    },
    {
      label: '가장 많이 나온 조',
      value: `${topGroup}조`,
      caption: '현재 저장 회차 기준',
    },
    {
      label: '최근 10회 끝수 평균',
      value: `${avgLastDigit}`,
      caption: '맨 마지막 자리 숫자 평균',
    },
  ];
}

export default function Pension720Viewer() {
  const draws = pension720Draws;
  const latest = draws.at(-1);
  const stats = useMemo(() => computeStats(draws), [draws]);
  const [openCards, setOpenCards] = useState(() =>
    Object.fromEntries(draws.slice(-12).map((draw, index, arr) => [draw.drawNo, index === arr.length - 1])),
  );

  function toggleCard(drawNo) {
    setOpenCards((current) => ({
      ...current,
      [drawNo]: !current[drawNo],
    }));
  }

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
              <h2>최신 당첨 결과</h2>
            </div>
            <span className="status-badge">기록형</span>
          </div>

          <p className="summary">
            연금복권720+는 로또처럼 조합 추천보다 회차별 당첨 결과를 보기 좋게 쌓아두는 쪽이 먼저입니다.
            프로젝트 폴더의 엑셀 데이터를 기준으로 최신 회차까지 정리했습니다.
          </p>

          {latest ? (
            <div className="winning-summary">
              <div className="winning-summary-header">
                <span>{latest.drawNo}회 당첨 결과</span>
                <span>{latest.group}조</span>
              </div>
              <div className="winning-row">
                <DigitBalls digits={latest.digits} />
                <div className="bonus-pill">
                  <span>본번호</span>
                  <strong className="pension-number-text">{latest.winningNumber}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">연금720 데이터가 아직 없습니다.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Guide</p>
              <h2>보는 법</h2>
            </div>
          </div>

          <ul className="pension-guide-list">
            <li>각 회차는 `조`와 `6자리 본번호`로 구성됩니다.</li>
            <li>히스토리 카드를 펼치면 회차별 당첨번호를 바로 확인할 수 있습니다.</li>
            <li>현재는 결과 기록 뷰어 중심이며, 추천 로직은 아직 붙이지 않았습니다.</li>
          </ul>
        </article>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">History</p>
            <h2>연금720 저장 기록</h2>
          </div>
        </div>

        <div className="history-list">
          {draws
            .slice(-20)
            .reverse()
            .map((draw) => (
              <article key={draw.drawNo} className="history-card">
                <button className="history-toggle" type="button" onClick={() => toggleCard(draw.drawNo)}>
                  <div className="history-toggle-copy">
                    <span>{draw.drawNo}회</span>
                    <span>{draw.group}조 / {draw.winningNumber}</span>
                  </div>
                  <span className={`history-toggle-icon ${openCards[draw.drawNo] ? 'open' : ''}`}>⌄</span>
                </button>
                {openCards[draw.drawNo] ? (
                  <div className="history-card-body">
                    <div className="winning-summary compact">
                      <div className="winning-summary-header">
                        <span>{draw.group}조</span>
                        <span>{draw.winningNumber}</span>
                      </div>
                      <DigitBalls digits={draw.digits} />
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
        </div>
      </section>
    </>
  );
}
