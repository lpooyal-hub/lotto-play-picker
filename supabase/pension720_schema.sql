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
