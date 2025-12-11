import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger.js";

export type FailureType = "listing-page" | "article-scrape" | "api-call";

export type FailureRecord = {
    timestamp: string;
    siteId: string;
    runId: string;
    type: FailureType;
    url: string;
    page?: number;
    error: string;
    attempts: number;
    retryable: boolean;
};

export type FailureLog = {
    createdAt: string;
    updatedAt: string;
    failures: FailureRecord[];
};

const DEFAULT_FAILURE_LOG_PATH = "data/failures/failure-log.json";

/**
 * FailureLogger provides persistent logging of failures for later reprocessing.
 */
export class FailureLogger {
    private logPath: string;
    private failures: FailureRecord[] = [];
    private loaded = false;

    constructor(logPath?: string) {
        this.logPath = logPath ?? path.join(process.cwd(), DEFAULT_FAILURE_LOG_PATH);
    }

    /**
     * Load existing failures from disk.
     */
    async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.logPath, "utf8");
            const data = JSON.parse(raw) as FailureLog;
            this.failures = data.failures ?? [];
            this.loaded = true;
        } catch (error: unknown) {
            // File doesn't exist or is invalid - start fresh
            this.failures = [];
            this.loaded = true;
        }
    }

    /**
     * Save current failures to disk.
     */
    async save(): Promise<void> {
        const dir = path.dirname(this.logPath);
        await fs.mkdir(dir, { recursive: true });

        const data: FailureLog = {
            createdAt: this.failures.length > 0
                ? this.failures[0].timestamp
                : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            failures: this.failures,
        };

        await fs.writeFile(this.logPath, JSON.stringify(data, null, 2), "utf8");
    }

    /**
     * Log a failure for later reprocessing.
     */
    async logFailure(failure: Omit<FailureRecord, "timestamp">): Promise<void> {
        if (!this.loaded) {
            await this.load();
        }

        const record: FailureRecord = {
            ...failure,
            timestamp: new Date().toISOString(),
        };

        // Check if this URL is already in the log
        const existingIndex = this.failures.findIndex(
            (f) => f.url === failure.url && f.siteId === failure.siteId && f.type === failure.type
        );

        if (existingIndex >= 0) {
            // Update existing record with new attempt info
            const existing = this.failures[existingIndex];
            this.failures[existingIndex] = {
                ...record,
                attempts: existing.attempts + failure.attempts,
            };
        } else {
            this.failures.push(record);
        }

        await this.save();

        logger.warn("Failure logged for reprocessing", {
            type: failure.type,
            siteId: failure.siteId,
            url: failure.url,
            error: failure.error.slice(0, 200),
            retryable: failure.retryable,
        });
    }

    /**
     * Get all retryable failures for a specific site or all sites.
     */
    getRetryableFailures(siteId?: string): FailureRecord[] {
        return this.failures.filter(
            (f) => f.retryable && (!siteId || f.siteId === siteId)
        );
    }

    /**
     * Get all failures (including non-retryable) for a specific site or all sites.
     */
    getAllFailures(siteId?: string): FailureRecord[] {
        return this.failures.filter(
            (f) => !siteId || f.siteId === siteId
        );
    }

    /**
     * Get failures grouped by type.
     */
    getFailuresByType(): Record<FailureType, FailureRecord[]> {
        const grouped: Record<FailureType, FailureRecord[]> = {
            "listing-page": [],
            "article-scrape": [],
            "api-call": [],
        };

        for (const f of this.failures) {
            grouped[f.type].push(f);
        }

        return grouped;
    }

    /**
     * Mark a failure as resolved (remove from log).
     */
    async markResolved(url: string, siteId: string, type: FailureType): Promise<boolean> {
        if (!this.loaded) {
            await this.load();
        }

        const initialLength = this.failures.length;
        this.failures = this.failures.filter(
            (f) => !(f.url === url && f.siteId === siteId && f.type === type)
        );

        if (this.failures.length !== initialLength) {
            await this.save();
            logger.info("Failure resolved and removed from log", { url, siteId, type });
            return true;
        }

        return false;
    }

    /**
     * Mark multiple failures as resolved.
     */
    async markManyResolved(items: Array<{ url: string; siteId: string; type: FailureType }>): Promise<number> {
        if (!this.loaded) {
            await this.load();
        }

        const urlSet = new Set(items.map(i => `${i.siteId}|${i.type}|${i.url}`));
        const initialLength = this.failures.length;

        this.failures = this.failures.filter(
            (f) => !urlSet.has(`${f.siteId}|${f.type}|${f.url}`)
        );

        const removedCount = initialLength - this.failures.length;
        if (removedCount > 0) {
            await this.save();
            logger.info("Multiple failures resolved", { count: removedCount });
        }

        return removedCount;
    }

    /**
     * Clear all failures.
     */
    async clear(): Promise<void> {
        this.failures = [];
        await this.save();
        logger.info("Failure log cleared");
    }

    /**
     * Get summary statistics.
     */
    getSummary(): {
        total: number;
        retryable: number;
        byType: Record<FailureType, number>;
        bySite: Record<string, number>;
    } {
        const byType: Record<FailureType, number> = {
            "listing-page": 0,
            "article-scrape": 0,
            "api-call": 0,
        };
        const bySite: Record<string, number> = {};

        for (const f of this.failures) {
            byType[f.type]++;
            bySite[f.siteId] = (bySite[f.siteId] ?? 0) + 1;
        }

        return {
            total: this.failures.length,
            retryable: this.failures.filter(f => f.retryable).length,
            byType,
            bySite,
        };
    }
}

/**
 * Singleton instance for global access.
 */
let globalFailureLogger: FailureLogger | null = null;

export function getFailureLogger(logPath?: string): FailureLogger {
    if (!globalFailureLogger) {
        globalFailureLogger = new FailureLogger(logPath);
    }
    return globalFailureLogger;
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
    if (!error) return false;

    const message = error instanceof Error ? error.message : String(error);

    // Non-retryable errors
    const nonRetryable = [
        "404",
        "not found",
        "gone",
        "410",
        "invalid url",
        "malformed",
    ];

    const lowerMessage = message.toLowerCase();
    if (nonRetryable.some(pattern => lowerMessage.includes(pattern))) {
        return false;
    }

    // Retryable errors
    const retryable = [
        "timeout",
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "network",
        "429",
        "rate limit",
        "500",
        "502",
        "503",
        "504",
        "service unavailable",
        "bad gateway",
        "gateway timeout",
    ];

    return retryable.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
}
