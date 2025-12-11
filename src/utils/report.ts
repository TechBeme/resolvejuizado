/**
 * Sistema de Relatórios - Tracking detalhado da execução do pipeline
 */

export type SiteResult = {
    siteId: string;
    siteName: string;
    newUrls: number;
    error?: string;
};

export type ArticleResult = {
    articleId: string;
    title?: string;
    sourceUrl: string;
    wordpressUrl?: string;
    error?: string;
    status: 'success' | 'failed';
};

export type PipelineReport = {
    startTime: number;
    endTime?: number;

    // Fase 1: Discovery
    sitesProcessed: number;
    sitesWithErrors: number;
    newArticlesFound: number;
    siteResults: SiteResult[];

    // Fase 2: Processing
    articlesProcessed: number;
    articlesPublished: number;
    articlesFailed: number;
    articleResults: ArticleResult[];
};

export class ReportManager {
    private report: PipelineReport;

    constructor() {
        this.report = {
            startTime: Date.now(),
            sitesProcessed: 0,
            sitesWithErrors: 0,
            newArticlesFound: 0,
            siteResults: [],
            articlesProcessed: 0,
            articlesPublished: 0,
            articlesFailed: 0,
            articleResults: [],
        };
    }

    addSiteResult(result: SiteResult) {
        this.report.siteResults.push(result);
        this.report.sitesProcessed++;
        this.report.newArticlesFound += result.newUrls;
        if (result.error) {
            this.report.sitesWithErrors++;
        }
    }

    addArticleResult(result: ArticleResult) {
        this.report.articleResults.push(result);
        this.report.articlesProcessed++;
        if (result.status === 'success') {
            this.report.articlesPublished++;
        } else {
            this.report.articlesFailed++;
        }
    }

    finalize() {
        this.report.endTime = Date.now();
    }

    getReport(): PipelineReport {
        return this.report;
    }

    getDurationSeconds(): number {
        const end = this.report.endTime || Date.now();
        return Math.round((end - this.report.startTime) / 1000);
    }

    printSummary() {
        this.finalize();
        const duration = this.getDurationSeconds();
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const durationStr = minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;

        console.log('\n' + '═'.repeat(80));
        console.log('  📊 RELATÓRIO FINAL DA EXECUÇÃO');
        console.log('═'.repeat(80) + '\n');

        console.log(`⏱️  Tempo total: ${durationStr}\n`);

        // FASE 1: Discovery (só mostrar se foi executada)
        if (this.report.sitesProcessed > 0) {
            console.log('━━━ FASE 1: DESCOBERTA DE NOTÍCIAS ━━━\n');
            console.log(`🌐 Sites processados: ${this.report.sitesProcessed}`);
            console.log(`🆕 Novas notícias encontradas: ${this.report.newArticlesFound}`);

            if (this.report.sitesWithErrors > 0) {
                console.log(`⚠️  Sites com erro: ${this.report.sitesWithErrors}\n`);

                console.log('❌ Detalhes dos erros:\n');
                this.report.siteResults
                    .filter(r => r.error)
                    .forEach((result, i) => {
                        console.log(`   ${i + 1}. ${result.siteName || result.siteId}`);
                        console.log(`      Erro: ${result.error}\n`);
                    });
            }

            const sitesWithNews = this.report.siteResults.filter(r => r.newUrls > 0);
            if (sitesWithNews.length > 0) {
                console.log('\n✅ Sites com notícias novas:\n');
                sitesWithNews.forEach((result, i) => {
                    console.log(`   ${i + 1}. ${result.siteName || result.siteId}: ${result.newUrls} notícia(s)`);
                });
            }

            console.log('\n' + '='.repeat(80) + '\n');
        }

        // FASE 2: Processing
        if (this.report.articlesProcessed > 0) {
            console.log('━━━ FASE 2: PROCESSAMENTO E PUBLICAÇÃO ━━━\n');
            console.log(`📝 Notícias processadas: ${this.report.articlesProcessed}`);
            console.log(`✅ Publicadas com sucesso: ${this.report.articlesPublished}`);
            console.log(`❌ Falharam: ${this.report.articlesFailed}\n`);

            if (this.report.articlesPublished > 0) {
                console.log('🎉 Notícias publicadas com sucesso:\n');
                this.report.articleResults
                    .filter(r => r.status === 'success')
                    .forEach((result, i) => {
                        console.log(`   ${i + 1}. ${result.title || 'Sem título'}`);
                        if (result.wordpressUrl) {
                            console.log(`      🔗 WordPress: ${result.wordpressUrl}`);
                        }
                        console.log(`      📄 Fonte: ${result.sourceUrl}\n`);
                    });
            }

            if (this.report.articlesFailed > 0) {
                console.log('⚠️  Notícias com erro:\n');
                this.report.articleResults
                    .filter(r => r.status === 'failed')
                    .forEach((result, i) => {
                        console.log(`   ${i + 1}. ${result.title || 'Sem título'}`);
                        console.log(`      📄 Fonte: ${result.sourceUrl}`);
                        if (result.error) {
                            const errorMsg = result.error.length > 100
                                ? result.error.substring(0, 100) + '...'
                                : result.error;
                            console.log(`      ❌ Erro: ${errorMsg}\n`);
                        }
                    });
            }
        }

        console.log('='.repeat(80));

        // Resumo final
        if (this.report.articlesProcessed > 0) {
            const successRate = Math.round(
                (this.report.articlesPublished / this.report.articlesProcessed) * 100
            );

            console.log('\n🎯 RESUMO GERAL:\n');
            console.log(`📄 Total processado: ${this.report.articlesProcessed} notícia(s)`);
            console.log(`✅ Publicadas: ${this.report.articlesPublished}`);
            console.log(`❌ Falharam: ${this.report.articlesFailed}`);
            console.log(`📊 Taxa de sucesso: ${successRate}%`);

            if (successRate === 100) {
                console.log('\n✨ Execução concluída com 100% de sucesso!');
            }
        } else if (this.report.sitesProcessed > 0 && this.report.newArticlesFound === 0) {
            console.log('\n💤 Nenhuma notícia nova encontrada nesta execução.');
        } else if (this.report.sitesProcessed === 0 && this.report.articlesProcessed === 0) {
            console.log('\n⚠️  Nenhuma notícia processada nesta execução.');
        }

        console.log('\n' + '='.repeat(80) + '\n');
    }
}
