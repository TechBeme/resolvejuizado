import { experimental_generateImage as generateImage, generateObject, generateText } from "ai";
import type { GeneratedFile } from "ai";
import { z } from "zod";

import { resolveImageModel, resolveTextModel, isGoogleImageModel } from "./models.js";
import { getRewritePrompt, getReviewerPrompt, getAITextModel, getAIImageModel } from "../prompts/loader.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

/**
 * Helper para exibir erros de validação de schema de forma legível
 */
function logSchemaValidationError(error: unknown, url: string, model: string, context: string) {
  console.error(`\n❌ Erro de validação do schema ${context}`);
  console.error(`   URL: ${url}`);

  let foundIssues = false;

  if (error instanceof Error) {
    // Tenta extrair detalhes do erro
    const errorObj = error as any;

    // Vercel AI SDK: error.cause.value pode ter o objeto parcial gerado
    if (errorObj.cause?.value) {
      const partialValue = errorObj.cause.value;
      console.error('\n   📊 Objeto parcial gerado pela IA:');

      // title: 8-80
      const titleLen = partialValue.title?.length || 0;
      const titleOk = titleLen >= 8 && titleLen <= 80;
      console.error(`      title: ${partialValue.title ? `"${partialValue.title}" (${titleLen} chars)` : 'AUSENTE'} ${!titleOk ? '❌ FORA DO LIMITE (8-80)' : '✅'}`);

      // bodyMarkdown: min 400
      const bodyLen = partialValue.bodyMarkdown?.length || 0;
      const bodyOk = bodyLen >= 400;
      console.error(`      bodyMarkdown: ${bodyLen} chars ${!bodyOk ? '❌ MÍNIMO 400' : '✅'}`);

      // focusKeyword: 3-60
      const keywordLen = partialValue.focusKeyword?.length || 0;
      const keywordOk = keywordLen >= 3 && keywordLen <= 60;
      console.error(`      focusKeyword: ${partialValue.focusKeyword ? `"${partialValue.focusKeyword}" (${keywordLen} chars)` : 'AUSENTE'} ${!keywordOk ? '❌ FORA DO LIMITE (3-60)' : '✅'}`);

      // seoTitle: 8-60
      const seoTitleLen = partialValue.seoTitle?.length || 0;
      const seoTitleOk = seoTitleLen >= 8 && seoTitleLen <= 60;
      console.error(`      seoTitle: ${partialValue.seoTitle ? `"${partialValue.seoTitle}" (${seoTitleLen} chars)` : 'AUSENTE'} ${!seoTitleOk ? '❌ FORA DO LIMITE (8-60)' : '✅'}`);

      // seoDescription: 120-200
      const seoDescLen = partialValue.seoDescription?.length || 0;
      const seoDescOk = seoDescLen >= 120 && seoDescLen <= 200;
      console.error(`      seoDescription: ${seoDescLen} chars ${!seoDescOk ? '❌ FORA DO LIMITE (120-200)' : '✅'}`);

      // slug: 5-38
      const slugLen = partialValue.slug?.length || 0;
      const slugOk = slugLen >= 5 && slugLen <= 38;
      console.error(`      slug: ${partialValue.slug ? `"${partialValue.slug}" (${slugLen} chars)` : 'AUSENTE'} ${!slugOk ? '❌ FORA DO LIMITE (5-38)' : '✅'}`);

      // faqs: 3-5
      const faqsCount = partialValue.faqs?.length || 0;
      const faqsOk = faqsCount >= 3 && faqsCount <= 5;
      console.error(`      faqs: ${faqsCount} itens ${!faqsOk ? '❌ FORA DO LIMITE (3-5)' : '✅'}`);

      // imagePrompts: 1-5
      const imgsCount = partialValue.imagePrompts?.length || 0;
      const imgsOk = imgsCount >= 1 && imgsCount <= 5;
      console.error(`      imagePrompts: ${imgsCount} itens ${!imgsOk ? '❌ FORA DO LIMITE (1-5)' : '✅'}`);

      foundIssues = true;
    }

    // Vercel AI SDK: error.cause pode ter responseMessages com texto raw
    if (!foundIssues && errorObj.cause?.responseMessages) {
      const messages = errorObj.cause.responseMessages;
      for (const msg of messages) {
        if (msg.content && typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content);
            if (Array.isArray(parsed)) {
              console.error('\n   📋 Campos com problema:');
              parsed.forEach((issue: any) => {
                const path = issue.path?.join('.') || 'root';
                console.error(`      • ${path}: ${issue.message}`);
              });
              foundIssues = true;
            }
          } catch { }
        }
      }
    }

    // Zod error direto no cause
    if (!foundIssues && errorObj.cause?.issues) {
      console.error('\n   📋 Campos com problema:');
      errorObj.cause.issues.forEach((issue: any) => {
        const path = issue.path?.join('.') || 'root';
        console.error(`      • ${path}: ${issue.message}`);
      });
      foundIssues = true;
    }

    // Tenta parsear do próprio error message
    if (!foundIssues) {
      try {
        const match = error.message.match(/\[(.+?)\]/);
        if (match) {
          const issues = JSON.parse(match[1]);
          if (Array.isArray(issues)) {
            console.error('\n   📋 Campos com problema:');
            issues.forEach((issue: any) => {
              const path = issue.path?.join('.') || 'root';
              console.error(`      • ${path}: ${issue.message}`);
            });
            foundIssues = true;
          }
        }
      } catch { }
    }

    // Se não encontrou issues específicas, mostra requisitos
    if (!foundIssues) {
      console.error('\n   ⚠️  Não foi possível extrair detalhes específicos do erro.');
      console.error('   📏 Requisitos do schema:');
      console.error('      • title: 8-80 caracteres');
      console.error('      • bodyMarkdown: mínimo 400 caracteres + focusKeyword no início (primeiros 10%)');
      console.error('      • focusKeyword: 3-60 caracteres');
      console.error('      • seoTitle: 8-60 caracteres (COMPLETO, nunca truncado)');
      console.error('      • seoDescription: 120-200 caracteres (ideal 150-175) + DEVE conter focusKeyword');
      console.error('      • slug: 5-38 caracteres (kebab-case)');
      console.error('      • faqs: array com 3-5 objetos {question, answer}');
      console.error('      • imagePrompts: array com 1-5 strings');
      console.error('\n   🎯 VALIDAÇÕES OBRIGATÓRIAS RANKMATH:');
      console.error('      • Focus keyword DEVE aparecer na seoDescription');
      console.error('      • Focus keyword DEVE aparecer no corpo do conteúdo');
      console.error('      • Focus keyword DEVE aparecer nos primeiros 10% do conteúdo');

      // Debug: mostra estrutura do erro para análise
      console.error('\n   🔍 Debug - Estrutura do erro:');
      console.error(`      message: ${error.message.slice(0, 100)}`);
      if (errorObj.cause) {
        console.error(`      cause keys: ${Object.keys(errorObj.cause).join(', ')}`);
      }
    }
    console.error();
  }
}

