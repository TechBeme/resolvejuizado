import { logger } from "../logger.js";
import { SupabaseClient } from "./supabase.js";

type ScrapeResponse = {
    success: boolean;
    data?: {
        content?: string;
        markdown?: string;
        html?: string;
        text?: string;
        rawHtml?: string;
        links?: string[];
        json?: unknown;
        summary?: string;
    };
    message?: string;
    code?: string;
    error?: string;
};

export type FirecrawlScrapeOptions = {
    formats?: Array<"markdown" | "html" | "rawHtml" | "links" | "json" | "summary" | "branding">;
    onlyMainContent?: boolean;
    waitFor?: number;
    includeTags?: string[];
    excludeTags?: string[];
    maxAge?: number;
    mobile?: boolean;
    parsers?: string[];
};

export type FirecrawlScrapeResult = {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    json?: unknown;
    summary?: string;
};

type FirecrawlJsonListResponse = {
    success: boolean;
    data?: { json?: { urls?: string[] } };
    error?: string;
    code?: string;
};

export type FirecrawlExtractOptions = {
    urls: string[];
    prompt?: string;
    schema?: object;
    allowExternalLinks?: boolean;
    includeSubdomains?: boolean;
    enableWebSearch?: boolean;
};

type FirecrawlExtractResponse = {
    success: boolean;
    id?: string;
    data?: unknown;
    error?: string;
};

type FirecrawlAccount = {
    id: number;
    email: string | null;
    api_key: string;
    status: string;
    exhausted_at: string | null;
};

type ApiKeyStats = {
    apiKey: string;
    used: number;
    failures: number;
    lastError?: string;
    lastUsed?: number;
    exhausted: boolean;
};

/**
 * FirecrawlPool manages multiple API keys with automatic rotation and fallback.
 * - Loads accounts from Supabase with local cache
 * - Uses round-robin selection for parallel requests
 * - Automatically retries with different keys on 402/429 errors
 * - Marks exhausted keys in database
 */
export class FirecrawlPool {
    private baseUrl: string;
    private apiKeys: string[] = [];
    private keyStats: Map<string, ApiKeyStats> = new Map();
    private currentIndex = 0;
    private readonly maxRetriesPerRequest: number;
    private supabase: SupabaseClient | null = null;
    private accountsCache: FirecrawlAccount[] = [];
    private static globalCache: FirecrawlAccount[] = [];
    private static cacheLoadedAt: number = 0;
    private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

    constructor(options: {
        baseUrl?: string;
        maxRetriesPerRequest?: number;
    } = {}) {
        this.baseUrl = options.baseUrl ?? "https://api.firecrawl.dev";
        this.maxRetriesPerRequest = options.maxRetriesPerRequest ?? 10; // Limite de 10 tentativas para sites lentos
    }

    /**
     * Load API keys from Supabase (with global cache)
     */
    async loadFromSupabase(): Promise<void> {
        const client = SupabaseClient.fromEnv();
        if (!client) {
            throw new Error("Supabase credentials required for FirecrawlPool");
        }
        this.supabase = client;

        // Use global cache if fresh (< 1 hour old)
        const now = Date.now();
        if (
            FirecrawlPool.globalCache.length > 0 &&
            now - FirecrawlPool.cacheLoadedAt < FirecrawlPool.CACHE_TTL
        ) {
            this.accountsCache = [...FirecrawlPool.globalCache];
            this.apiKeys = this.accountsCache
                .filter((acc) => acc.status === "active")
                .map((acc) => acc.api_key);

            // Initialize stats
            for (const key of this.apiKeys) {
                this.keyStats.set(key, {
                    apiKey: key,
                    used: 0,
                    failures: 0,
                    exhausted: false,
                });
            }

            // FirecrawlPool carregado do cache (silenciado)
            return;
        }

        // Fetch from Supabase
        const { data, error } = await this.supabase.client
            .from("firecrawl_accounts")
            .select("id, email, api_key, status, exhausted_at")
            .eq("status", "active")
            .order("id", { ascending: true });

        if (error) {
            throw new Error(`Failed to load accounts from Supabase: ${error.message}`);
        }

        if (!data || data.length === 0) {
            throw new Error("No active Firecrawl accounts found in database");
        }

        this.accountsCache = data as FirecrawlAccount[];
        this.apiKeys = this.accountsCache.map((acc) => acc.api_key);

        // Update global cache
        FirecrawlPool.globalCache = [...this.accountsCache];
        FirecrawlPool.cacheLoadedAt = now;

        // Initialize stats
        for (const key of this.apiKeys) {
            this.keyStats.set(key, {
                apiKey: key,
                used: 0,
                failures: 0,
                exhausted: false,
            });
        }

        // FirecrawlPool carregado do Supabase (silenciado)
    }

