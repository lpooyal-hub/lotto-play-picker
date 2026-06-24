import GameTabs from './ui/GameTabs';

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Toy Data Lab</p>
        <h1>Lotto Play Picker</h1>
        <p className="subtitle">
          로또 6/45와 연금복권720+ 회차 데이터를 함께 정리해두고, 두 게임 모두 예측과 실제 결과 기록을
          이어서 보는 작은 취미 도구입니다.
        </p>
      </section>

      <section className="notice">
        <strong>중요:</strong> 복권은 무작위 추첨입니다. 이 페이지는 당첨 확률을 보장하거나 높인다고 주장하지
        않습니다. 과거 데이터 기반 장난감으로만 사용하세요.
      </section>

      <GameTabs />
    </main>
  );
}
