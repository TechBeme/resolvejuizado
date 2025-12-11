import { marked } from "marked";
import { WordPressClient } from "../clients/wordpress.js";
import type { SupabaseClient } from "../clients/supabase.js";
import type { FirecrawlPool } from "../clients/firecrawl-pool.js";
import {
  generateArticleImages,
  generateNewsArticle,
  reviewNewsArticle,
  validateNewsArticle,
  type NewsGenerationResult,
} from "../ai/content.js";
import { extractStateFromUrl } from "../config/states.js";
import { logger } from "../logger.js";
import { optimizeImage, formatBytes } from "../utils/image-optimizer.js";

type Faq = { question: string; answer: string };
type ImageRef = { url: string; alt: string };

type ProcessOptions = {
  sourceUrl: string;
  rawContent: string;
  wordpress: WordPressClient;
  focusKeywordOverride?: string;
  publishStatus?: "draft" | "publish";
  inlineImageCount?: number;
  imageTotal?: number;
  supabase?: SupabaseClient;
  articleId?: string;
  siteId?: string;
  runId?: string;
  aiOverrides?: Partial<AiDependencies>;
  firecrawlPool?: FirecrawlPool;
};

type ProcessResult = {
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  uploadedImages: ImageRef[];
  post?: unknown;
};

type AiDependencies = {
  generateNewsArticle: typeof generateNewsArticle;
  reviewNewsArticle: typeof reviewNewsArticle;
  validateNewsArticle: typeof validateNewsArticle;
  generateArticleImages: typeof generateArticleImages;
};

const buildFaqHtml = (faqs: Faq[]) =>
  faqs
    .map((faq) => `<details><summary>${faq.question}</summary><p>${faq.answer}</p></details>`)
    .join("\n");

const buildFigureHtml = (image: ImageRef) =>
  `<figure><img src="${image.url}" alt="${image.alt}" /></figure>`;

const insertInlineImages = (bodyHtml: string, images: ImageRef[]) => {
  const figures = images.map(buildFigureHtml);
  if (!figures.length) return bodyHtml;

  const blocks = bodyHtml.split(/(?<=<\/p>)/);
  if (blocks.length < 2) {
    return [bodyHtml, ...figures].join("\n\n");
  }

  const midIndex = Math.floor(blocks.length / 2);
  const withMidImage = [...blocks];
  if (figures[0]) {
    withMidImage.splice(midIndex, 0, figures[0]);
  }
  if (figures[1]) {
    withMidImage.splice(withMidImage.length, 0, figures[1]);
  }
  return withMidImage.join("");
};

