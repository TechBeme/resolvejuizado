import { buildRewritePrompt, type RewritePromptInput, buildReviewerPrompt, type ReviewerPromptInput } from "./types.js";
import { logger } from "../logger.js";

// Cache de prompts em memória (evita requests repetidos)
const promptCache = new Map<string, string>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let cacheTimestamp = 0;

/**
 * Busca configurações do WordPress via REST API
 * Retorna objeto com modelos AI e prompts ou null se falhar
 */
async function fetchWordPressConfig(wordpressBaseUrl: string): Promise<{
    ai_text_model: string;
    ai_image_model: string;
    news_rewrite_prompt: string;
    news_reviewer_prompt: string;
} | null> {
    try {
        const url = `${wordpressBaseUrl.replace(/\/+$/, "")}/wp-json/resolvejuizado/v1/config`;
        const response = await fetch(url, {
            method: "GET",
            headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
            logger.warn("Falha ao buscar configurações do WordPress", { status: response.status });
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        logger.warn("Erro ao buscar configurações do WordPress", { error: String(error) });
        return null;
    }
}

/**
 * Substitui variáveis {{key}} no template do prompt
 */
function interpolateTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = variables[key];
        return value !== undefined ? String(value) : match;
    });
}

/**
 * Carrega prompt do WordPress ou usa o default
 * Implementa cache para reduzir chamadas à API
 */
async function loadPrompt(
    key: string,
    wordpressBaseUrl: string,
    defaultBuilder: () => string,
): Promise<string> {
    const now = Date.now();
    const cacheKey = `${wordpressBaseUrl}:${key}`;

    // Verifica cache
    if (promptCache.has(cacheKey) && now - cacheTimestamp < CACHE_TTL) {
        return promptCache.get(cacheKey)!;
    }

    // Busca do WordPress (apenas 1x, pega todas as configs)
    if (!promptCache.has(`${wordpressBaseUrl}:fetched`)) {
        const wpConfig = await fetchWordPressConfig(wordpressBaseUrl);

        if (wpConfig) {
            if (wpConfig.ai_text_model) {
                promptCache.set(`${wordpressBaseUrl}:ai_text_model`, wpConfig.ai_text_model);
                // logger.debug("Modelo de texto carregado do WordPress", { model: wpConfig.ai_text_model });
            }
            if (wpConfig.ai_image_model) {
                promptCache.set(`${wordpressBaseUrl}:ai_image_model`, wpConfig.ai_image_model);
                // logger.debug("Modelo de imagem carregado do WordPress", { model: wpConfig.ai_image_model });
            }
            if (wpConfig.news_rewrite_prompt) {
                promptCache.set(`${wordpressBaseUrl}:news_rewrite`, wpConfig.news_rewrite_prompt);
                // logger.debug("Prompt news_rewrite carregado do WordPress");
            }
            if (wpConfig.news_reviewer_prompt) {
                promptCache.set(`${wordpressBaseUrl}:news_reviewer`, wpConfig.news_reviewer_prompt);
                // logger.debug("Prompt news_reviewer carregado do WordPress");
            }
        }

        promptCache.set(`${wordpressBaseUrl}:fetched`, "true");
        cacheTimestamp = now;
    }

    // Retorna do cache ou usa default
    if (promptCache.has(cacheKey)) {
        return promptCache.get(cacheKey)!;
    }

    // logger.debug("Usando prompt padrão", { key });
    const defaultPrompt = defaultBuilder();
    return defaultPrompt;
}

/**
 * Carrega e monta o prompt de reescrita de notícias
 * Tenta buscar do WordPress, senão usa o prompt padrão (hardcoded)
 */
export async function getRewritePrompt(
    input: RewritePromptInput,
    wordpressBaseUrl: string,
): Promise<string> {
    const template = await loadPrompt(
        "news_rewrite",
        wordpressBaseUrl,
        () => buildRewritePrompt(input),
    );

    // Se for template customizado do WordPress, interpola variáveis
    const defaultPrompt = buildRewritePrompt(input);
    if (template !== defaultPrompt && template.includes("{{")) {
        return interpolateTemplate(template, input);
    }

    return template;
}

/**
 * Carrega e monta o prompt de revisão de notícias
 * Tenta buscar do WordPress, senão usa o prompt padrão (hardcoded)
 */
export async function getReviewerPrompt(
    input: ReviewerPromptInput,
    wordpressBaseUrl: string,
): Promise<string> {
    const template = await loadPrompt(
        "news_reviewer",
        wordpressBaseUrl,
        () => buildReviewerPrompt(input),
    );

    // Se for template customizado do WordPress, interpola variáveis
    const defaultPrompt = buildReviewerPrompt(input);
    if (template !== defaultPrompt && template.includes("{{")) {
        return interpolateTemplate(template, {
            ...input,
            validationReport: JSON.stringify(input.validationReport, null, 2),
            faqs: JSON.stringify(input.faqs, null, 2),
            imagePrompts: JSON.stringify(input.imagePrompts, null, 2),
        });
    }

    return template;
}

/**
 * Carrega modelo de texto (AI) do WordPress ou usa o padrão do .env
 */
export async function getAITextModel(
    wordpressBaseUrl: string,
    defaultModel: string,
): Promise<string> {
    const model = await loadPrompt(
        "ai_text_model",
        wordpressBaseUrl,
        () => defaultModel,
    );

    // logger.debug("Modelo de texto", { model, source: model === defaultModel ? ".env" : "WordPress" });
    return model;
}

/**
 * Carrega modelo de imagem (AI) do WordPress ou usa o padrão do .env
 */
export async function getAIImageModel(
    wordpressBaseUrl: string,
    defaultModel: string,
): Promise<string> {
    const model = await loadPrompt(
        "ai_image_model",
        wordpressBaseUrl,
        () => defaultModel,
    );

    // logger.debug("Modelo de imagem", { model, source: model === defaultModel ? ".env" : "WordPress" });
    return model;
}
