set search_path to public;

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  site_id text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  pages_visited integer not null default 0,
  new_urls integer not null default 0,
  stop_reason text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingestion_runs_site_status_idx on ingestion_runs (site_id, status);
