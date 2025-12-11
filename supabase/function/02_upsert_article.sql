set search_path to public;

create or replace function upsert_article(
  p_site_id text,
  p_source_url text,
  p_listing_page_url text default null,
  p_discovered_at timestamptz default null,
  p_content_hash text default null,
  p_raw_markdown text default null,
  p_raw_html text default null,
  p_ingestion_run_id uuid default null,
  p_extraction_status text default null
) returns articles
language plpgsql
as $$
declare
  v_status text := lower(coalesce(p_extraction_status, case when p_raw_markdown is not null or p_raw_html is not null then 'succeeded' else 'pending' end));
  v_discovered_at timestamptz := coalesce(p_discovered_at, now());
  v_article articles;
begin
  if p_site_id is null or length(p_site_id) = 0 then
    raise exception 'site_id is required';
  end if;
  if p_source_url is null or length(p_source_url) = 0 then
    raise exception 'source_url is required';
  end if;
  if v_status not in ('pending', 'processing', 'succeeded', 'failed', 'skipped') then
    raise exception 'invalid extraction status: %', v_status;
  end if;

  insert into articles (
    site_id,
    source_url,
    listing_page_url,
    ingestion_run_id,
    discovered_at,
    content_hash,
    raw_markdown,
    raw_html,
    extraction_status,
    extracted_at
  )
  values (
    p_site_id,
    p_source_url,
    p_listing_page_url,
    p_ingestion_run_id,
    v_discovered_at,
    p_content_hash,
    p_raw_markdown,
    p_raw_html,
    v_status,
    case when p_raw_markdown is not null or p_raw_html is not null then v_discovered_at else null end
  )
  on conflict (source_url) do update
    set site_id = excluded.site_id,
        listing_page_url = coalesce(excluded.listing_page_url, articles.listing_page_url),
        ingestion_run_id = coalesce(excluded.ingestion_run_id, articles.ingestion_run_id),
        discovered_at = least(articles.discovered_at, excluded.discovered_at),
        content_hash = coalesce(excluded.content_hash, articles.content_hash),
        raw_markdown = coalesce(excluded.raw_markdown, articles.raw_markdown),
        raw_html = coalesce(excluded.raw_html, articles.raw_html),
        extraction_status = case
          when excluded.raw_markdown is not null or excluded.raw_html is not null then excluded.extraction_status
          else articles.extraction_status
        end,
        extraction_error = case
          when excluded.raw_markdown is not null or excluded.raw_html is not null then null
          else articles.extraction_error
        end,
        extracted_at = case
          when excluded.raw_markdown is not null or excluded.raw_html is not null then coalesce(excluded.discovered_at, now())
          else articles.extracted_at
        end
  returning * into v_article;

  return v_article;
end;
$$;