    /**
     * Get the next available (non-exhausted) API key using round-robin
     */
    private getNextKey(): string | undefined {
        let attempts = 0;

        while (attempts < this.apiKeys.length) {
            const key = this.apiKeys[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;

            const stats = this.keyStats.get(key);
            if (stats && !stats.exhausted) {
                stats.used += 1;
                stats.lastUsed = Date.now();
                return key;
            }

            attempts++;
        }

        return undefined; // All keys exhausted
    }

    /**
     * Mark a key as exhausted (402 Payment Required)
     * Also updates status in Supabase
     */
    private async markExhausted(apiKey: string, error: string): Promise<void> {
        const stats = this.keyStats.get(apiKey);
        if (stats) {
            stats.exhausted = true;
            stats.lastError = error;
        }

        // Update Supabase
        if (this.supabase) {
            const account = this.accountsCache.find((acc) => acc.api_key === apiKey);
            if (account) {
                const { error: dbError } = await this.supabase.client
                    .from("firecrawl_accounts")
                    .update({
                        status: "exhausted",
                        exhausted_at: new Date().toISOString(),
                    })
                    .eq("api_key", apiKey);

                if (dbError) {
                    logger.warn("Falha ao atualizar status da conta no Supabase", {
                        accountId: account.id,
                        error: dbError.message,
                    });
                } else {
                    logger.warn("❌ Chave API marcada como esgotada no banco de dados", {
                        accountId: account.id,
                        email: account.email,
                        reason: error,
                    });

                    // Update local cache
                    account.status = "exhausted";
                    account.exhausted_at = new Date().toISOString();

                    // Update global cache
                    const globalAccount = FirecrawlPool.globalCache.find(
                        (acc) => acc.api_key === apiKey
                    );
                    if (globalAccount) {
                        globalAccount.status = "exhausted";
                        globalAccount.exhausted_at = new Date().toISOString();
                    }
                }
            }
        }

        const activeCount = this.apiKeys.filter((key) => {
            const s = this.keyStats.get(key);
            return s && !s.exhausted;
        }).length;

        logger.info(`📊 Contas ativas restantes: ${activeCount}`);
    }

    /**
     * Record a failure for a key (rate limit, etc.)
     */
    private recordFailure(apiKey: string, error: string): void {
        const stats = this.keyStats.get(apiKey);
        if (stats) {
            stats.failures += 1;
            stats.lastError = error;
        }
    }

    /**
     * Get pool statistics
     */
    getStats(): { total: number; available: number; exhausted: number; stats: ApiKeyStats[] } {
        const allStats = Array.from(this.keyStats.values());
        return {
            total: this.apiKeys.length,
            available: allStats.filter(s => !s.exhausted).length,
            exhausted: allStats.filter(s => s.exhausted).length,
            stats: allStats,
        };
    }

    /**
     * Reset all exhausted keys (for new runs)
     */
    resetExhausted(): void {
        for (const stats of this.keyStats.values()) {
            stats.exhausted = false;
            stats.failures = 0;
            stats.lastError = undefined;
        }
    }

    /**
     * Execute a request with automatic fallback to other keys on failure
     */
    private async executeWithFallback<T>(
        operation: (apiKey: string) => Promise<T>,
        context: string,
    ): Promise<T> {
        let lastError: Error | undefined;
        let attempts = 0;
        const triedKeys = new Set<string>();

        while (attempts < this.maxRetriesPerRequest) {
            const apiKey = this.getNextKey();

            if (!apiKey) {
                throw new Error(`All API keys exhausted. Tried ${triedKeys.size} keys. Last error: ${lastError?.message ?? "unknown"}`);
            }

            // Skip if we already tried this key this request
            if (triedKeys.has(apiKey) && triedKeys.size < this.apiKeys.length) {
                continue;
            }
            triedKeys.add(apiKey);
            attempts++;

            try {
                return await operation(apiKey);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const errorMsg = lastError.message;

                // Check if credit exhausted (402)
                if (errorMsg.includes("402") || errorMsg.includes("Payment Required") || errorMsg.includes("Insufficient credits")) {
                    await this.markExhausted(apiKey, errorMsg);
                    logger.warn("Chave Firecrawl esgotada, tentando próxima chave", {
                        context,
                        keyPrefix: apiKey.slice(0, 10) + "...",
                        attempt: attempts,
                        error: errorMsg.slice(0, 100),
                    });
                    continue; // Try next key
                }

                // Check if rate limited (429)
                if (errorMsg.includes("429") || errorMsg.includes("Rate limit")) {
                    this.recordFailure(apiKey, errorMsg);
                    logger.warn("Limite de taxa Firecrawl atingido, tentando próxima chave", {
                        context,
                        keyPrefix: apiKey.slice(0, 10) + "...",
                        attempt: attempts,
                        error: errorMsg.slice(0, 100),
                    });
                    continue; // Try next key
                }

                // Check if timeout (408) - try next key immediately
                if (errorMsg.includes("408") || errorMsg.includes("timeout") || errorMsg.includes("SCRAPE_TIMEOUT")) {
                    this.recordFailure(apiKey, errorMsg);
                    // Log silencioso - apenas continua para próxima chave
                    continue; // Try next key
                }

                // For other errors, record and retry with backoff
                this.recordFailure(apiKey, errorMsg);
                const delay = Math.min(1000 * Math.pow(2, attempts - 1), 8000);
                logger.warn("Firecrawl request failed, retrying", {
                    context,
                    attempt: attempts,
                    delay,
                    error: errorMsg.slice(0, 100),
                });
                await new Promise(r => setTimeout(r, delay));
            }
        }

        // Se chegou aqui, esgotou todas as tentativas
        const isTimeout = lastError?.message?.includes("SCRAPE_TIMEOUT") || lastError?.message?.includes("408");
        const errorContext = isTimeout
            ? "Site não respondeu após múltiplas tentativas (timeout)"
            : "Todas as chaves API falharam";

        // Extrair URL do context (formato: "scrape:https://..." ou "extract:https://...")
        const url = context.includes(":") ? context.split(":").slice(1).join(":") : context;

        // Log formatado e legível
        console.error(`\n❌ ${errorContext}`);
        console.error(`   URL: ${url}`);
        console.error(`   Tentativas: ${attempts}/${this.maxRetriesPerRequest}`);
        if (lastError?.message) {
            const errorMsg = lastError.message.slice(0, 150);
            console.error(`   Erro: ${errorMsg}`);
        }
        console.error('');

        throw lastError ?? new Error(`${errorContext} para ${context}`);
    }

    async scrape(url: string, options?: FirecrawlScrapeOptions): Promise<FirecrawlScrapeResult> {
        return this.executeWithFallback(async (apiKey) => {
            const body = {
                url,
                formats: options?.formats ?? ["markdown", "html"],
                onlyMainContent: options?.onlyMainContent ?? false,
                waitFor: options?.waitFor,
                includeTags: options?.includeTags,
                excludeTags: options?.excludeTags,
                maxAge: options?.maxAge ?? 3600000, // 1 hour in milliseconds (default for fresh news content)
                mobile: options?.mobile,
                parsers: options?.parsers,
            };

            const response = await fetch(`${this.baseUrl}/v1/scrape`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Firecrawl scrape failed: ${response.status} ${response.statusText} - ${text}`);
            }

            const data = (await response.json()) as ScrapeResponse;
            if (!data.success) {
                throw new Error(`Firecrawl scrape unsuccessful: ${data.message ?? "unknown error"}`);
            }

            const markdown = data.data?.markdown;
            const html = data.data?.html;
            const rawHtml = data.data?.rawHtml;

            if (!markdown && !html && !rawHtml) {
                throw new Error("Firecrawl scrape returned empty content.");
            }

            return {
                markdown,
                html,
                rawHtml,
                links: (data.data as { links?: string[] } | undefined)?.links,
                json: (data.data as { json?: unknown } | undefined)?.json,
                summary: (data.data as { summary?: string } | undefined)?.summary,
            };
        }, `scrape:${url}`);
    }

    async scrapeMarkdown(url: string): Promise<string> {
        const result = await this.scrape(url, { formats: ["markdown", "html"] });
        const content = result.markdown ?? result.html ?? result.rawHtml;
        if (!content) {
            throw new Error("Firecrawl scrape returned empty content.");
        }
        return content;
    }

    async scrapeListingUrls(
        url: string,
        prompt: string,
        options?: {
            includeTags?: string[];
            excludeTags?: string[];
            maxAge?: number;
            mobile?: boolean;
            waitFor?: number;
        },
    ): Promise<string[]> {
        return this.executeWithFallback(async (apiKey) => {
            const response = await fetch(`${this.baseUrl.replace(/\/v1$/, "")}/v2/scrape`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    url,
                    onlyMainContent: false,
                    includeTags: options?.includeTags,
                    excludeTags: options?.excludeTags,
                    maxAge: options?.maxAge ?? 3600000, // 1 hour in milliseconds (default for fresh news content)
                    mobile: options?.mobile,
                    waitFor: options?.waitFor,
                    formats: [
                        {
                            type: "json",
                            schema: {
                                type: "object",
                                properties: {
                                    urls: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                },
                                required: ["urls"],
                            },
                            prompt,
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Firecrawl json scrape failed: ${response.status} ${response.statusText} - ${text}`);
            }

            const data = (await response.json()) as FirecrawlJsonListResponse;
            const urls = data.data?.json?.urls ?? [];
            return urls;
        }, `scrapeListingUrls:${url}`);
    }

    async extract(options: FirecrawlExtractOptions): Promise<unknown> {
        return this.executeWithFallback(async (apiKey) => {
            const response = await fetch(`${this.baseUrl}/v1/extract`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(options),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Firecrawl extract failed: ${response.status} ${response.statusText} - ${text}`);
            }

            const data = (await response.json()) as FirecrawlExtractResponse;
            if (!data.success) {
                throw new Error(`Firecrawl extract unsuccessful: ${data.error ?? "unknown error"}`);
            }
            return data;
        }, `extract:${options.urls.join(",")}`);
    }

    async extractStatus(id: string): Promise<FirecrawlExtractResponse> {
        return this.executeWithFallback(async (apiKey) => {
            const response = await fetch(`${this.baseUrl}/v1/extract/${id}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Firecrawl extract status failed: ${response.status} ${response.statusText} - ${text}`);
            }
            return (await response.json()) as FirecrawlExtractResponse;
        }, `extractStatus:${id}`);
    }
}
