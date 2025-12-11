#!/usr/bin/env tsx
/**
 * ResolveJuizado Pipeline - Entrypoint Principal
 * 
 * Fluxo de 2 Fases:
 * 1. DISCOVERY: Crawl de URLs novas até encontrar URL existente, salva como pending
 * 2. PROCESSING: Processa artigos pending (extrai, reescreve IA, gera SEO, publica WordPress)
 * 
 * Flags:
 * --skip-crawl              Pula fase 1 (discovery), processa apenas artigos pending
 * --limit <n>               Limita número de artigos a processar (default: sem limite)
 * --sites <id1,id2>         Filtra sites específicos (default: todos)
 * --draft                   Publica como rascunho no WordPress (default)
 * --publish                 Publica diretamente no WordPress
 * --throttle-ms <ms>        Delay entre sites no crawl (default: 15000)
 * --delay-ms <ms>           Delay entre artigos ao processar (default: 2000)
 * --max-pages <n>           Max páginas por site no crawl (default: 200)
 * 
 * Exemplos:
 * npm run dev                                    # Crawl + Processar tudo
 * npm run dev -- --skip-crawl --limit 10         # Processar apenas 10 artigos pending
 * npm run dev -- --sites procon-df,procon-es     # Apenas DF e ES
 * npm run dev -- --publish --limit 5             # Publicar diretamente 5 artigos
 */

import "dotenv/config";
import { env } from "./config/env.js";
import { FirecrawlPool } from "./clients/firecrawl-pool.js";
import { SupabaseClient } from "./clients/supabase.js";
import { WordPressClient } from "./clients/wordpress.js";
import { loadActiveSites } from "./config/sites.js";
import { logger } from "./logger.js";
import { ingestSite } from "./pipeline/ingest.js";
import { processAndPublishArticle } from "./pipeline/publish.js";
import { ReportManager } from "./utils/report.js";
import { logIpInfo } from "./utils/ip-info.js";

// ============================================================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================================================

const args = process.argv.slice(2);

const hasFlag = (flag: string) => args.includes(flag);
const getArgValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const getArgValueEq = (key: string) =>
  args.find((a) => a.startsWith(`${key}=`))?.split("=")[1];

// Show help
if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`
🏛️  ResolveJuizado Pipeline - Automação de Notícias Procon

USAGE:
  npm run dev [FLAGS]

FLAGS:
  --skip-crawl              Pula fase 1 (discovery), processa apenas artigos pending
  --limit <n>               Limita número de artigos a processar (default: sem limite)
  --sites <id1,id2>         Filtra sites específicos (default: todos)
  --draft                   Publica como rascunho no WordPress (default)
  --publish                 Publica diretamente no WordPress
  --throttle-ms <ms>        Delay entre sites no crawl (default: 15000)
  --delay-ms <ms>           Delay entre artigos ao processar (default: 2000)
  --max-pages <n>           Max páginas por site no crawl (default: 200)
  --help, -h                Mostra esta ajuda

EXEMPLOS:
  # Pipeline completo (crawl + processar)
  npm run dev

  # Apenas processar 10 artigos pending
  npm run dev -- --skip-crawl --limit 10

  # Crawl + Processar apenas DF e ES
  npm run dev -- --sites procon-df,procon-es --limit 5

  # Publicar diretamente (não como rascunho)
  npm run dev -- --skip-crawl --limit 5 --publish

DOCS:
  docs/USAGE.md         - Guia completo de uso
  docs/DEPLOYMENT.md    - Deploy em produção
  .env.example          - Variáveis de ambiente
`);
  process.exit(0);
}

const skipCrawl = hasFlag("--skip-crawl");
const publishStatus = hasFlag("--publish") ? "publish" : "draft";

const siteArg = getArgValueEq("--sites") ?? getArgValue("--sites");
const siteFilter = siteArg?.split(",").map((s) => s.trim()).filter(Boolean);

const limitRaw = getArgValue("--limit");
const limit = limitRaw ? Number(limitRaw) : undefined;

