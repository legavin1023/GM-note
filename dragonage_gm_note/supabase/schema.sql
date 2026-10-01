-- DragonAge GM Note - Supabase schema
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '드래곤 에이지',
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, code)
);

create table if not exists public.scenario_questions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  prompt text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.scenario_questions(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  region text not null default '',
  color text not null default '#c97954',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  player text not null default '',
  token_url text not null default '',
  level integer not null default 1 check (level >= 1),
  age text not null default '',
  height text not null default '',
  weight text not null default '',
  race text not null default '',
  background text not null default '',
  social_class text not null default '',
  class text not null default '',
  motivation text not null default '',
  goal text not null default '',
  strengths text not null default '',
  doom text not null default '',
  languages text not null default '',
  traits text not null default '',
  biography text not null default '',
  gm_secret text not null default '',
  player_gm_secret text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_scenarios (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  completed boolean not null default false,
  gm_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, scenario_id)
);

create table if not exists public.team_scenario_answers (
  id uuid primary key default gen_random_uuid(),
  team_scenario_id uuid not null references public.team_scenarios(id) on delete cascade,
  question_id uuid not null references public.scenario_questions(id) on delete cascade,
  choice_id uuid not null references public.question_choices(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (team_scenario_id, question_id)
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  url text not null,
  caption text not null default '',
  owner_label text not null default '공용 자료',
  created_at timestamptz not null default now(),
  check (team_id is not null or character_id is not null or owner_label = '공용 자료')
);

create index if not exists scenarios_campaign_order_idx
  on public.scenarios (campaign_id, sort_order);
create index if not exists questions_scenario_order_idx
  on public.scenario_questions (scenario_id, sort_order);
create index if not exists choices_question_order_idx
  on public.question_choices (question_id, sort_order);
create index if not exists teams_campaign_order_idx
  on public.teams (campaign_id, sort_order);
create index if not exists characters_team_idx
  on public.characters (team_id);
create index if not exists images_campaign_idx
  on public.images (campaign_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

drop trigger if exists team_scenarios_set_updated_at on public.team_scenarios;
create trigger team_scenarios_set_updated_at
before update on public.team_scenarios
for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_questions enable row level security;
alter table public.question_choices enable row level security;
alter table public.teams enable row level security;
alter table public.characters enable row level security;
alter table public.team_scenarios enable row level security;
alter table public.team_scenario_answers enable row level security;
alter table public.images enable row level security;

create or replace function public.user_owns_campaign(campaign_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns
    where id = campaign_uuid and owner_id = auth.uid()
  );
$$;

create policy campaigns_owner_policy on public.campaigns
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy scenarios_owner_policy on public.scenarios
for all using (public.user_owns_campaign(campaign_id))
with check (public.user_owns_campaign(campaign_id));

create policy questions_owner_policy on public.scenario_questions
for all using (
  exists (
    select 1 from public.scenarios s
    where s.id = scenario_id and public.user_owns_campaign(s.campaign_id)
  )
) with check (
  exists (
    select 1 from public.scenarios s
    where s.id = scenario_id and public.user_owns_campaign(s.campaign_id)
  )
);

create policy choices_owner_policy on public.question_choices
for all using (
  exists (
    select 1
    from public.scenario_questions q
    join public.scenarios s on s.id = q.scenario_id
    where q.id = question_id and public.user_owns_campaign(s.campaign_id)
  )
) with check (
  exists (
    select 1
    from public.scenario_questions q
    join public.scenarios s on s.id = q.scenario_id
    where q.id = question_id and public.user_owns_campaign(s.campaign_id)
  )
);

create policy teams_owner_policy on public.teams
for all using (public.user_owns_campaign(campaign_id))
with check (public.user_owns_campaign(campaign_id));

create policy characters_owner_policy on public.characters
for all using (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.user_owns_campaign(t.campaign_id)
  )
) with check (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.user_owns_campaign(t.campaign_id)
  )
);

create policy team_scenarios_owner_policy on public.team_scenarios
for all using (
  exists (
    select 1
    from public.teams t
    where t.id = team_id and public.user_owns_campaign(t.campaign_id)
  )
) with check (
  exists (
    select 1
    from public.teams t
    where t.id = team_id and public.user_owns_campaign(t.campaign_id)
  )
);

create policy answers_owner_policy on public.team_scenario_answers
for all using (
  exists (
    select 1
    from public.team_scenarios ts
    join public.teams t on t.id = ts.team_id
    where ts.id = team_scenario_id and public.user_owns_campaign(t.campaign_id)
  )
) with check (
  exists (
    select 1
    from public.team_scenarios ts
    join public.teams t on t.id = ts.team_id
    where ts.id = team_scenario_id and public.user_owns_campaign(t.campaign_id)
  )
);

create policy images_owner_policy on public.images
for all using (public.user_owns_campaign(campaign_id))
with check (public.user_owns_campaign(campaign_id));

-- Optional first campaign seed. Run after signing in, replacing the title if needed.
-- insert into public.campaigns (title) values ('드래곤 에이지') returning id;
