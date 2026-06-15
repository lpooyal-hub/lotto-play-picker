import LottoPicker from './ui/LottoPicker';

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Toy Data Lab</p>
        <h1>Lotto Play Picker</h1>
        <p className="subtitle">
          동행복권 과거 당첨 번호를 참고해서 매주 재미로 5개 조합을 뽑고, 이후 실제 당첨 결과와
          맞춰보는 작은 취미 도구입니다.
        </p>
      </section>

      <section className="notice">
        <strong>중요:</strong> 로또는 무작위 추첨입니다. 이 페이지는 당첨 확률을 보장하거나 높인다고
        주장하지 않습니다. 과거 데이터 기반 장난감으로만 사용하세요.
      </section>

      <LottoPicker />
    </main>
  );
}