export type FAQ = { question: string; answer: string };

export type NewsGenerationResult = {
  title: string;
  bodyMarkdown: string;
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  faqs: FAQ[];
  imagePrompts: string[];
};

export type ValidationReport = {
  titleLength: number;
  titleValid: boolean;
  seoTitleLength: number;
  seoTitleValid: boolean;
  seoDescriptionLength: number;
  seoDescriptionValid: boolean;
  slugLength: number;
  slugValid: boolean;
  bodyWordCount: number;
  bodyValid: boolean;
  faqsCount: number;
  faqsValid: boolean;
  imagePromptsCount: number;
  imagePromptsValid: boolean;
  issues: string[];
};

export type GeneratedImage = {
  data: Uint8Array;
  mimeType: string;
  prompt: string;
  filename: string;
};

const clampToWord = (value: string, max: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > Math.floor(max * 0.6)) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
};

const slugify = (value: string, max: number) => {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clampToWord(normalized, max);
};

// Schema para a IA de Geração de Notícias (tudo em um)
const newsGenerationSchema = z.object({
  title: z.string().min(8).max(80).describe("Título principal do artigo (max 80 caracteres)"),
  bodyMarkdown: z.string().min(400).describe("Corpo completo do artigo em markdown. OBRIGATÓRIO: a palavra-chave DEVE aparecer no primeiro parágrafo do texto (primeiros 10% do conteúdo) de forma natural."),
  focusKeyword: z.string().min(3).max(60).describe("Palavra-chave principal (2-5 palavras, minúsculas)"),
  seoTitle: z
    .string()
    .min(8)
    .max(60)
    .describe("Título SEO otimizado (MÁXIMO 60 caracteres incluindo espaços) - completo, nunca truncado"),
  seoDescription: z
    .string()
    .min(120)
    .max(200)
    .describe("Meta descrição SEO (ENTRE 150-175 caracteres) - persuasiva com CTA. OBRIGATÓRIO: DEVE incluir a palavra-chave (focusKeyword) de forma natural no texto."),
  slug: z
    .string()
    .min(5)
    .max(38)
    .describe("URL slug (max 38 chars, kebab-case)")
    .transform((s) => slugify(s, 38)),
  faqs: z
    .array(
      z.object({
        question: z.string().min(5),
        answer: z.string().min(5),
      }),
    )
    .min(3)
    .max(5),
  imagePrompts: z.array(z.string().min(5)).min(1).max(5),
});