export async function processAndPublishArticle(options: ProcessOptions): Promise<ProcessResult> {
  const {
    rawContent,
    sourceUrl,
    wordpress,
    focusKeywordOverride,
    publishStatus = "draft",
    inlineImageCount = 2,
    imageTotal = 3,
    supabase,
    articleId,
    siteId,
    runId,
    aiOverrides,
    firecrawlPool,
  } = options;

  const ai: AiDependencies = {
    generateNewsArticle,
    reviewNewsArticle,
    validateNewsArticle,
    generateArticleImages,
    ...aiOverrides,
  };

  const supabaseContext = { sourceUrl, siteId, runId };
  const markStage = async (
    stage: "refine" | "media" | "publish",
    status: "pending" | "processing" | "succeeded" | "failed" | "skipped" | "published",
    payload?: {
      error?: string | null;
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
      extraPayload?: Record<string, unknown> | null;
    },
  ) => {
    if (!supabase || !articleId) return;
    try {
      await supabase.markArticleStage({
        articleId,
        stage,
        status,
        error: payload?.error ?? null,
        payload: { ...supabaseContext, ...(payload?.extraPayload ?? {}) },
        refinedMarkdown: payload?.refinedMarkdown ?? null,
        refinedHtml: payload?.refinedHtml ?? null,
        focusKeyword: payload?.focusKeyword ?? null,
        seoTitle: payload?.seoTitle ?? null,
        seoDescription: payload?.seoDescription ?? null,
        faqs: payload?.faqs ?? null,
        imagePrompts: payload?.imagePrompts ?? null,
        heroImageUrl: payload?.heroImageUrl ?? null,
        inlineImageUrls: payload?.inlineImageUrls ?? null,
        wordpressPostId: payload?.wordpressPostId ?? null,
        wordpressPostUrl: payload?.wordpressPostUrl ?? null,
        wordpressSlug: payload?.wordpressSlug ?? null,
        wordpressResponse: payload?.wordpressResponse ?? null,
      });
    } catch (err) {
      logger.warn("Failed to mark article stage in Supabase", {
        articleId,
        stage,
        status,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  };

  let currentStage: "refine" | "media" | "publish" = "refine";
  await markStage("refine", "processing");

  try {
    // IA 1: Gera artigo completo (title + body + SEO + FAQs + imagePrompts)
    const newsResult = await ai.generateNewsArticle({
      url: sourceUrl,
      content: rawContent,
      wordpressBaseUrl: wordpress.getBaseUrl(),
    });

    // Validação automática do resultado
    const validationReport = ai.validateNewsArticle(newsResult, sourceUrl);

    // logger.debug("Geração de notícia concluída", {
    //   sourceUrl,
    //   validation: {
    //     valid: validationReport.issues.length === 0,
    //     issues: validationReport.issues,
    //   },
    // });

    // IA 2: Revisão (se necessário, com retry até 3x)
    let finalResult: NewsGenerationResult;
    if (validationReport.issues.length > 0) {
      // logger.debug("Iniciando processo de revisão com IA 2", {
      //   sourceUrl,
      //   issues: validationReport.issues,
      // });
      finalResult = await ai.reviewNewsArticle({
        sourceUrl,
        newsResult,
        validationReport,
        wordpressBaseUrl: wordpress.getBaseUrl(),
        maxRetries: 3,
      });
    } else {
      // logger.debug("Validação aprovada, pulando revisão", { sourceUrl });
      finalResult = newsResult;
    }

    // Aplicar override de palavra-chave se fornecido
    if (focusKeywordOverride) {
      finalResult = { ...finalResult, focusKeyword: focusKeywordOverride };
    }

    const focusKeyword = finalResult.focusKeyword;
    const finalBody = finalResult.bodyMarkdown;
    const finalSeoTitle = finalResult.seoTitle;
    const finalSeoDescription = finalResult.seoDescription;
    const finalSlug = finalResult.slug;
    const finalFaqs = finalResult.faqs;
    const finalImagePrompts = finalResult.imagePrompts;

    const baseBodyHtml = await marked.parse(finalBody);

    await markStage("refine", "succeeded", {
      refinedMarkdown: finalBody,
      refinedHtml: baseBodyHtml,
      focusKeyword,
      seoTitle: finalSeoTitle,
      seoDescription: finalSeoDescription,
      faqs: finalFaqs,
      imagePrompts: finalImagePrompts,
    });
    currentStage = "media";
    await markStage("media", "processing");
    const images = await ai.generateArticleImages(finalImagePrompts, imageTotal, wordpress.getBaseUrl());

    // Upload de imagens em paralelo com otimização
    const uploaded: { id: number; url: string; alt: string }[] = [];
    const uploadPromises = images.map(async (img, idx) => {
      const alt = focusKeyword || "";

      // Featured (1ª): 800px width | Inline (2ª/3ª): 600px width
      // Proporção 16:9 mantida automaticamente pelo Gemini
      const isFeature = idx === 0;
      const targetWidth = isFeature ? 800 : 600;

      const optimized = await optimizeImage(img.data, {
        maxWidth: targetWidth,
        maxHeight: Math.round(targetWidth / 16 * 9), // Mantém 16:9
        jpegQuality: 82,
        format: "auto",
      });

      // logger.debug("Image optimized", {
      //   image: idx + 1,
      //   original: formatBytes(optimized.originalSize),
      //   optimized: formatBytes(optimized.optimizedSize),
      //   saved: `${optimized.compressionRatio.toFixed(1)}%`,
      // });

      const media = await wordpress.uploadMedia({
        filename: img.filename,
        data: optimized.data,
        mimeType: optimized.mimeType,
        altText: alt,
      });
      return { id: media.id, url: media.source_url, alt };
    });

    const uploadResults = await Promise.allSettled(uploadPromises);
    for (const result of uploadResults) {
      if (result.status === "fulfilled") {
        uploaded.push(result.value);
      } else {
        logger.warn("Image upload failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }

    const featuredImage = uploaded[0];
    const inlineImages = uploaded.slice(1, 1 + inlineImageCount);
    const bodyWithInlineImages = insertInlineImages(baseBodyHtml, inlineImages);
    const contentHtml = [
      bodyWithInlineImages,
      "<h2>Perguntas Frequentes</h2>",
      buildFaqHtml(finalFaqs),
    ].join("\n\n");

    await markStage("media", "succeeded", {
      heroImageUrl: featuredImage?.url ?? null,
      inlineImageUrls: inlineImages.map((img) => img.url),
      extraPayload: { uploadedImages: uploaded.map((img) => img.url) },
    });

    currentStage = "publish";
    await markStage("publish", "processing");

    // Determinar categoria baseada no estado do site
    const categories: number[] = [];
    if (sourceUrl && supabase) {
      const stateCode = extractStateFromUrl(sourceUrl);
      if (stateCode) {
        try {
          const categoryData = await supabase.getWordPressCategoryByState(stateCode);
          if (categoryData) {
            categories.push(categoryData.wp_category_id);
            // Using category for state (silenciado)
          } else {
            logger.warn("No category found for state", { stateCode, sourceUrl });
          }
        } catch (error) {
          logger.error("Failed to get category", {
            stateCode,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const post = await wordpress.createPost({
      title: finalSeoTitle,
      slug: finalSlug,
      content: contentHtml,
      status: publishStatus,
      featured_media: featuredImage?.id,
      categories: categories.length > 0 ? categories : undefined,
      meta: {
        _rank_math_focus_keyword: focusKeyword,
        _rank_math_title: finalSeoTitle,
        _rank_math_description: finalSeoDescription,
        rank_math_focus_keyword: focusKeyword,
        rank_math_title: finalSeoTitle,
        rank_math_description: finalSeoDescription,
      },
    });

    await markStage("publish", "published", {
      wordpressPostId: (post as { id?: number } | undefined)?.id ?? null,
      wordpressPostUrl: (post as { link?: string } | undefined)?.link ?? null,
      wordpressSlug: (post as { slug?: string } | undefined)?.slug ?? null,
      extraPayload: { postStatus: (post as { status?: string } | undefined)?.status ?? publishStatus },
    });

    return {
      focusKeyword,
      seoTitle: finalSeoTitle,
      seoDescription: finalSeoDescription,
      slug: finalSlug,
      uploadedImages: uploaded,
      post,
    };
  } catch (error) {
    await markStage(currentStage, "failed", { error: String(error) });
    throw error;
  }
}
