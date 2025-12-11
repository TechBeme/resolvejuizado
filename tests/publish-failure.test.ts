import assert from "node:assert/strict";
import { test } from "node:test";

process.env.WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL ?? "https://example.com";
process.env.WORDPRESS_APP_USER = process.env.WORDPRESS_APP_USER ?? "user";
process.env.WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD ?? "pass";
process.env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? "fake-firecrawl-key";
process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "fake-google-key";

class SupabaseStub {
  public stages: Array<{ stage: string; status: string } & Record<string, unknown>> = [];

  async markArticleStage(payload: any) {
    this.stages.push(payload);
    return {} as any;
  }
}

class WordpressStub {
  uploadMedia() {
    throw new Error("uploadMedia should not be called on failure path");
  }

  createPost() {
    throw new Error("createPost should not be called on failure path");
  }
}

test("processAndPublishArticle marks refine failure when AI throws", async () => {
  const supabase = new SupabaseStub();
  const wordpress = new WordpressStub();

  const { processAndPublishArticle } = await import("../src/pipeline/publish.js");

  await assert.rejects(
    () =>
      processAndPublishArticle({
        sourceUrl: "https://example.com",
        rawContent: "conteudo",
        wordpress: wordpress as any,
        publishStatus: "draft",
        supabase: supabase as any,
        articleId: "article-err",
        siteId: "site-err",
        runId: "run-err",
        aiOverrides: {
          generateNewsArticle: async () => {
            throw new Error("news generation failed");
          },
          validateNewsArticle: () => {
            throw new Error("should not be called");
          },
          reviewNewsArticle: async () => {
            throw new Error("should not be called");
          },
          generateArticleImages: async () => {
            throw new Error("should not be called");
          },
        },
      }),
    /news generation failed/,
  );

  const statuses = supabase.stages.map((s) => `${s.stage}:${s.status}`);
  assert.deepEqual(statuses, ["refine:processing", "refine:failed"]);
});
