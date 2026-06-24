# Lotto Play Picker

로또 6/45 1회부터 최신 회차까지의 당첨 번호 빈도, 최근성, 장기 미출현, 동반 출현, 합계/홀짝 밸런스를 참고해서 매주 재미로 5개 조합을 뽑고, 이후 실제 당첨 결과와 비교해 기록하는 취미용 웹앱입니다.

> 로또는 무작위 추첨입니다. 이 프로젝트는 당첨 확률을 보장하거나 높인다고 주장하지 않습니다.

번호 생성은 랜덤 시드 방식이 아니라, 과거 데이터에서 만든 후보군을 점수화해 상위 조합부터 반환하는 결정론적 방식입니다.

운영 흐름은 매 요청마다 계산하는 방식이 아닙니다.

1. Docker 백엔드가 매주 토요일 밤 자동으로 주간 배치를 실행합니다.
2. 배치는 동행복권 페이지를 Playwright로 열어 최신 회차를 확인하고 Supabase `lotto_draws`를 동기화합니다.
3. 지난 추천 기록이 있으면 실제 당첨 번호와 비교해 적중 결과를 갱신합니다.
4. 다음 회차용 추천 5조합을 Supabase `lotto_predictions`에 저장합니다.
5. 화면은 저장된 추천 기록만 조회해서 보여줍니다.

연금복권720+도 별도 흐름으로 운영할 수 있습니다.

1. 과거 320회 이상 당첨 데이터를 분석 재료로 사용합니다.
2. 최신 당첨 회차 기준으로 다음 회차용 예측 5개를 Supabase `pension720_predictions`에 저장합니다.
3. 추첨 후 실제 당첨번호와 비교해 등수/끝수 일치 결과를 기록합니다.
4. 화면은 연금720 예측 기록과 실제 결과를 따로 보여줍니다.

## Stack

- Next.js App Router
- Vercel Functions
- FastAPI backend for Docker deployment
- Supabase Postgres
- Supabase에 저장한 회차 캐시
- Playwright (동행복권 회차 확인용)

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

grant select on table lotto_predictions to anon;
grant select, insert, update, delete on table lotto_predictions to service_role;

create table if not exists lotto_draws (
  draw_no integer primary key,
  numbers integer[] not null,
  bonus_number integer not null,
  draw_date date,
  synced_at timestamptz not null default now()
);

alter table lotto_draws enable row level security;

create policy "public can read lotto draws"
on lotto_draws
for select
to anon
using (true);

grant select on table lotto_draws to anon;
grant select, insert, update, delete on table lotto_draws to service_role;

create table if not exists pension720_draws (
  draw_no integer primary key,
  draw_group text not null,
  winning_number text not null,
  digits integer[] not null,
  draw_date date,
  synced_at timestamptz not null default now()
);

alter table pension720_draws enable row level security;

create policy "public can read pension720 draws"
on pension720_draws
for select
to anon
using (true);

grant select on table pension720_draws to anon;
grant select, insert, update, delete on table pension720_draws to service_role;

create table if not exists pension720_predictions (
  id uuid primary key default gen_random_uuid(),
  target_draw_no integer not null unique,
  picks jsonb not null,
  generated_at timestamptz not null default now(),
  winning_group text,
  winning_number text,
  winning_digits integer[],
  match_results jsonb,
  checked_at timestamptz
);

alter table pension720_predictions enable row level security;

create policy "public can read pension720 predictions"
on pension720_predictions
for select
to anon
using (true);

grant select on table pension720_predictions to anon;
grant select, insert, update, delete on table pension720_predictions to service_role;
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
NEXT_PUBLIC_API_BASE_URL=
```

`SUPABASE_SECRET_KEY`는 Vercel 서버 함수에서만 사용합니다. 브라우저에 노출하지 마세요.
`NEXT_PUBLIC_API_BASE_URL`은 프론트가 별도 백엔드를 볼 때만 설정합니다. 예: `https://lotto.42222.cloud`

백엔드 자동 스케줄러를 함께 쓸 경우:

```bash
ENABLE_WEEKLY_SCHEDULER=true
WEEKLY_SCHEDULER_CRON=35 21 * * 6
WEEKLY_SCHEDULER_TIMEZONE=Asia/Seoul
```

## Local Development

```bash
npm install
npm run dev
```

## Docker Backend

OCI 서버에서는 FastAPI 백엔드만 Docker로 띄울 수 있습니다.

```bash
docker compose up -d --build
```

기본 포트 매핑은 `8020:8000`입니다. OCI 인바운드 포트를 추가로 열지 않고, 기존 443 nginx에서 `lotto.42222.cloud`를 `http://172.17.0.1:8020/`로 프록시하는 구성을 사용합니다.

기본 설정에서는 Docker 컨테이너 안의 주간 스케줄러가 `매주 토요일 21:35 (Asia/Seoul)`에 자동 실행됩니다.

수동 실행:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto.42222.cloud/api/sync-draws
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto.42222.cloud/api/generate-weekly
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto.42222.cloud/api/check-result
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto.42222.cloud/api/run-weekly-maintenance
```

## API Routes

- `POST /api/generate`: 개발/테스트용 즉석 번호 생성
- `GET /api/predictions`: 저장된 추천 기록 조회
- `GET /api/pension720/draws`: 저장된 연금720 회차 기록 조회
- `GET /api/pension720/predictions`: 저장된 연금720 예측 기록 조회
- `GET /api/cron/sync-draws`: 전체 회차 데이터를 Supabase `lotto_draws`에 동기화
- `GET /api/cron/sync-pension720`: 최신 연금720 회차를 Supabase `pension720_draws`에 동기화
- `GET /api/cron/generate-weekly`: 다음 회차 추천 생성 후 Supabase 저장
- `GET /api/cron/generate-pension720-weekly`: 다음 연금720 회차 예측 5개 생성 후 Supabase 저장
- `GET /api/cron/check-result`: 당첨 번호 확인 후 추천 결과 업데이트
- `GET /api/cron/check-pension720-result`: 추첨 결과 확인 후 연금720 예측 결과 업데이트

FastAPI backend:

- `GET /health`: health check
- `GET /api/predictions`: 저장된 추천 기록 조회
- `POST /api/sync-draws`: 전체 회차 데이터를 Supabase `lotto_draws`에 동기화
- `POST /api/generate-weekly`: 다음 회차 추천 생성 후 Supabase 저장
- `POST /api/check-result`: 당첨 번호 확인 후 추천 결과 업데이트
- `POST /api/run-weekly-maintenance`: 동기화 -> 결과 확인 -> 다음 회차 추천 생성을 한 번에 실행
