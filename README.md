# Lotto Play Picker

로또 6/45 당첨 이력을 수집·분석해 다음 회차용 추천 조합을 만들고, 실제 추첨 결과와 비교해 기록하는 개인 데이터 파이프라인입니다.

> 로또는 각 조합의 당첨 확률이 같은 독립 무작위 추첨입니다. 이 프로젝트의 통계 모델은 당첨을 예측하거나 확률을 높인다고 주장하지 않으며, 과거 분포를 참고해 균형 잡힌 조합을 구성하는 취미용 도구입니다.

## 동작 방식

1. 동행복권 데이터로 `lotto_draws`를 최신 상태로 동기화합니다.
2. 아직 확인하지 않은 추천 기록을 실제 당첨 번호와 비교합니다.
3. 다음 회차 추천 5조합을 생성해 `lotto_predictions`에 저장합니다.
4. 화면은 저장된 최신 추천과 과거 적중 결과를 조회합니다.

같은 회차의 추천이 이미 있으면 새로 생성하지 않습니다. Docker 백엔드는 매일 최신 상태를 점검하고, Vercel Cron은 토요일 추첨 이후 동기화·결과 확인·다음 회차 생성을 순서대로 실행합니다.

## 추천 모델 v2

추천 모델은 결정론적으로 동작하므로 같은 당첨 이력에서는 같은 결과를 반환합니다.

- 장기 빈도와 최근 회차에 더 큰 비중을 주는 감쇠 빈도를 함께 사용
- 데이터가 적거나 특정 번호가 과도하게 부각되지 않도록 사전 확률로 보정
- 함께 출현한 번호 쌍과 합계·홀짝·저고·번호 폭·연속수·끝수 분포 반영
- 후보 번호를 숫자 오름차순으로 잘라 큰 번호가 탈락하던 기존 편향 제거
- 최종 추천끼리 번호가 지나치게 겹치지 않도록 다양성 페널티 적용
- Next.js와 FastAPI가 같은 v2 계산 기준을 사용

모델 구현은 런타임별로 분리되어 있습니다.

- Next.js: `lib/lottoModel.js`
- FastAPI: `backend/app/lotto_model.py`
- 결과 비교와 공개 인터페이스: `lib/picker.js`, `backend/app/picker.py`

## 기술 구성

- Next.js App Router / Vercel Functions
- FastAPI / APScheduler
- Supabase Postgres
- Playwright 기반 동행복권 조회 fallback

## Supabase 테이블

Supabase SQL Editor에서 실행합니다.

```sql
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

create table if not exists lotto_predictions (
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
```

## 환경변수

`.env.example`을 참고해 `.env.local`을 구성합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
NEXT_PUBLIC_API_BASE_URL=

ENABLE_LOTTO_SCHEDULER=true
LOTTO_SCHEDULER_CRON=0 0 * * *
WEEKLY_SCHEDULER_TIMEZONE=Asia/Seoul
```

- `SUPABASE_SECRET_KEY`는 서버에서만 사용하고 브라우저에 노출하지 않습니다.
- `NEXT_PUBLIC_API_BASE_URL`은 프론트엔드와 FastAPI를 별도 배포할 때만 설정합니다.
- 기존 `ENABLE_WEEKLY_SCHEDULER`, `WEEKLY_SCHEDULER_CRON`도 하위 호환용으로 인식합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로또 XLSX 초기 데이터를 Supabase에 넣을 때는 루트의 `lotto.xlsx`와 `.env.local`을 준비한 뒤 실행합니다.

```bash
python3 scripts/import_lotto_xlsx.py
```

## Docker 백엔드

```bash
docker compose up -d --build
```

기본 포트는 호스트 `8020`에서 컨테이너 `8000`으로 연결됩니다. 운영 환경에서는 reverse proxy 또는 gateway를 통해 HTTPS로 노출하는 구성을 권장합니다.

Docker 스케줄러는 기본적으로 매일 `00:00 (Asia/Seoul)`에 최신 상태를 확인합니다. 이미 회차 데이터와 다음 추천이 준비되어 있으면 아무 작업도 하지 않습니다.

## 수동 유지보수

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/sync-draws
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/check-result
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/generate-weekly
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://lotto-play-picker.vercel.app/api/run-weekly-maintenance
```

## API

Next.js / Vercel Functions:

- `POST /api/generate`: 저장된 이력을 사용해 즉석 추천 생성
- `GET /api/predictions`: 저장된 추천 기록 조회
- `GET /api/cron/sync-draws`: 누락된 회차 데이터 동기화
- `GET /api/cron/check-result`: 미확인 추천의 실제 결과 기록
- `GET /api/cron/generate-weekly`: 다음 회차 추천 생성

FastAPI backend:

- `GET /health`: 상태 확인
- `GET /api/predictions`: 저장된 추천 기록 조회
- `POST /api/sync-draws`: 누락 회차 동기화
- `POST /api/check-result`: 미확인 추천의 실제 결과 기록
- `POST /api/generate-weekly`: 다음 회차 추천 생성
- `POST /api/run-weekly-maintenance`: 동기화 → 결과 확인 → 다음 회차 추천 일괄 실행

## Vercel Cron

`vercel.json` 기준으로 토요일 추첨 이후 다음 순서로 실행합니다. 시간은 UTC입니다.

- `12:00`: 회차 동기화
- `12:05`: 기존 추천 결과 확인
- `12:10`: 다음 회차 추천 생성
