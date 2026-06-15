# Lotto Play Picker

로또 6/45 1회부터 최신 회차까지의 당첨 번호 빈도, 최근성, 장기 미출현, 동반 출현, 합계/홀짝 밸런스를 참고해서 매주 재미로 5개 조합을 뽑고, 이후 실제 당첨 결과와 비교해 기록하는 취미용 웹앱입니다.

> 로또는 무작위 추첨입니다. 이 프로젝트는 당첨 확률을 보장하거나 높인다고 주장하지 않습니다.

번호 생성은 랜덤 시드 방식이 아니라, 과거 데이터에서 만든 후보군을 점수화해 상위 조합부터 반환하는 결정론적 방식입니다.

## Stack

- Next.js App Router
- Vercel Functions
- Vercel Cron Jobs
- Supabase Postgres
- Dhlottery public JSON endpoint

## Supabase Table

Supabase SQL Editor에서 실행하세요.

```sql
create table lotto_predictions (
  id uuid primary key default gen_random_uuid(),
  target_draw_no integer not null unique,
  picks jsonb not null,
  generated_at timestamptz not null default now(),
  winning_numbers integer[],
  bonus_number integer,
  match_results jsonb,
  checked_at timestamptz
);

alter table lotto_predictions enable row level security;

create policy "public can read lotto predictions"
on lotto_predictions
for select
to anon
using (true);
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
```

`SUPABASE_SECRET_KEY`는 Vercel 서버 함수에서만 사용합니다. 브라우저에 노출하지 마세요.

## Local Development

```bash
npm install
npm run dev
```

## API Routes

- `POST /api/generate`: 즉석 번호 생성
- `GET /api/predictions`: 저장된 추천 기록 조회
- `GET /api/cron/generate-weekly`: 다음 회차 추천 생성 후 Supabase 저장
- `GET /api/cron/check-result`: 당첨 번호 확인 후 추천 결과 업데이트

## Vercel Cron

`vercel.json`에 아래 스케줄이 들어 있습니다.

- `0 3 * * 6`: 매주 토요일 03:00 UTC 추천 생성
- `0 14 * * 6`: 매주 토요일 14:00 UTC 결과 확인

Vercel Cron은 UTC 기준입니다. 한국 시간 기준으로 조정이 필요하면 `vercel.json`의 schedule을 바꾸세요.
