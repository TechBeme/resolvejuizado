import { createClient, type PostgrestError, type SupabaseClient as SbClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

type IngestionRun = {
  id: string;
  run_key: string;
  site_id: string;
  status: string;
  pages_visited: number | null;
  new_urls: number | null;
  stop_reason: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type Article = {
  id: string;
  source_url: string;
  site_id: string;
  raw_markdown: string | null;
  raw_html: string | null;
  extraction_status: string;
  refine_status: string;
  media_status: string;
  published_status: string;
};

const formatError = (error?: PostgrestError | null) => {
  if (!error) return "Unknown Supabase error";
  return `${error.message} (${error.details ?? "no details"})`;
};

export class SupabaseClient {
  public client: SbClient; // Público para acesso direto em resumos

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  static fromEnv(): SupabaseClient | undefined {
    if (!env.supabaseUrl || !env.supabaseKey) return undefined;
    return new SupabaseClient(env.supabaseUrl, env.supabaseKey);
  }

  async upsertIngestionRun(input: {
    runKey: string;
    siteId: string;
    status: "running" | "succeeded" | "failed";
    pagesVisited?: number;
    newUrls?: number;
    stopReason?: string;
    error?: string | null;
    startedAt?: string;
    finishedAt?: string | null;
  }): Promise<IngestionRun> {
    const { data, error } = await this.client.rpc("upsert_ingestion_run", {
      p_run_key: input.runKey,
      p_site_id: input.siteId,
      p_status: input.status,
      p_pages_visited: input.pagesVisited ?? 0,
      p_new_urls: input.newUrls ?? 0,
      p_stop_reason: input.stopReason ?? null,
      p_error: input.error ?? null,
      p_started_at: input.startedAt ?? null,
      p_finished_at: input.finishedAt ?? null,
    });
    if (error) throw new Error(`Supabase upsert_ingestion_run failed: ${formatError(error)}`);
    return data as IngestionRun;
  }

  async upsertArticle(input: {
    siteId: string;
    sourceUrl: string;
    listingPageUrl?: string;
    discoveredAt?: string;
    contentHash?: string | null;
    rawMarkdown?: string | null;
    rawHtml?: string | null;
    ingestionRunId?: string | null;
    extractionStatus?: "pending" | "processing" | "succeeded" | "failed" | "skipped";
  }): Promise<Article> {
    const { data, error } = await this.client.rpc("upsert_article", {
      p_site_id: input.siteId,
      p_source_url: input.sourceUrl,
      p_listing_page_url: input.listingPageUrl ?? null,
      p_discovered_at: input.discoveredAt ?? null,
      p_content_hash: input.contentHash ?? null,
      p_raw_markdown: input.rawMarkdown ?? null,
      p_raw_html: input.rawHtml ?? null,
      p_ingestion_run_id: input.ingestionRunId ?? null,
      p_extraction_status: input.extractionStatus ?? null,
    });
    if (error) throw new Error(`Supabase upsert_article failed: ${formatError(error)}`);
    return data as Article;
  }

  async listArticlesForReprocess(options?: {
    limit?: number;
    siteIds?: string[];
  }): Promise<
    Array<{
      id: string;
      site_id: string;
      source_url: string;
      raw_markdown: string | null;
      extraction_status: string;
      refine_status: string;
      media_status: string;
      published_status: string;
    }>
  > {
    // FIXME: Resetar artigos orfãos que ficaram como "processing" (processo foi morto)
    // Considera "processing" há mais de 10 minutos como falha
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: refineOrphans } = await this.client
      .from("articles")
      .update({
        refine_status: "pending",
        media_status: "pending",
        published_status: "pending",
      })
      .eq("refine_status", "processing")
      .lt("updated_at", tenMinutesAgo)
      .select("original_url");

    if (refineOrphans && refineOrphans.length > 0) {
      logger.info(`Reiniciados ${refineOrphans.length} artigos órfãos em refine=processing`, { count: refineOrphans.length });
    }

    const { data: mediaOrphans } = await this.client
      .from("articles")
      .update({
        media_status: "pending",
        published_status: "pending",
      })
      .eq("media_status", "processing")
      .lt("updated_at", tenMinutesAgo)
      .select("original_url");

    if (mediaOrphans && mediaOrphans.length > 0) {
      logger.info(`Reiniciados ${mediaOrphans.length} artigos órfãos em media=processing`, { count: mediaOrphans.length });
    }

    const { data: publishOrphans } = await this.client
      .from("articles")
      .update({
        published_status: "pending",
      })
      .eq("published_status", "processing")
      .lt("updated_at", tenMinutesAgo)
      .select("original_url");

    if (publishOrphans && publishOrphans.length > 0) {
      logger.info(`Reiniciados ${publishOrphans.length} artigos órfãos em publish=processing`, { count: publishOrphans.length });
    }

    let query = this.client
      .from("articles")
      .select(
        "id, site_id, source_url, raw_markdown, extraction_status, refine_status, media_status, published_status",
      )
      .neq("published_status", "published") // Qualquer artigo não publicado
      .neq("published_status", "skipped")   // Excluir artigos marcados como skipped (antigos)
      .order("discovered_at", { ascending: true });

    if (options?.siteIds?.length) {
      query = query.in("site_id", options.siteIds);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase listArticlesForReprocess failed: ${formatError(error)}`);

    return data ?? [];
  }

  async listKnownUrlsForSite(siteId: string, limit = 10000): Promise<Set<string>> {
    if (!siteId) return new Set();
    const { data, error } = await this.client
      .from("articles")
      .select("source_url")
      .eq("site_id", siteId)
      .limit(limit);
    if (error) throw new Error(`Supabase listKnownUrlsForSite failed: ${formatError(error)}`);
    const urls = (data ?? [])
      .map((row) => (row as { source_url?: string }).source_url)
      .filter((u): u is string => Boolean(u));
    return new Set(urls);
  }

  async markArticleStage(input: {
    articleId: string;
    stage: "extraction" | "refine" | "media" | "publish";
    status: "pending" | "processing" | "succeeded" | "failed" | "skipped" | "published";
    error?: string | null;
    payload?: Record<string, unknown> | null;
    refinedMarkdown?: string | null;
    refinedHtml?: string | null;
    focusKeyword?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    faqs?: unknown[] | null;
    imagePrompts?: unknown[] | null;
    heroImageUrl?: string | null;
    inlineImageUrls?: unknown[] | null;
    wordpressPostId?: number | null;
    wordpressPostUrl?: string | null;
    wordpressSlug?: string | null;
    wordpressResponse?: Record<string, unknown> | null;
  }): Promise<Article> {
    const { data, error } = await this.client.rpc("mark_article_stage", {
      p_article_id: input.articleId,
      p_stage: input.stage,
      p_status: input.status,
      p_error: input.error ?? null,
      p_payload: input.payload ?? null,
      p_refined_markdown: input.refinedMarkdown ?? null,
      p_refined_html: input.refinedHtml ?? null,
      p_focus_keyword: input.focusKeyword ?? null,
      p_seo_title: input.seoTitle ?? null,
      p_seo_description: input.seoDescription ?? null,
      p_faqs: input.faqs ?? null,
      p_image_prompts: input.imagePrompts ?? null,
      p_hero_image_url: input.heroImageUrl ?? null,
      p_inline_image_urls: input.inlineImageUrls ?? null,
      p_wordpress_post_id: input.wordpressPostId ?? null,
      p_wordpress_post_url: input.wordpressPostUrl ?? null,
      p_wordpress_slug: input.wordpressSlug ?? null,
      p_wordpress_response: input.wordpressResponse ?? null,
    });
    if (error) throw new Error(`Supabase mark_article_stage failed: ${formatError(error)}`);
    return data as Article;
  }

  // Métodos para gerenciar categorias WordPress
  async upsertWordPressCategory(input: {
    stateCode: string;
    stateName: string;
    categoryName: string;
    categorySlug: string;
    wpCategoryId: number;
  }): Promise<void> {
    const { error } = await this.client.from("wordpress_categories").upsert(
      {
        state_code: input.stateCode,
        state_name: input.stateName,
        category_name: input.categoryName,
        category_slug: input.categorySlug,
        wp_category_id: input.wpCategoryId,
      },
      { onConflict: "state_code" },
    );
    if (error) throw new Error(`Supabase upsertWordPressCategory failed: ${formatError(error)}`);
  }

  async getWordPressCategoryByState(stateCode: string): Promise<{
    id: string;
    state_code: string;
    state_name: string;
    category_name: string;
    category_slug: string;
    wp_category_id: number;
  } | null> {
    const { data, error } = await this.client
      .from("wordpress_categories")
      .select("*")
      .eq("state_code", stateCode)
      .single();
    if (error && error.code !== "PGRST116") {
      throw new Error(`Supabase getWordPressCategoryByState failed: ${formatError(error)}`);
    }
    return data;
  }

  async listAllWordPressCategories(): Promise<Array<{
    id: string;
    state_code: string;
    state_name: string;
    category_name: string;
    category_slug: string;
    wp_category_id: number;
  }>> {
    const { data, error } = await this.client
      .from("wordpress_categories")
      .select("*")
      .order("state_code");
    if (error) throw new Error(`Supabase listAllWordPressCategories failed: ${formatError(error)}`);
    return data ?? [];
  }
}