const throttleMs = Number(getArgValue("--throttle-ms") ?? "15000");
const delayMs = Number(getArgValue("--delay-ms") ?? "2000");
const maxPagesRaw = getArgValue("--max-pages");
const maxPages = maxPagesRaw ? Number(maxPagesRaw) : 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// MAIN PIPELINE
// ============================================================================

const runId = new Date().toISOString().replace(/[:.]/g, "-");

/**
 * FASE 1: DISCOVERY
 * Faz crawl de cada site até encontrar URL já existente no banco.
 * Salva URLs novas como "pending" no Supabase.
 */
async function runDiscoveryPhase() {
  const sites = await loadActiveSites();
  const selected = siteFilter?.length
    ? sites.filter((s) => siteFilter.includes(s.id) || siteFilter.includes(s.url))
    : sites;

  if (!selected.length) {
    logger.error("Nenhum site ativo selecionado", { phase: "discovery" });
    process.exit(1);
  }

  const firecrawlPool = new FirecrawlPool();
  await firecrawlPool.loadFromSupabase();

  const supabase = SupabaseClient.fromEnv();

  if (!supabase) {
    logger.error("Credenciais do Supabase são obrigatórias para a fase de descoberta");
    process.exit(1);
  }

  console.log(`\n🌐 Verificando ${selected.length} sites do Procon em busca de notícias novas...\n`);

  // Crawl paralelo de todos os sites
  const crawlPromises = selected.map(async (site, index) => {
    try {
      const supabaseRunKey = `${runId}-${site.id}`;

      // Atualizar pagination config com maxPages se especificado
      if (maxPages && site.pagination) {
        site.pagination.maxPages = maxPages;
      }

      const result = await ingestSite({
        site,
        firecrawl: firecrawlPool,
        runId,
        listOnly: true, // Apenas URLs, não extrai conteúdo ainda
        supabase,
        supabaseRunKey,
      });

      return {
        siteId: site.id,
        siteName: site.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        newUrls: result.newUrls.length,
      };
    } catch (err) {
      return {
        siteId: site.id,
        siteName: site.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        newUrls: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const results = await Promise.all(crawlPromises);
  const totalNewUrls = results.reduce((sum, r) => sum + r.newUrls, 0);

  return {
    sitesProcessed: selected.length,
    newArticlesFound: totalNewUrls,
    results,
  };
}

/**
 * FASE 2: PROCESSING
 * Pega artigos "pending" do banco, extrai conteúdo com Firecrawl,
 * reescreve com IA, gera SEO/imagens, e publica no WordPress.
 */
async function runProcessingPhase() {
  const supabase = SupabaseClient.fromEnv();
  if (!supabase) {
    logger.error("Credenciais do Supabase são obrigatórias para a fase de processamento");
    process.exit(1);
  }

  const wordpress = new WordPressClient({
    baseUrl: env.wordpressBaseUrl,
    appUser: env.wordpressAppUser,
    appPassword: env.wordpressAppPassword,
  });

  const firecrawlPool = new FirecrawlPool();
  await firecrawlPool.loadFromSupabase();

  // Buscar artigos pending do banco
  const articles = await supabase.listArticlesForReprocess({
    limit,
    siteIds: siteFilter,
  });

  if (!articles.length) {
    console.log(`\n💤 Nenhuma notícia pendente para processar.\n`);
    return {
      processed: 0,
      failed: 0,
      published: 0,
      publishedUrls: []
    };
  }

  const actionMsg = publishStatus === "publish"
    ? "🚀 Processando e publicando notícias no WordPress..."
    : "📝 Processando notícias (modo rascunho)...";

  console.log(`\n${actionMsg}`);
  console.log(`📊 Total de notícias para processar: ${articles.length}`);

  // Carregar modelos do WordPress (se disponível) antes de mostrar
  const { getAITextModel, getAIImageModel } = await import('./prompts/loader.js');
  const textModel = await getAITextModel(env.wordpressBaseUrl, env.textModel);
  const imageModel = await getAIImageModel(env.wordpressBaseUrl, env.imageModel);

  console.log(`🤖 Modelo de IA (texto): ${textModel}`);
  console.log(`🖼️  Modelo de IA (imagem): ${imageModel}\n`);

  // Listar URLs das notícias que serão processadas
  if (articles.length > 0) {
    console.log('📋 Notícias na fila de processamento:\n');
    articles.forEach((article, idx) => {
      const hasContent = article.raw_markdown ? '✅' : '🔄';
      console.log(`   ${idx + 1}. ${hasContent} ${article.source_url}`);
    });
    console.log();
    console.log('   ✅ = conteúdo já extraído  🔄 = precisa extrair\n');
  }  // Processar todos os artigos em paralelo
  const results = await Promise.allSettled(
    articles.map(async (article, index) => {
      try {
        // Se não tem conteúdo ainda, extrair com Firecrawl
        let rawContent = article.raw_markdown;

        if (!rawContent) {
          const scrapeResult = await firecrawlPool.scrape(article.source_url, {
            formats: ["markdown", "html"],
            onlyMainContent: true,
          });
          rawContent = scrapeResult.markdown ?? "";

          // Atualizar banco com conteúdo extraído
          await supabase.upsertArticle({
            sourceUrl: article.source_url,
            siteId: article.site_id,
            rawMarkdown: rawContent,
            rawHtml: scrapeResult.html,
          });
        }

        if (!rawContent || rawContent.length < 100) {
          throw new Error(`Insufficient content: ${rawContent?.length ?? 0} chars`);
        }

        // Processar: IA + SEO + Imagens + WordPress
        await processAndPublishArticle({
          sourceUrl: article.source_url,
          rawContent,
          wordpress,
          publishStatus,
          supabase,
          articleId: article.id,
          siteId: article.site_id,
          runId,
          firecrawlPool, // Passar pool para usar keys diferentes
        });

        console.log(`✅ ${article.source_url}`);
        return { success: true, articleId: article.id, url: article.source_url };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Não logar novamente se já foi logado pelo firecrawlPool (evita duplicação)
        if (!errorMsg.includes("Site não respondeu") && !errorMsg.includes("Todas as chaves")) {
          console.error(`\n❌ Erro ao processar artigo`);
          console.error(`   URL: ${article.source_url}`);
          console.error(`   Erro: ${errorMsg.slice(0, 150)}`);
          console.error('');
        }
        return {
          success: false,
          articleId: article.id,
          url: article.source_url,
          error: errorMsg
        };
      }
    })
  );

  // Contar sucessos e falhas dos resultados
  const successResults = results.filter(r =>
    r.status === "fulfilled" && r.value.success
  );
  const failedResults = results.filter(r =>
    r.status === "fulfilled" && !r.value.success
  );
  const rejectedResults = results.filter(r => r.status === "rejected");

  const processed = successResults.length;
  const failed = failedResults.length + rejectedResults.length;

  // Log resumo de processamento
  console.log(`\n━━━ RESUMO DO PROCESSAMENTO ━━━`);
  console.log(`✅ Processados com sucesso: ${processed}`);
  console.log(`❌ Falharam: ${failed}`);

  // Mostrar URLs processadas com sucesso
  if (processed > 0) {
    console.log(`\n📝 Artigos processados com sucesso:`);
    successResults.forEach((result, idx) => {
      if (result.status === "fulfilled" && result.value.success) {
        console.log(`   ${idx + 1}. ${result.value.url}`);
      }
    });
  }

  // Mostrar URLs que falharam
  if (failed > 0) {
    console.log(`\n📋 Artigos que falharam:`);
    failedResults.forEach((result, idx) => {
      if (result.status === "fulfilled" && !result.value.success) {
        const shortError = result.value.error?.slice(0, 150) || "Erro desconhecido";
        console.log(`   ${idx + 1}. ${result.value.url}`);
        console.log(`      → ${shortError}`);
      }
    });
    rejectedResults.forEach((result, idx) => {
      console.log(`   ${failedResults.length + idx + 1}. Promise rejeitada`);
      console.log(`      → ${result.reason?.message?.slice(0, 150) || String(result.reason).slice(0, 150)}`);
    });
  }

  // Buscar quantos foram publicados com sucesso (se --publish foi usado)
  let published = 0;
  let publishedUrls: string[] = [];

  if (publishStatus === "publish" && processed > 0) {
    const { data: publishedArticles } = await supabase["client"]
      .from('articles')
      .select('wordpress_post_id, original_url, article_title')
      .eq('published_status', 'published')
      .not('wordpress_post_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(processed);

    published = publishedArticles?.length || 0;
    publishedUrls = publishedArticles?.map(a => `https://blog.resolvejuizado.com.br/?p=${a.wordpress_post_id}`) || [];

    // Exibir URLs publicadas no WordPress
    if (published > 0) {
      console.log(`\n🌐 Artigos publicados no WordPress:`);
      publishedArticles?.forEach((article, idx) => {
        const wpUrl = `https://blog.resolvejuizado.com.br/?p=${article.wordpress_post_id}`;
        const title = article.article_title || 'Sem título';
        const shortTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;
        console.log(`   ${idx + 1}. ${shortTitle}`);
        console.log(`      🔗 ${wpUrl}`);
      });
    }
  }

  console.log(''); // linha em branco

  return {
    processed,
    failed,
    published,
    publishedUrls
  };
}

/**
 * ORCHESTRATOR
 * Executa as fases conforme flags
 */
async function main() {
  const report = new ReportManager();

  console.log('\n' + '═'.repeat(80));
  console.log('  🏛️  RESOLVEJUIZADO - PIPELINE DE NOTÍCIAS');
  console.log('═'.repeat(80) + '\n');

  // Detectar e logar IP/localização
  await logIpInfo();
  if (env.httpProxy) {
    console.log(`🔒 Usando proxy configurado`);
  }
  console.log();

  // FASE 1: Discovery (crawl de URLs novas)
  if (!skipCrawl) {
    console.log('━━━ FASE 1: DESCOBRINDO NOVAS NOTÍCIAS ━━━\n');
    const discoveryResult = await runDiscoveryPhase();

    // Adicionar resultados ao relatório
    discoveryResult.results?.forEach(r => report.addSiteResult(r));

    console.log(`\n✅ Fase 1 concluída: ${discoveryResult.newArticlesFound} notícia(s) nova(s)\n`);
  } else {
    console.log('⏭️  Pulando Fase 1 (modo reprocessamento)\n');
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // FASE 2: Processing (extrair + IA + WordPress)
  console.log('━━━ FASE 2: PROCESSANDO E PUBLICANDO ━━━\n');
  const processingResult = await runProcessingPhase();

  // Buscar detalhes dos artigos para o relatório
  const supabase = SupabaseClient.fromEnv();
  if (supabase && processingResult.processed > 0) {
    const { data: articles } = await supabase.client
      .from('articles')
      .select('id, original_url, article_title, wordpress_post_id, published_status, error_message')
      .order('updated_at', { ascending: false })
      .limit(processingResult.processed);

    articles?.forEach(article => {
      const wordpressUrl = article.wordpress_post_id
        ? `https://blog.resolvejuizado.com.br/?p=${article.wordpress_post_id}`
        : undefined;

      report.addArticleResult({
        articleId: article.id,
        title: article.article_title,
        sourceUrl: article.original_url,
        wordpressUrl,
        status: article.published_status === 'published' ? 'success' : 'failed',
        error: article.error_message,
      });
    });
  }

  console.log(`\n✅ Fase 2 concluída\n`);

  console.log('\n' + '='.repeat(80) + '\n');

  // RELATÓRIO FINAL
  report.printSummary();
}

main().catch((error) => {
  logger.separator();
  logger.error("❌ ERRO CRÍTICO NO PIPELINE", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  logger.separator();
  process.exit(1);
});
