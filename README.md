# Lotto Play Picker

로또 6/45와 연금복권720+ 당첨 데이터를 수집·분석하고, 스케줄러 기반 추천 조합 생성, 실제 결과 검증, 예측 기록 누적까지 자동화한 개인 데이터 파이프라인 프로젝트입니다.

> 로또는 무작위 추첨입니다. 이 프로젝트는 당첨 확률을 보장하거나 높인다고 주장하지 않습니다.

번호 생성은 랜덤 시드 방식이 아니라, 과거 데이터에서 만든 후보군을 점수화해 상위 조합부터 반환하는 결정론적 방식입니다.

운영 흐름은 매 요청마다 계산하는 방식이 아닙니다.

1. Docker 백엔드가 로또/연금720 스케줄을 따로 실행합니다.
2. 로또는 동행복권 페이지를 통해 최신 회차를 확인하고, 연금720는 공식 JSON endpoint를 통해 최신 회차를 확인합니다.
3. 지난 추천 기록이 있으면 실제 당첨 번호와 비교해 적중 결과를 갱신합니다.
4. 다음 회차용 추천 5조합을 Supabase `lotto_predictions`에 저장합니다.
5. 화면은 저장된 추천 기록만 조회해서 보여줍니다.

연금복권720+도 별도 흐름으로 운영할 수 있습니다.

1. 과거 320회 이상 당첨 데이터를 분석 재료로 사용합니다.
2. 최신 당첨 회차 기준으로 다음 회차용 예측 5개를 Supabase `pension720_predictions`에 저장합니다.
3. 추첨 후 실제 당첨번호와 비교해 등수/끝수 일치 결과를 기록합니다.
4. 화면은 연금720 예측 기록과 실제 결과를 따로 보여줍니다.
5. 통계와 히스토리는 `예측을 생성한 회차부터` 누적 기록만 기준으로 계산합니다.

## Stack

- Next.js App Router
- Vercel Functions
- FastAPI backend for Docker deployment
- Supabase Postgres
- Supabase에 저장한 회차 캐시
- Playwright (로또 회차 확인용)
- 동행복권 연금720 공식 JSON endpoint

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
`NEXT_PUBLIC_API_BASE_URL`은 프론트가 별도 백엔드를 볼 때만 설정합니다. 공개 예시 주소는 `https://lotto-play-picker.vercel.app` 처럼 두는 편이 안전합니다.

백엔드 자동 스케줄러를 함께 쓸 경우:

```bash
ENABLE_LOTTO_SCHEDULER=true
LOTTO_SCHEDULER_CRON=0 0 * * *
ENABLE_PENSION720_SCHEDULER=true
PENSION720_SCHEDULER_CRON=10 0 * * *
WEEKLY_SCHEDULER_TIMEZONE=Asia/Seoul
```

기본 동작:

- 로또 6/45: 매일 `00:00` 점검 후 누락 시 자동 갱신
- 연금복권720+: 매일 `00:10` 점검 후 누락 시 자동 갱신
- 공통 시간대: `WEEKLY_SCHEDULER_TIMEZONE=Asia/Seoul`

하위 호환을 위해 기존 `ENABLE_WEEKLY_SCHEDULER`, `WEEKLY_SCHEDULER_CRON`도 남아 있지만, 이제는 위의 게임별 스케줄 환경변수를 우선 사용하는 편이 맞습니다. 스케줄러는 지정 시각에 `ensure`를 실행하고, 이미 최신 상태면 아무 작업도 하지 않습니다.

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

기본 포트 매핑은 컨테이너의 `8000` 포트를 외부에서 접근 가능한 내부 포트로 연결하는 방식입니다. 운영 환경에서는 reverse proxy 또는 gateway를 통해 HTTPS 도메인으로 노출하는 구성을 권장합니다.

기본 설정에서는 Docker 컨테이너 안에서 아래 두 점검 스케줄이 각각 자동 실행됩니다.

- 로또: `매일 00:00 (Asia/Seoul)`
- 연금720: `매일 00:10 (Asia/Seoul)`

현재 운영 구성에서는 `/api/...` 요청을 Vercel Functions가 아니라 FastAPI 백엔드가 직접 처리할 수 있습니다. 따라서 실제 운영 기준 API 반영은 `docker compose up -d --build` 후 컨테이너 재시작이 필요할 수 있습니다.

수동 실행:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/sync-draws
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/generate-weekly
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/check-result
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/run-weekly-maintenance
```

연금720 수동 실행:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/sync-pension720-draws
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/check-pension720-result
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/generate-pension720-weekly
```

확인용 조회:

```bash
curl https://lotto-play-picker.vercel.app/api/pension720/predictions
curl https://lotto-play-picker.vercel.app/api/pension720/draws
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
- `GET /api/pension720/draws`: 저장된 연금720 당첨 회차 조회
- `GET /api/pension720/predictions`: 저장된 연금720 예측 기록 조회
- `POST /api/sync-draws`: 전체 회차 데이터를 Supabase `lotto_draws`에 동기화
- `POST /api/sync-pension720-draws`: 최신 연금720 회차를 Supabase `pension720_draws`에 동기화
- `POST /api/generate-weekly`: 다음 회차 추천 생성 후 Supabase 저장
- `POST /api/generate-pension720-weekly`: 다음 연금720 회차 예측 생성 후 Supabase 저장
- `POST /api/check-result`: 당첨 번호 확인 후 추천 결과 업데이트
- `POST /api/check-pension720-result`: 연금720 추첨 결과 확인 후 예측 결과 업데이트
- `POST /api/run-weekly-maintenance`: 동기화 -> 결과 확인 -> 다음 회차 추천 생성을 한 번에 실행
