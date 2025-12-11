import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../logger.js";

const paginationSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("path-template"),
    template: z.string(),
    startPage: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    useTemplateForFirstPage: z.boolean().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
  z.object({
    strategy: z.literal("rss-feed"),
    template: z.string(),
    startPage: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    useTemplateForFirstPage: z.boolean().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
  z.object({
    strategy: z.literal("api-json"),
    template: z.string(),
    linkField: z.string().optional(),
    linkTemplate: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    startPage: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
  z.object({
    strategy: z.literal("api-wordpress"),
    template: z.string(),
    linkField: z.string().optional(),
    startPage: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
  z.object({
    strategy: z.literal("single-page"),
    maxPages: z.number().int().positive().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
  z.object({
    strategy: z.literal("firecrawl"),
    template: z.string(),
    startPage: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    useTemplateForFirstPage: z.boolean().optional(),
    pageStep: z.number().int().positive().optional(),
    pageBase: z.number().int().nonnegative().optional(),
  }),
]);

const siteSchema = z.object({
  url: z.string().url(),
  active: z.boolean().default(true),
  pagination: paginationSchema.optional(),
  // Optional CSS selectors (classes, ids, etc.) to locate post links on listing pages.
  linkSelector: z.union([z.string(), z.array(z.string())]).optional(),
  skipTlsVerify: z.boolean().optional(),
});

const registrySchema = z.object({
  sites: z.array(siteSchema),
});

export type PaginationConfig = z.infer<typeof paginationSchema> & {
  startPage: number;
  maxPages?: number;
  pageStep?: number;
  pageBase?: number;
};

export type SiteConfig = {
  id: string;
  url: string;
  active: boolean;
  pagination?: PaginationConfig;
  linkSelector?: string[];
  skipTlsVerify?: boolean;
};

const deriveId = (url: string): string => {
  try {
    const parsed = new URL(url);
    const base = `${parsed.hostname}-${parsed.pathname}`.replace(/[^a-zA-Z0-9]+/g, "-");
    return base.replace(/^-+|-+$/g, "") || "site";
  } catch {
    return "site";
  }
};

const normalizeLinkSelector = (selector?: string | string[]): string[] | undefined => {
  if (!selector) return undefined;
  const list = Array.isArray(selector) ? selector : [selector];
  const cleaned = list.map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

const normalizePagination = (pagination?: z.infer<typeof paginationSchema>): PaginationConfig | undefined => {
  if (!pagination) return undefined;
  const startPage = (pagination as { startPage?: number }).startPage ?? 1;
  const maxPages = (pagination as { maxPages?: number }).maxPages;
  const pageStep = (pagination as { pageStep?: number }).pageStep ?? 1;
  const pageBase = (pagination as { pageBase?: number }).pageBase ?? 0;
  return { ...pagination, startPage, maxPages, pageStep, pageBase };
};

export async function loadSiteRegistry(registryPath = path.join(process.cwd(), "config", "sites.json")): Promise<SiteConfig[]> {
  const raw = await fs.readFile(registryPath, "utf8");
  const parsed = registrySchema.parse(JSON.parse(raw));

  return parsed.sites.map((site) => {
    const pagination = normalizePagination(site.pagination);
    const linkSelector = normalizeLinkSelector(site.linkSelector);
    return {
      id: deriveId(site.url),
      url: site.url,
      active: site.active ?? true,
      pagination,
      linkSelector,
      skipTlsVerify: site.skipTlsVerify,
    } satisfies SiteConfig;
  });
}

export async function loadActiveSites(registryPath?: string): Promise<SiteConfig[]> {
  const sites = await loadSiteRegistry(registryPath);
  return sites.filter((site) => site.active);
}

export async function persistPagination(
  siteId: string,
  pagination: PaginationConfig,
  registryPath = path.join(process.cwd(), "config", "sites.json"),
): Promise<void> {
  const raw = await fs.readFile(registryPath, "utf8");
  const parsed = registrySchema.parse(JSON.parse(raw));

  const idx = parsed.sites.findIndex((s) => deriveId(s.url) === siteId);
  if (idx === -1) {
    logger.warn("Cannot persist pagination: site not found in registry", { siteId });
    return;
  }

  parsed.sites[idx] = {
    ...parsed.sites[idx],
    pagination,
  };

  await fs.writeFile(registryPath, JSON.stringify(parsed, null, 2), "utf8");
}
