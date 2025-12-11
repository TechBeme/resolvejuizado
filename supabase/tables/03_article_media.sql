set search_path to public;

create table if not exists article_media (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles (id) on delete cascade,
  role text not null default 'inline' check (role in ('featured', 'inline', 'gallery')),
  prompt text,
  alt text,
  url text,
  wordpress_media_id integer,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'skipped', 'uploaded')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists article_media_article_idx on article_media (article_id);
