export const MIGRATION_009_TIMING_ENGINE = `
create table if not exists public.item_profiles (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  display_name text not null,
  kind text not null check (kind in ('med','supplement','food')),
  tags text[] not null default '{}'::text[],
  timing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interaction_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  applies_to text[] not null default '{}'::text[],
  applies_if_tags text[] not null default '{}'::text[],
  conflicts_with_names text[] not null default '{}'::text[],
  conflicts_with_tags text[] not null default '{}'::text[],
  constraint jsonb not null,
  severity text not null check (severity in ('hard','soft')),
  confidence int not null default 80 check (confidence >= 0 and confidence <= 100),
  rationale text not null,
  references text[] not null default '{}'::text[],
  is_active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interaction_rules_active_idx on public.interaction_rules(is_active);
create index if not exists interaction_rules_applies_to_idx on public.interaction_rules using gin(applies_to);
create index if not exists interaction_rules_applies_if_tags_idx on public.interaction_rules using gin(applies_if_tags);

create table if not exists public.user_intake_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  canonical_name text not null,
  display_name text not null,
  dose text,
  frequency text not null default 'daily',
  preferred_window jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_intake_items_user_id_idx on public.user_intake_items(user_id);

create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_date date not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists schedule_runs_user_id_date_idx on public.schedule_runs(user_id, run_date);

create table if not exists public.rule_change_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('proposed','triaged','verified','rejected','published')),
  proposed_by text not null,
  rule_payload jsonb not null,
  reviewer_notes text,
  verified_by text,
  verified_at timestamptz,
  published_rule_id uuid references public.interaction_rules(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;
