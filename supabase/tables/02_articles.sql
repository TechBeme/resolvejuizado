set search_path to public;

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  source_url text not null unique,
  listing_page_url text,
  ingestion_run_id uuid references ingestion_runs (id),
  discovered_at timestamptz not null default now(),
  content_hash text,
  raw_markdown text,
  raw_html text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
  extraction_error text,
  extracted_at timestamptz,
  refine_status text not null default 'pending' check (refine_status in ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
  refine_error text,
  refined_markdown text,
  refined_html text,
  focus_keyword text,
  seo_title text,
  seo_description text,
  faqs jsonb default '[]'::jsonb,
  image_prompts jsonb default '[]'::jsonb,
  refined_at timestamptz,
  media_status text not null default 'pending' check (media_status in ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
  media_error text,
  hero_image_url text,
  inline_image_urls jsonb default '[]'::jsonb,
  media_completed_at timestamptz,
  published_status text not null default 'pending' check (published_status in ('pending', 'processing', 'published', 'failed', 'skipped')),
  published_error text,
  wordpress_post_id integer,
  wordpress_post_url text,
  wordpress_slug text,
  wordpress_response jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_site_idx on articles (site_id);
create index if not exists articles_ingestion_run_idx on articles (ingestion_run_id);
create index if not exists articles_pipeline_status_idx on articles (extraction_status, refine_status, media_status, published_status);
