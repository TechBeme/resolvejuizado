#!/usr/bin/env node
/**
 * Teste detalhado: Valida interpolação completa dos prompts
 * Verifica se todas as variáveis são substituídas corretamente
 */

import { getRewritePrompt, getReviewerPrompt } from "../src/prompts/loader.js";
import { env } from "../src/config/env.js";
import { logger } from "../src/logger.js";

const wordpressBaseUrl = env.wordpressBaseUrl;

async function main() {
    logger.info("🧪 Teste de Interpolação Detalhada\n");

    const today = "2025-12-10";
    const currentYear = 2025;
    const testUrl = "https://exemplo.com.br/noticia-teste";
    const testContent = "Conteúdo da notícia de teste para validação";

    // Teste 1: Prompt de Reescrita
    logger.info("1️⃣ Testando Prompt de Reescrita...");
    const rewritePrompt = await getRewritePrompt(
        {
            sourceUrl: testUrl,
            content: testContent,
            today,
            currentYear,
        },
        wordpressBaseUrl,
    );

    const checksRewrite = {
        "{{today}} substituído": rewritePrompt.includes(today),
        "{{currentYear}} substituído": rewritePrompt.includes(String(currentYear)),
        "{{sourceUrl}} substituído": rewritePrompt.includes(testUrl),
        "{{content}} substituído": rewritePrompt.includes(testContent),
        "Sem {{today}} literal": !rewritePrompt.includes("{{today}}"),
        "Sem {{currentYear}} literal": !rewritePrompt.includes("{{currentYear}}"),
        "Sem {{sourceUrl}} literal": !rewritePrompt.includes("{{sourceUrl}}"),
        "Sem {{content}} literal": !rewritePrompt.includes("{{content}}"),
        "Contém 'ANO 2025'": rewritePrompt.includes("ANO 2025"),
        "Contém data 2025-12-10": rewritePrompt.includes("2025-12-10"),
    };

    console.log("\n📋 Verificações Prompt de Reescrita:");
    for (const [check, passed] of Object.entries(checksRewrite)) {
        console.log(`   ${passed ? "✅" : "❌"} ${check}`);
    }

    const failedRewrite = Object.entries(checksRewrite).filter(([_, v]) => !v);
    if (failedRewrite.length > 0) {
        console.log("\n❌ FALHAS DETECTADAS:");
        failedRewrite.forEach(([check]) => console.log(`   - ${check}`));

        // Mostra trechos relevantes do prompt
        console.log("\n🔍 Trechos do prompt:");
        const lines = rewritePrompt.split("\n");
        const relevantLines = lines.filter(line =>
            line.includes("Data de hoje") ||
            line.includes("ANO") ||
            line.includes("Fonte original") ||
            line.includes("Artigo original")
        );
        relevantLines.forEach(line => console.log(`   ${line.trim()}`));
    }

    // Teste 2: Prompt de Revisão
    logger.info("\n2️⃣ Testando Prompt de Revisão...");
    const reviewerPrompt = await getReviewerPrompt(
        {
            sourceUrl: testUrl,
            today,
            currentYear,
            title: "Título de Teste",
            bodyMarkdown: "# Corpo de Teste",
            focusKeyword: "teste",
            seoTitle: "Título SEO Teste",
            seoDescription: "Descrição teste",
            slug: "titulo-teste",
            faqs: [{ question: "Pergunta?", answer: "Resposta." }],
            imagePrompts: ["Imagem 1", "Imagem 2"],
            validationReport: {
                titleLength: 15,
                titleValid: true,
                seoTitleLength: 15,
                seoTitleValid: true,
                seoDescriptionLength: 15,
                seoDescriptionValid: false,
                slugLength: 12,
                slugValid: true,
                bodyWordCount: 100,
                bodyValid: true,
                faqsCount: 1,
                faqsValid: false,
                imagePromptsCount: 2,
                imagePromptsValid: false,
                issues: ["FAQs insuficientes"],
            },
        },
        wordpressBaseUrl,
    );

    const checksReviewer = {
        "{{today}} substituído": reviewerPrompt.includes(today),
        "{{currentYear}} substituído": reviewerPrompt.includes(String(currentYear)),
        "{{sourceUrl}} substituído": reviewerPrompt.includes(testUrl),
        "{{title}} substituído": reviewerPrompt.includes("Título de Teste"),
        "{{bodyMarkdown}} substituído": reviewerPrompt.includes("# Corpo de Teste"),
        "{{focusKeyword}} substituído": reviewerPrompt.includes("teste"),
        "{{faqs}} como JSON": reviewerPrompt.includes('"question": "Pergunta?"'),
        "{{imagePrompts}} como JSON": reviewerPrompt.includes('"Imagem 1"'),
        "{{validationReport}} como JSON": reviewerPrompt.includes('"issues"'),
        "Sem {{today}} literal": !reviewerPrompt.includes("{{today}}"),
        "Sem {{currentYear}} literal": !reviewerPrompt.includes("{{currentYear}}"),
        "Contém 'ANO 2025'": reviewerPrompt.includes("ANO 2025"),
        "Contém data 2025-12-10": reviewerPrompt.includes("2025-12-10"),
    };

    console.log("\n📋 Verificações Prompt de Revisão:");
    for (const [check, passed] of Object.entries(checksReviewer)) {
        console.log(`   ${passed ? "✅" : "❌"} ${check}`);
    }

    const failedReviewer = Object.entries(checksReviewer).filter(([_, v]) => !v);
    if (failedReviewer.length > 0) {
        console.log("\n❌ FALHAS DETECTADAS:");
        failedReviewer.forEach(([check]) => console.log(`   - ${check}`));

        // Mostra trechos relevantes do prompt
        console.log("\n🔍 Trechos do prompt:");
        const lines = reviewerPrompt.split("\n");
        const relevantLines = lines.filter(line =>
            line.includes("DATA ATUAL") ||
            line.includes("ANO") ||
            line.includes("FONTE ORIGINAL") ||
            line.includes("TÍTULO:")
        );
        relevantLines.forEach(line => console.log(`   ${line.trim()}`));
    }

    // Resultado Final
    const totalChecks = Object.keys(checksRewrite).length + Object.keys(checksReviewer).length;
    const totalPassed = [...Object.values(checksRewrite), ...Object.values(checksReviewer)].filter(Boolean).length;
    const totalFailed = totalChecks - totalPassed;

    console.log("\n" + "=".repeat(80));
    if (totalFailed === 0) {
        logger.info(`✅ SUCESSO TOTAL: ${totalPassed}/${totalChecks} verificações passaram!`);
        logger.info("🎉 Os prompts estão sendo interpolados corretamente!");
        logger.info("📅 Ano 2025 e data atual estão presentes nos prompts.");
    } else {
        logger.error(`❌ FALHA: ${totalFailed}/${totalChecks} verificações falharam`);
        logger.error("⚠️  Revise os prompts no WordPress para garantir o formato {{variavel}}");
        process.exit(1);
    }
}

main();
