set search_path to public;

create or replace function trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_on_ingestion_runs on ingestion_runs;
create trigger set_timestamp_on_ingestion_runs
before update on ingestion_runs
for each row
execute function trigger_set_timestamp();

drop trigger if exists set_timestamp_on_articles on articles;
create trigger set_timestamp_on_articles
before update on articles
for each row
execute function trigger_set_timestamp();

drop trigger if exists set_timestamp_on_article_media on article_media;
create trigger set_timestamp_on_article_media
before update on article_media
for each row
execute function trigger_set_timestamp();