// Schema para a IA Revisora
const reviewerSchema = z.object({
  title: z.string().min(8).max(80).describe("Título revisado (max 80 chars)"),
  bodyMarkdown: z.string().min(400).describe("Corpo revisado em markdown. GARANTIR: a palavra-chave DEVE estar no primeiro parágrafo (primeiros 10% do texto)."),
  focusKeyword: z.string().min(3).max(60).describe("Palavra-chave revisada"),
  seoTitle: z
    .string()
    .min(8)
    .max(60)
    .describe("SEO Title CORRIGIDO (MÁXIMO 60 chars, completo)"),
  seoDescription: z
    .string()
    .min(120)
    .max(200)
    .describe("Meta description CORRIGIDA (ENTRE 150-175 chars). GARANTIR: DEVE conter a palavra-chave (focusKeyword) de forma natural."),
  slug: z
    .string()
    .min(5)
    .max(38)
    .describe("Slug corrigido (max 38 chars)")
    .transform((s) => slugify(s, 38)),
  faqs: z
    .array(
      z.object({
        question: z.string().min(5),
        answer: z.string().min(5),
      }),
    )
    .min(3)
    .max(5),
  imagePrompts: z.array(z.string().min(5)).min(1).max(5),
  changesLog: z.string().describe("Log das alterações realizadas"),
});

// Função auxiliar para normalizar texto (remove acentos, lowercase, espaços extras)
function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacríticos
    .toLowerCase()
    .trim();
}

// Função auxiliar para verificar se keyword aparece no texto (case-insensitive, ignora acentos)
function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  return normalizedText.includes(normalizedKeyword);
}

// Função para validar resultado da IA
function validateNewsGeneration(result: NewsGenerationResult, sourceUrl: string): ValidationReport {
  const issues: string[] = [];

  const titleLength = result.title.length;
  const titleValid = titleLength <= 80;
  if (!titleValid) issues.push(`Title too long: ${titleLength} chars (max 80)`);

  const seoTitleLength = result.seoTitle.length;
  const seoTitleValid = seoTitleLength <= 60;
  if (!seoTitleValid) issues.push(`SEO Title too long: ${seoTitleLength} chars (max 60)`);

  const seoDescriptionLength = result.seoDescription.length;
  const seoDescriptionValid = seoDescriptionLength >= 150 && seoDescriptionLength <= 175;
  if (!seoDescriptionValid) {
    issues.push(`SEO Description invalid length: ${seoDescriptionLength} chars (required 150-175)`);
  }

  const slugLength = result.slug.length;
  const slugValid = slugLength <= 38;
  if (!slugValid) issues.push(`Slug too long: ${slugLength} chars (max 38)`);

  const bodyWordCount = result.bodyMarkdown.split(/\s+/).filter(Boolean).length;
  const bodyValid = bodyWordCount >= 600;
  if (!bodyValid) issues.push(`Body too short: ${bodyWordCount} words (min 600)`);

  const faqsCount = result.faqs.length;
  const faqsValid = faqsCount >= 3 && faqsCount <= 5;
  if (!faqsValid) issues.push(`Invalid FAQs count: ${faqsCount} (required 3-5)`);

  const imagePromptsCount = result.imagePrompts.length;
  const imagePromptsValid = imagePromptsCount >= 1 && imagePromptsCount <= 5;
  if (!imagePromptsValid) issues.push(`Invalid image prompts count: ${imagePromptsCount} (required 1-5)`);

  // ===== VALIDAÇÕES OBRIGATÓRIAS DO RANKMATH =====

  // 1. Focus keyword DEVE aparecer na SEO Description
  const keywordInDescription = containsKeyword(result.seoDescription, result.focusKeyword);
  if (!keywordInDescription) {
    issues.push(
      `Focus keyword "${result.focusKeyword}" NOT FOUND in SEO Description. ` +
      `RankMath requires it for SEO score.`
    );
  }

  // 2. Focus keyword DEVE aparecer no corpo do conteúdo (pelo menos 1x)
  const keywordInBody = containsKeyword(result.bodyMarkdown, result.focusKeyword);
  if (!keywordInBody) {
    issues.push(
      `Focus keyword "${result.focusKeyword}" NOT FOUND in body content. ` +
      `RankMath requires it for SEO score.`
    );
  }

  // 3. Focus keyword DEVE aparecer no início do conteúdo (primeiros 10% ou 300 palavras)
  const words = result.bodyMarkdown.split(/\s+/).filter(Boolean);
  const firstWordsCount = Math.max(Math.floor(words.length * 0.1), Math.min(300, words.length));
  const firstPortion = words.slice(0, firstWordsCount).join(" ");
  const keywordAtStart = containsKeyword(firstPortion, result.focusKeyword);
  if (!keywordAtStart) {
    issues.push(
      `Focus keyword "${result.focusKeyword}" NOT FOUND in first 10% of content (${firstWordsCount} words). ` +
      `RankMath requires it at the beginning for SEO score.`
    );
  }

  return {
    titleLength,
    titleValid,
    seoTitleLength,
    seoTitleValid,
    seoDescriptionLength,
    seoDescriptionValid,
    slugLength,
    slugValid,
    bodyWordCount,
    bodyValid,
    faqsCount,
    faqsValid,
    imagePromptsCount,
    imagePromptsValid,
    issues,
  };
}

