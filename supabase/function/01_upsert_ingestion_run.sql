set search_path to public;

create or replace function upsert_ingestion_run(
  p_run_key text,
  p_site_id text,
  p_status text default 'running',
  p_pages_visited integer default 0,
  p_new_urls integer default 0,
  p_stop_reason text default null,
  p_error text default null,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null
) returns ingestion_runs
language plpgsql
as $$
declare
  v_status text := lower(coalesce(p_status, 'running'));
  v_run ingestion_runs;
begin
  if p_run_key is null or length(p_run_key) = 0 then
    raise exception 'run_key is required';
  end if;
  if p_site_id is null or length(p_site_id) = 0 then
    raise exception 'site_id is required';
  end if;
  if v_status not in ('running', 'succeeded', 'failed') then
    raise exception 'invalid status: %', v_status;
  end if;

  insert into ingestion_runs (
    run_key,
    site_id,
    status,
    pages_visited,
    new_urls,
    stop_reason,
    error,
    started_at,
    finished_at
  )
  values (
    p_run_key,
    p_site_id,
    v_status,
    coalesce(p_pages_visited, 0),
    coalesce(p_new_urls, 0),
    p_stop_reason,
    p_error,
    coalesce(p_started_at, now()),
    p_finished_at
  )
  on conflict (run_key) do update
    set status = excluded.status,
        site_id = excluded.site_id,
        pages_visited = excluded.pages_visited,
        new_urls = excluded.new_urls,
        stop_reason = excluded.stop_reason,
        error = excluded.error,
        started_at = coalesce(ingestion_runs.started_at, excluded.started_at),
        finished_at = coalesce(excluded.finished_at, ingestion_runs.finished_at)
  returning * into v_run;

  return v_run;
end;
$$;
