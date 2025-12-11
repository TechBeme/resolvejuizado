set search_path to public;

create or replace function mark_article_stage(
  p_article_id uuid,
  p_stage text,
  p_status text,
  p_error text default null,
  p_payload jsonb default null,
  p_refined_markdown text default null,
  p_refined_html text default null,
  p_focus_keyword text default null,
  p_seo_title text default null,
  p_seo_description text default null,
  p_faqs jsonb default null,
  p_image_prompts jsonb default null,
  p_hero_image_url text default null,
  p_inline_image_urls jsonb default null,
  p_wordpress_post_id integer default null,
  p_wordpress_post_url text default null,
  p_wordpress_slug text default null,
  p_wordpress_response jsonb default null
) returns articles
language plpgsql
as $$
declare
  v_stage text := lower(p_stage);
  v_status text := lower(p_status);
  v_article articles;
begin
  if v_stage not in ('extraction', 'refine', 'media', 'publish') then
    raise exception 'invalid stage: %', v_stage;
  end if;

  if v_stage = 'publish' and v_status = 'succeeded' then
    v_status := 'published';
  end if;

  if v_stage = 'publish' then
    if v_status not in ('pending', 'processing', 'published', 'failed', 'skipped') then
      raise exception 'invalid publish status: %', v_status;
    end if;
  else
    if v_status not in ('pending', 'processing', 'succeeded', 'failed', 'skipped') then
      raise exception 'invalid status for stage %: %', v_stage, v_status;
    end if;
  end if;

  update articles
    set extraction_status = case when v_stage = 'extraction' then v_status else extraction_status end,
        extraction_error = case when v_stage = 'extraction' then p_error else extraction_error end,
        extracted_at = case
          when v_stage = 'extraction' and v_status in ('succeeded', 'skipped') then now()
          else extracted_at
        end,
        refine_status = case when v_stage = 'refine' then v_status else refine_status end,
        refine_error = case when v_stage = 'refine' then p_error else refine_error end,
        refined_markdown = case when v_stage = 'refine' and p_refined_markdown is not null then p_refined_markdown else refined_markdown end,
        refined_html = case when v_stage = 'refine' and p_refined_html is not null then p_refined_html else refined_html end,
        focus_keyword = case when v_stage = 'refine' and p_focus_keyword is not null then p_focus_keyword else focus_keyword end,
        seo_title = case when v_stage = 'refine' and p_seo_title is not null then p_seo_title else seo_title end,
        seo_description = case when v_stage = 'refine' and p_seo_description is not null then p_seo_description else seo_description end,
        faqs = case when v_stage = 'refine' and p_faqs is not null then p_faqs else faqs end,
        image_prompts = case when v_stage = 'refine' and p_image_prompts is not null then p_image_prompts else image_prompts end,
        refined_at = case
          when v_stage = 'refine' and v_status in ('succeeded', 'skipped') then now()
          else refined_at
        end,
        media_status = case when v_stage = 'media' then v_status else media_status end,
        media_error = case when v_stage = 'media' then p_error else media_error end,
        hero_image_url = case when v_stage = 'media' and p_hero_image_url is not null then p_hero_image_url else hero_image_url end,
        inline_image_urls = case when v_stage = 'media' and p_inline_image_urls is not null then p_inline_image_urls else inline_image_urls end,
        media_completed_at = case
          when v_stage = 'media' and v_status in ('succeeded', 'skipped') then now()
          else media_completed_at
        end,
        published_status = case when v_stage = 'publish' then v_status else published_status end,
        published_error = case when v_stage = 'publish' then p_error else published_error end,
        wordpress_post_id = case when v_stage = 'publish' and p_wordpress_post_id is not null then p_wordpress_post_id else wordpress_post_id end,
        wordpress_post_url = case when v_stage = 'publish' and p_wordpress_post_url is not null then p_wordpress_post_url else wordpress_post_url end,
        wordpress_slug = case when v_stage = 'publish' and p_wordpress_slug is not null then p_wordpress_slug else wordpress_slug end,
        wordpress_response = case when v_stage = 'publish' and p_wordpress_response is not null then p_wordpress_response else wordpress_response end,
        published_at = case
          when v_stage = 'publish' and v_status = 'published' then now()
          else published_at
        end
  where id = p_article_id
  returning * into v_article;

  if not found then
    raise exception 'article % not found', p_article_id;
  end if;

  insert into article_events (article_id, stage, status, message, details)
  values (p_article_id, v_stage, v_status, p_error, p_payload);

  return v_article;
end;
$$;
