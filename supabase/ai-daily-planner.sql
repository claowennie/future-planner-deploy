-- Apply atomically: tables, grants, and RLS must become available together.
begin;

-- Future AI Daily Planner
-- Run once in Supabase SQL Editor before enabling the planner in production.

create table if not exists public.planner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  priorities jsonb not null default '[]'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  planning_style text not null default 'flexible'
    check (planning_style in ('flexible', 'structured')),
  daily_rhythm text not null default 'neutral'
    check (daily_rhythm in ('morning', 'neutral', 'evening')),
  preferred_activities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  day_type text not null
    check (day_type in ('productive', 'balanced', 'relaxed', 'minimum')),
  checkin jsonb not null default '{}'::jsonb,
  plan_json jsonb not null,
  version integer not null default 1 check (version > 0),
  replan_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, version)
);

create index if not exists daily_plans_user_date_idx
  on public.daily_plans (user_id, date desc, version desc);

alter table public.planner_profiles enable row level security;
alter table public.daily_plans enable row level security;

drop policy if exists "planner_profiles_own" on public.planner_profiles;
create policy "planner_profiles_own" on public.planner_profiles
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_plans_own" on public.daily_plans;
create policy "daily_plans_own" on public.daily_plans
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.planner_profiles to authenticated;
grant select, insert, update, delete on public.daily_plans to authenticated;

commit;
