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
  async uploadMedia() {
    return { id: 10, source_url: "https://wp/media.jpg" };
  }

  async createPost() {
    return { id: 20, link: "https://wp/post", slug: "post-slug", status: "draft" };
  }
}

test("processAndPublishArticle updates Supabase stages and posts to WordPress", async () => {
  const supabase = new SupabaseStub();
  const wordpress = new WordpressStub();

  const { processAndPublishArticle } = await import("../src/pipeline/publish.js");

  await processAndPublishArticle({
    sourceUrl: "https://example.com",
    rawContent: "conteudo",
    wordpress: wordpress as any,
    publishStatus: "draft",
    supabase: supabase as any,
    articleId: "article-1",
    siteId: "site-1",
    runId: "run-1",
    aiOverrides: {
      generateNewsArticle: async () => ({
        title: "Titulo com menos de 60 caracteres",
        bodyMarkdown: "Corpo com palavra-chave e conteúdo suficiente para validação SEO. ".repeat(30),
        focusKeyword: "palavra-chave",
        seoTitle: "SEO Title com palavra-chave e menos de 60 chars",
        seoDescription: "Descrição SEO persuasiva com palavra-chave nos primeiros caracteres e tamanho entre 150 e 175 caracteres incluindo espaços para passar na validação",
        slug: "slug-final",
        faqs: [
          { question: "q1", answer: "a1" },
          { question: "q2", answer: "a2" },
          { question: "q3", answer: "a3" },
          { question: "q4", answer: "a4" },
          { question: "q5", answer: "a5" },
        ],
        imagePrompts: ["img1", "img2", "img3"],
      }),
      validateNewsArticle: () => ({
        titleLength: 40,
        titleValid: true,
        seoTitleLength: 50,
        seoTitleValid: true,
        seoDescriptionLength: 160,
        seoDescriptionValid: true,
        slugLength: 15,
        slugValid: true,
        bodyWordCount: 800,
        bodyValid: true,
        faqsCount: 5,
        faqsValid: true,
        imagePromptsCount: 3,
        imagePromptsValid: true,
        issues: [],
      }),
      reviewNewsArticle: async ({ newsResult }: any) => newsResult,
      generateArticleImages: async () => [
        { data: new Uint8Array([1]), mimeType: "image/png", filename: "a.png", prompt: "p" },
        { data: new Uint8Array([2]), mimeType: "image/png", filename: "b.png", prompt: "p" },
      ],
    },
  });

  const statuses = supabase.stages.map((s) => `${s.stage}:${s.status}`);
  assert.deepEqual(statuses, [
    "refine:processing",
    "refine:succeeded",
    "media:processing",
    "media:succeeded",
    "publish:processing",
    "publish:published",
  ]);

  const publishEvent = supabase.stages.find((s) => s.stage === "publish" && s.status === "published");
  assert.ok(publishEvent, "publish event recorded");
  assert.ok(publishEvent?.p_wordpress_post_id ?? publishEvent?.wordpressPostId ?? publishEvent?.wordpress_post_id);
});
