set search_path to public;

create or replace view vw_article_pipeline_status as
select
  a.id,
  a.site_id,
  a.source_url,
  a.discovered_at,
  a.extraction_status,
  a.refine_status,
  a.media_status,
  a.published_status,
  case
    when a.extraction_status not in ('succeeded', 'skipped') then 'extraction'
    when a.refine_status not in ('succeeded', 'skipped') then 'refine'
    when a.media_status not in ('succeeded', 'skipped') then 'media'
    when a.published_status <> 'published' then 'publish'
    else null
  end as next_step,
  ir.run_key as ingestion_run_key,
  ir.status as ingestion_status,
  ir.started_at as ingestion_started_at,
  ir.finished_at as ingestion_finished_at
from articles a
left join ingestion_runs ir on ir.id = a.ingestion_run_id;