// IA 1: Geração completa de notícia + SEO
export async function generateNewsArticle(input: {
  url: string;
  content: string;
  wordpressBaseUrl: string;
}): Promise<NewsGenerationResult> {
  const currentYear = new Date().getFullYear();
  const prompt = await getRewritePrompt(
    {
      sourceUrl: input.url,
      content: input.content,
      today: new Date().toISOString().slice(0, 10),
      currentYear,
    },
    input.wordpressBaseUrl,
  );

  // Busca modelo do WordPress ou usa fallback do .env
  const textModel = await getAITextModel(input.wordpressBaseUrl, env.textModel);

  try {
    const { object } = await generateObject({
      model: resolveTextModel(textModel),
      prompt,
      schema: newsGenerationSchema,
      mode: "json",
      temperature: 0.35,
      maxRetries: 2,
    });

    return {
      title: object.title.trim(),
      bodyMarkdown: object.bodyMarkdown.trim(),
      focusKeyword: object.focusKeyword.trim(),
      seoTitle: object.seoTitle.trim(),
      seoDescription: object.seoDescription.trim(),
      slug: object.slug.trim(),
      faqs: object.faqs,
      imagePrompts: object.imagePrompts.map((p) => p.trim()).filter(Boolean),
    };
  } catch (error) {
    logSchemaValidationError(error, input.url, textModel, 'na geração de notícia');
    throw error;
  }
}

