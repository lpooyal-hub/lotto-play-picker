import './globals.css';

export const metadata = {
  title: 'Lotto Play Picker',
  description: '과거 로또 번호를 참고해 재미용 조합을 생성하고 기록하는 취미 도구',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
