#!/usr/bin/env tsx
/**
 * Script para criar categorias no WordPress para cada estado
 * e sincronizar os IDs no Supabase
 */

import "dotenv/config";
import { WordPressClient } from "../clients/wordpress.js";
import { SupabaseClient } from "../clients/supabase.js";
import { env } from "../config/env.js";
import { BRAZILIAN_STATES, getCategoryName, getCategorySlug, type StateCode } from "../config/states.js";
import { loadActiveSites } from "../config/sites.js";
import { extractStateFromUrl } from "../config/states.js";
import { logger } from "../logger.js";

async function main() {
    logger.info("Iniciando criação de categorias WordPress");

    // Inicializar clientes
    const wordpress = new WordPressClient({
        baseUrl: env.wordpressBaseUrl,
        appUser: env.wordpressAppUser,
        appPassword: env.wordpressAppPassword,
    });

    const supabase = SupabaseClient.fromEnv();
    if (!supabase) {
        logger.error("Supabase credentials not configured");
        process.exit(1);
    }

    // Carregar sites e identificar estados únicos
    const sites = await loadActiveSites();
    const statesUsed = new Set<StateCode>();

    for (const site of sites) {
        const state = extractStateFromUrl(site.url);
        if (state) {
            statesUsed.add(state);
        } else {
            logger.warn("Could not extract state from URL", { siteId: site.id, url: site.url });
        }
    }

    logger.info("States found", { count: statesUsed.size, states: Array.from(statesUsed).sort() });

    // Criar categorias para cada estado
    const results: Array<{
        stateCode: StateCode;
        stateName: string;
        categoryId: number;
        categoryName: string;
        categorySlug: string;
        created: boolean;
    }> = [];

    for (const stateCode of Array.from(statesUsed).sort()) {
        const stateName = BRAZILIAN_STATES[stateCode];
        const categoryName = getCategoryName(stateCode);
        const categorySlug = getCategorySlug(stateCode);

        logger.info("Processing category", { stateCode, stateName, categoryName });

        try {
            // Criar ou obter categoria no WordPress
            const category = await wordpress.getOrCreateCategory(categoryName, categorySlug);
            const created = category.count === 0; // Se count=0, provavelmente foi criada agora

            logger.info("WordPress category ready", {
                stateCode,
                categoryId: category.id,
                categoryName: category.name,
                created,
            });

            // Sincronizar com Supabase
            await supabase.upsertWordPressCategory({
                stateCode,
                stateName,
                categoryName: category.name,
                categorySlug: category.slug,
                wpCategoryId: category.id,
            });

            logger.info("Synced to Supabase", { stateCode, wpCategoryId: category.id });

            results.push({
                stateCode,
                stateName,
                categoryId: category.id,
                categoryName: category.name,
                categorySlug: category.slug,
                created,
            });
        } catch (error) {
            logger.error("Failed to process category", {
                stateCode,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Exibir resumo
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMO DE CATEGORIAS");
    console.log("=".repeat(60));
    console.log("");

    console.log("✅ Categorias criadas/verificadas:");
    for (const result of results) {
        const status = result.created ? "🆕 CRIADA" : "✓ JÁ EXISTIA";
        console.log(
            `  ${status} | ${result.stateCode.padEnd(2)} | ID ${result.categoryId.toString().padStart(3)} | ${result.categoryName}`,
        );
    }

    console.log("");
    console.log("=".repeat(60));
    console.log(`Total: ${results.length} categorias prontas`);
    console.log("=".repeat(60));
    console.log("");

    logger.info("Category setup complete", {
        total: results.length,
        created: results.filter((r) => r.created).length,
        existing: results.filter((r) => !r.created).length,
    });
}

main().catch((error) => {
    logger.error("Script failed", { error: String(error) });
    process.exit(1);
});
