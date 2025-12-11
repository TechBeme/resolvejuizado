import { Agent as UndiciAgent, ProxyAgent, Dispatcher } from "undici";
import { logger } from "../logger.js";
import { env } from "../config/env.js";

export type FetchWithTimeoutOptions = RequestInit & {
    timeoutMs?: number;
    dispatcher?: Dispatcher;
};

// Normalizar URL do proxy (adicionar http:// se não tiver protocolo)
function normalizeProxyUrl(proxy: string): string {
    if (!proxy) return proxy;
    if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
        return proxy;
    }
    // Se não tem protocolo, adiciona http://
    return `http://${proxy}`;
}

// Criar dispatcher global com proxy se configurado
let globalDispatcher: Dispatcher | undefined;
if (env.httpProxy) {
    const normalizedProxy = normalizeProxyUrl(env.httpProxy);
    globalDispatcher = new ProxyAgent(normalizedProxy);
}

export class FetchTimeoutError extends Error {
    constructor(url: string, timeoutMs: number) {
        super(`Request to ${url} timed out after ${timeoutMs}ms`);
        this.name = "FetchTimeoutError";
    }
}

export class FetchNetworkError extends Error {
    constructor(url: string, cause: unknown) {
        super(`Network error fetching ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "FetchNetworkError";
    }
}

export class FetchHttpError extends Error {
    public readonly status: number;
    public readonly statusText: string;

    constructor(url: string, status: number, statusText: string) {
        super(`HTTP ${status} ${statusText} for ${url}`);
        this.name = "FetchHttpError";
        this.status = status;
        this.statusText = statusText;
    }
}

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// User-Agent realista para sites brasileiros
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch with timeout using AbortController.
 * Throws FetchTimeoutError if the request times out.
 */
export async function fetchWithTimeout(
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, dispatcher, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await (fetch as any)(url, {
            ...fetchOptions,
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...fetchOptions.headers,
            },
            signal: controller.signal,
            dispatcher: dispatcher || globalDispatcher,
        });
        return response;
    } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new FetchTimeoutError(url, timeoutMs);
        }
        throw new FetchNetworkError(url, error);
    } finally {
        clearTimeout(timeoutId);
    }
}

export type RetryOptions = {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryOn?: (error: unknown, response?: Response) => boolean;
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'retryOn'>> = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

/**
 * Default retry condition: retry on timeout, network errors, and 5xx/429 status codes.
 */
const defaultShouldRetry = (error: unknown, response?: Response): boolean => {
    // Always retry on timeout or network errors
    if (error instanceof FetchTimeoutError || error instanceof FetchNetworkError) {
        return true;
    }

    // Retry on 429 (rate limit) and 5xx (server errors)
    if (response) {
        return response.status === 429 || response.status >= 500;
    }

    return false;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with retry and exponential backoff.
 * Combines timeout handling with automatic retries.
 */
export async function fetchWithRetry(
    url: string,
    options: FetchWithTimeoutOptions & RetryOptions = {}
): Promise<Response> {
    const {
        maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
        initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
        maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
        backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
        retryOn = defaultShouldRetry,
        onRetry,
        ...fetchOptions
    } = options;

    let lastError: unknown;
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, fetchOptions);

            // Check if we should retry based on response status
            if (!response.ok && retryOn(null, response)) {
                lastResponse = response;
                throw new FetchHttpError(url, response.status, response.statusText);
            }

            return response;
        } catch (error: unknown) {
            lastError = error;

            const shouldRetry = attempt < maxRetries && retryOn(error, lastResponse);

            if (!shouldRetry) {
                throw error;
            }

            // Calculate delay with exponential backoff + jitter
            const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
            const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
            const delay = Math.min(baseDelay + jitter, maxDelayMs);

            if (onRetry) {
                onRetry(attempt + 1, error, delay);
            }

            await sleep(delay);
        }
    }

    // Should not reach here, but just in case
    throw lastError;
}

/**
 * Fetch JSON with retry and timeout.
 * Returns parsed JSON directly.
 */
export async function fetchJsonWithRetry<T = unknown>(
    url: string,
    options: FetchWithTimeoutOptions & RetryOptions = {}
): Promise<T> {
    const response = await fetchWithRetry(url, options);
    return response.json() as Promise<T>;
}

/**
 * Fetch text/HTML with retry and timeout.
 */
export async function fetchTextWithRetry(
    url: string,
    options: FetchWithTimeoutOptions & RetryOptions = {}
): Promise<string> {
    const response = await fetchWithRetry(url, options);
    return response.text();
}
