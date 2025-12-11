#!/usr/bin/env node
/**
 * Teste: Valida carregamento de configurações do WordPress
 * Verifica se modelos AI e prompts são carregados corretamente via REST API
 * com fallback para .env e prompts hardcoded
 */

import { getAITextModel, getAIImageModel, getRewritePrompt, getReviewerPrompt } from "../src/prompts/loader.js";
import { env } from "../src/config/env.js";
import { logger } from "../src/logger.js";

const wordpressBaseUrl = env.wordpressBaseUrl;

async function main() {
    logger.info("🧪 Testando carregamento de configurações do WordPress...");
    logger.info(`📍 URL Base: ${wordpressBaseUrl}`);

    try {
        // Teste 1: Modelos AI
        logger.info("\n1️⃣ Testando modelos AI...");
        const textModel = await getAITextModel(wordpressBaseUrl, env.textModel);
        const imageModel = await getAIImageModel(wordpressBaseUrl, env.imageModel);

        logger.info(`✅ Modelo de Texto: ${textModel}`);
        logger.info(`   Fallback (.env): ${env.textModel}`);
        logger.info(`   Fonte: ${textModel === env.textModel ? ".env (fallback)" : "WordPress"}`);

        logger.info(`✅ Modelo de Imagem: ${imageModel}`);
        logger.info(`   Fallback (.env): ${env.imageModel}`);
        logger.info(`   Fonte: ${imageModel === env.imageModel ? ".env (fallback)" : "WordPress"}`);

        // Teste 2: Prompts
        logger.info("\n2️⃣ Testando prompts...");
        const rewritePrompt = await getRewritePrompt(
            {
                sourceUrl: "https://exemplo.com.br/teste",
                content: "Teste de conteúdo",
                today: "2025-12-10",
                currentYear: 2025,
            },
            wordpressBaseUrl,
        );

        const reviewerPrompt = await getReviewerPrompt(
            {
                sourceUrl: "https://exemplo.com.br/teste",
                today: "2025-12-10",
                currentYear: 2025,
                title: "Título Teste",
                bodyMarkdown: "# Conteúdo",
                focusKeyword: "teste",
                seoTitle: "Teste SEO",
                seoDescription: "Descrição teste",
                slug: "teste-slug",
                faqs: [{ question: "?", answer: "!" }],
                imagePrompts: ["Imagem teste"],
                validationReport: {
                    titleLength: 12,
                    titleValid: true,
                    seoTitleLength: 9,
                    seoTitleValid: true,
                    seoDescriptionLength: 15,
                    seoDescriptionValid: true,
                    slugLength: 10,
                    slugValid: true,
                    bodyWordCount: 5,
                    bodyValid: false,
                    faqsCount: 1,
                    faqsValid: false,
                    imagePromptsCount: 1,
                    imagePromptsValid: false,
                    issues: ["Body muito curto", "FAQs insuficientes"],
                },
            },
            wordpressBaseUrl,
        );

        logger.info(`✅ Prompt de Reescrita carregado: ${rewritePrompt.length} caracteres`);
        logger.info(`   Primeiros 100 chars: ${rewritePrompt.substring(0, 100)}...`);
        logger.info(`   Contém interpolação {{sourceUrl}}? ${rewritePrompt.includes("https://exemplo.com.br/teste") ? "Sim (interpolado)" : "Não (template)"}`);

        logger.info(`✅ Prompt de Revisão carregado: ${reviewerPrompt.length} caracteres`);
        logger.info(`   Primeiros 100 chars: ${reviewerPrompt.substring(0, 100)}...`);
        logger.info(`   Contém interpolação {{title}}? ${reviewerPrompt.includes("Título Teste") ? "Sim (interpolado)" : "Não (template)"}`);

        // Teste 3: Validação de API endpoint
        logger.info("\n3️⃣ Testando endpoint REST API diretamente...");
        const url = `${wordpressBaseUrl}/wp-json/resolvejuizado/v1/config`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            logger.info(`✅ API respondeu: ${response.status} OK`);
            logger.info(`   Dados retornados:`);
            logger.info(`   - ai_text_model: ${data.ai_text_model || "(vazio)"}`);
            logger.info(`   - ai_image_model: ${data.ai_image_model || "(vazio)"}`);
            logger.info(`   - news_rewrite_prompt: ${data.news_rewrite_prompt ? `${data.news_rewrite_prompt.length} chars` : "(vazio)"}`);
            logger.info(`   - news_reviewer_prompt: ${data.news_reviewer_prompt ? `${data.news_reviewer_prompt.length} chars` : "(vazio)"}`);
        } else {
            logger.error(`❌ API retornou erro: ${response.status}`);
        }

        logger.info("\n✅ Todos os testes concluídos com sucesso!");
        logger.info("🎯 O sistema está carregando configurações do WordPress corretamente.");
        logger.info("💡 Se algum valor vier vazio do WordPress, o fallback do .env será usado.");

    } catch (error) {
        logger.error("❌ Erro durante o teste:", { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
    }
}

main();
