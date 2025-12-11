set search_path to public;

create table if not exists article_events (
  id bigserial primary key,
  article_id uuid not null references articles (id) on delete cascade,
  stage text not null check (stage in ('ingestion', 'extraction', 'refine', 'media', 'publish')),
  status text not null check (status in ('pending', 'processing', 'succeeded', 'failed', 'skipped', 'published', 'uploaded')),
  message text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists article_events_article_stage_idx on article_events (article_id, stage);