// IA 2: Revisão do conteúdo gerado (com retry até 3x)
export async function reviewNewsArticle(input: {
  sourceUrl: string;
  newsResult: NewsGenerationResult;
  validationReport: ValidationReport;
  wordpressBaseUrl: string;
  maxRetries?: number;
}): Promise<NewsGenerationResult> {
  const maxRetries = input.maxRetries ?? 3;
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  let currentResult = input.newsResult;
  let currentValidation = input.validationReport;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Se não há issues, retorna o resultado atual
    if (currentValidation.issues.length === 0) {
      logger.debug("News article passed validation", {
        sourceUrl: input.sourceUrl,
        attempt
      });
      return currentResult;
    }

    logger.debug(`Reviewer AI attempt ${attempt}/${maxRetries}`, {
      sourceUrl: input.sourceUrl,
      issues: currentValidation.issues,
    });

    const prompt = await getReviewerPrompt(
      {
        sourceUrl: input.sourceUrl,
        today,
        currentYear,
        title: currentResult.title,
        bodyMarkdown: currentResult.bodyMarkdown,
        focusKeyword: currentResult.focusKeyword,
        seoTitle: currentResult.seoTitle,
        seoDescription: currentResult.seoDescription,
        slug: currentResult.slug,
        faqs: currentResult.faqs,
        imagePrompts: currentResult.imagePrompts,
        validationReport: currentValidation,
      },
      input.wordpressBaseUrl,
    );

    try {
      // Busca modelo do WordPress ou usa fallback do .env
      const textModel = await getAITextModel(input.wordpressBaseUrl, env.textModel);

      const { object } = await generateObject({
        model: resolveTextModel(textModel),
        prompt,
        schema: reviewerSchema,
        mode: "json",
        temperature: 0.25,
        maxRetries: 2,
      });

      currentResult = {
        title: object.title.trim(),
        bodyMarkdown: object.bodyMarkdown.trim(),
        focusKeyword: object.focusKeyword.trim(),
        seoTitle: object.seoTitle.trim(),
        seoDescription: object.seoDescription.trim(),
        slug: object.slug.trim(),
        faqs: object.faqs,
        imagePrompts: object.imagePrompts.map((p) => p.trim()).filter(Boolean),
      };

      logger.debug("Reviewer AI changes", {
        sourceUrl: input.sourceUrl,
        attempt,
        changesLog: object.changesLog,
      });

      // Valida novamente
      currentValidation = validateNewsGeneration(currentResult, input.sourceUrl);

    } catch (error) {
      const textModel = await getAITextModel(input.wordpressBaseUrl, env.textModel);
      logSchemaValidationError(error, input.sourceUrl, textModel, `na revisão (tentativa ${attempt}/${maxRetries})`);

      if (currentValidation.issues.length > 0) {
        console.error('   💡 Problemas que deveriam ter sido corrigidos:');
        currentValidation.issues.forEach(issue => console.error(`      • ${issue}`));
        console.error();
      }

      logger.error(`Reviewer AI attempt ${attempt} failed`, {
        sourceUrl: input.sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      // Se é a última tentativa, lança o erro
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to generate valid news article after ${maxRetries} attempts. ` +
          `URL: ${input.sourceUrl}. Issues: ${currentValidation.issues.join(", ")}`
        );
      }
    }
  }

  // Se chegou aqui após todas as tentativas e ainda tem issues
  throw new Error(
    `Failed to generate valid news article after ${maxRetries} attempts. ` +
    `URL: ${input.sourceUrl}. Remaining issues: ${currentValidation.issues.join(", ")}`
  );
}

// Função pública para validação (pode ser usada externamente)
export function validateNewsArticle(result: NewsGenerationResult, sourceUrl: string): ValidationReport {
  return validateNewsGeneration(result, sourceUrl);
}

const extractImageData = (file: GeneratedFile): { data: Uint8Array; mimeType: string } => {
  const mimeType = file.mediaType ?? "image/png";
  const data = file.uint8Array ?? Uint8Array.from(Buffer.from(file.base64, "base64"));
  return { data, mimeType };
};

export async function generateArticleImages(
  prompts: string[],
  count = 3,
  wordpressBaseUrl?: string,
): Promise<GeneratedImage[]> {
  const trimmedPrompts = prompts.map((p) => p.trim()).filter(Boolean);
  while (trimmedPrompts.length < count) {
    trimmedPrompts.push(trimmedPrompts[trimmedPrompts.length - 1] ?? "imagem ilustrativa da notícia");
  }

  const promptsToUse = trimmedPrompts.slice(0, count);

  // Busca modelo do WordPress ou usa fallback do .env
  const imageModel = wordpressBaseUrl
    ? await getAIImageModel(wordpressBaseUrl, env.imageModel)
    : env.imageModel;

  const resolved = resolveImageModel(imageModel);

  const toPortugueseNoTextPrompt = (prompt: string) =>
    [
      "Fotojornalismo realista em português brasileiro, luz natural, foco nítido.",
      "Não inclua texto, letras, logotipos, marcas d'água ou palavras na imagem.",
      prompt,
    ].join(" ");

  const generateOne = async (prompt: string, idx: number): Promise<GeneratedImage> => {
    const finalPrompt = toPortugueseNoTextPrompt(prompt);

    if (resolved.kind === "language") {
      if (!isGoogleImageModel(imageModel)) {
        throw new Error("Configured image model is not supported for language-based image generation.");
      }

      // Gemini 2.5 Flash Image usa generateText com imageConfig via providerOptions
      const result = await generateText({
        model: resolved.model,
        prompt: `Gere exatamente uma imagem de alta qualidade para ilustrar esta notícia. Estilo fotojornalístico natural. ${finalPrompt}`,
        providerOptions: {
          google: {
            imageConfig: {
              aspectRatio: "16:9",
            },
          },
        },
      });
      const file = (result.files ?? []).find((f) => f.mediaType?.startsWith("image/"));
      if (!file) {
        throw new Error("AI image generation (google) returned no image file.");
      }
      const { data, mimeType } = extractImageData(file);
      return {
        data,
        mimeType,
        prompt,
        filename: `image-${idx + 1}.${mimeType.includes("jpeg") ? "jpg" : "png"}`,
      };
    }

    // Outros modelos (OpenAI DALL-E, etc)
    const result = await generateImage({
      model: resolved.model,
      prompt: finalPrompt,
      n: 1,
      aspectRatio: "16:9",
    });
    const file = result.image;
    const { data, mimeType } = extractImageData(file);
    return {
      data,
      mimeType,
      prompt,
      filename: `image-${idx + 1}.${mimeType.includes("jpeg") ? "jpg" : "png"}`,
    };
  };

  return Promise.all(promptsToUse.map((prompt, idx) => generateOne(prompt, idx)));
}
