import GameTabs from './ui/GameTabs';

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Data Tracking Project</p>
        <h1>Lotto Play Picker</h1>
        <p className="subtitle">
          로또 6/45와 연금복권720+ 데이터를 수집·정리하고, 추천 기록과 실제 결과를 함께 추적하는 프로젝트입니다.
        </p>
      </section>

      <section className="notice">
        <strong>중요:</strong> 복권은 무작위 추첨입니다. 이 페이지는 당첨 확률을 보장하거나 높인다고 주장하지 않습니다.
      </section>

      <GameTabs />
    </main>
  );
}
