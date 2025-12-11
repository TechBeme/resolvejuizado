import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Agent as UndiciAgent } from "undici";
import { load } from "cheerio";
import { FirecrawlClient } from "../clients/firecrawl.js";
import { FirecrawlPool } from "../clients/firecrawl-pool.js";
import type { SupabaseClient } from "../clients/supabase.js";
import { PaginationConfig, SiteConfig, persistPagination } from "../config/sites.js";
import { logger } from "../logger.js";
import {
  fetchWithRetry,
  fetchTextWithRetry,
  FetchTimeoutError,
  FetchNetworkError,
} from "../utils/fetch.js";
import {
  FailureLogger,
  getFailureLogger,
  isRetryableError,
} from "../utils/error-log.js";

type ListingPage = {
  pageUrl: string;
  links: string[];
  rawLinks?: string[];
  selectorLinks?: string[];
  linkSource?: "json" | "selector" | "feed";
  hitExisting: boolean;
};

type ListingFetchResult = {
  html?: string;
  links: string[];
  rawLinks?: string[];
  selectorLinks?: string[];
  linkSource?: "json" | "selector" | "feed";
};

export type ArticleContent = {
  url: string;
  listingPage: string;
  discoveredAt: string;
  markdown: string;
  html?: string;
  supabaseId?: string;
};

export type SiteIngestionResult = {
  siteId: string;
  pagesVisited: number;
  newUrls: string[];
  articles: ArticleContent[];
  stopReason: "max-pages" | "hit-existing" | "empty-page" | "fetch-error" | "no-links";
  failedPages: number;
  failedArticles: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Timeout and retry configuration
const DEFAULT_FETCH_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

const DEFAULT_MAX_PAGES = undefined as number | undefined;
const PAGE_PARAM_KEYS = ["page", "pagina", "pag", "p"];

const normalizeUrl = (raw: string, base: string) => {
  try {
    const resolved = new URL(raw, base);
    resolved.hash = "";

    // Normalização HTTP → HTTPS (evita redirects 301 que causam timeout)
    if (resolved.protocol === "http:") {
      resolved.protocol = "https:";
    }

    return resolved.toString();
  } catch {
    return undefined;
  }
};

const pageUrlFor = (pagination: PaginationConfig, baseUrl: string, page: number) => {
  if (pagination.strategy === "single-page") return baseUrl;
  const wantsTemplate =
    pagination.strategy !== "path-template" ||
    page > 1 ||
    Boolean((pagination as { useTemplateForFirstPage?: boolean }).useTemplateForFirstPage);
  if (!wantsTemplate || !("template" in pagination)) return baseUrl;
  const raw = (pagination as { template?: string }).template;
  if (!raw) return baseUrl;
  const normalized = raw.replace(/%7Bpage%7D/gi, "{page}").replace(/%7Boffset%7D/gi, "{offset}");
  const step = pagination.pageStep ?? 1;
  const base = pagination.pageBase ?? 0;
  const offsetValue = base + (page - pagination.startPage) * step;

  let result = normalized;
  if (result.includes("{page}")) {
    result = result.replace("{page}", String(page));
  }
  if (result.includes("{offset}")) {
    result = result.replace("{offset}", String(offsetValue));
  }
  return result;
};

const buildQueryTemplate = (url: URL): string | undefined => {
  for (const key of PAGE_PARAM_KEYS) {
    const value = url.searchParams.get(key);
    if (value && /^\d+$/.test(value) && Number(value) > 1) {
      const clone = new URL(url.toString());
      clone.searchParams.set(key, "{page}");
      return clone.toString();
    }
  }
  return undefined;
};

const buildPathTemplate = (url: URL): string | undefined => {
  const segments = url.pathname.split("/");

  // pattern: /page/2 or /pagina/2
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]?.toLowerCase();
    const next = segments[i + 1];
    if (["page", "pagina", "pag"].includes(seg) && next && /^\d+$/.test(next) && Number(next) > 1) {
      const clone = [...segments];
      clone[i + 1] = "{page}";
      const rebuilt = clone.join("/");
      return `${url.origin}${rebuilt}${url.search}`;
    }
  }

  // fallback: any trailing numeric segment
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg && /^\d+$/.test(seg) && Number(seg) > 1) {
      const clone = [...segments];
      clone[i] = "{page}";
      const rebuilt = clone.join("/");
      return `${url.origin}${rebuilt}${url.search}`;
    }
  }
  return undefined;
};

const deriveTemplateFromCandidate = (candidate: URL): string | undefined => {
  return buildQueryTemplate(candidate) ?? buildPathTemplate(candidate);
};
const detectPaginationViaExtract = async (
  site: SiteConfig,
  firecrawl: FirecrawlLike,
): Promise<PaginationConfig | undefined> => {
  const schema = {
    type: "object",
    properties: {
      nextPageUrl: { type: "string", nullable: true },
    },
    required: ["nextPageUrl"],
  };

  const prompt =
    "Você é um assistente que identifica paginação em uma listagem de notícias. Retorne apenas JSON seguindo o schema: {\"nextPageUrl\": string|null}. Extraia o link da próxima página (ex: página 2). A URL deve ser absoluta. Se não houver próxima página clara, retorne null.";

  const response = await firecrawl.extract({
    urls: [site.url],
    prompt,
    schema,
    allowExternalLinks: false,
    includeSubdomains: false,
    enableWebSearch: false,
  });

  const pickNextUrl = (payload: unknown): string | null => {
    if (!payload) return null;
    if (typeof payload === "string") return payload;
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const found = pickNextUrl(entry);
        if (found) return found;
      }
      return null;
    }
    if (typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (typeof obj.nextPageUrl === "string") return obj.nextPageUrl;
      if (obj.data) return pickNextUrl(obj.data);
      if (obj.result) return pickNextUrl(obj.result);
      if (obj.results) return pickNextUrl(obj.results);
      if (obj.items) return pickNextUrl(obj.items);
    }
    return null;
  };

  const nextUrl = pickNextUrl(response);
  if (!nextUrl) return undefined;

  try {
    const url = new URL(nextUrl);
    const template = deriveTemplateFromCandidate(url);
    if (!template) return undefined;
    return {
      strategy: "path-template",
      template,
      startPage: 1,
      maxPages: DEFAULT_MAX_PAGES,
      useTemplateForFirstPage: false,
    } satisfies PaginationConfig;
  } catch {
    return undefined;
  }
};

const detectPagination = async (
  site: SiteConfig,
  firecrawl: FirecrawlLike,
): Promise<PaginationConfig> => {
  const viaExtract = await detectPaginationViaExtract(site, firecrawl);
  if (viaExtract) return viaExtract;
  return { strategy: "single-page", startPage: 1, maxPages: 1 } satisfies PaginationConfig;
};

const ensurePagination = async (
  site: SiteConfig,
  firecrawl: FirecrawlLike,
): Promise<PaginationConfig> => {
  if (site.pagination) return site.pagination;
  const detected = await detectPagination(site, firecrawl);
  try {
    await persistPagination(site.id, detected);
  } catch (err) {
    logger.warn("Failed to persist pagination template", { siteId: site.id, error: String(err) });
  }
  return detected;
};

const hashUrl = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 10);
const hashContent = (content: string) => createHash("sha1").update(content).digest("hex");

const safeSlugFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const raw = `${parsed.hostname}-${parsed.pathname}`.replace(/[^a-zA-Z0-9]+/g, "-");
    const trimmed = raw.replace(/^-+|-+$/g, "");
    const slug = trimmed.slice(0, 80) || "article";
    return `${slug}-${hashUrl(url)}`;
  } catch {
    return `article-${hashUrl(url)}`;
  }
};

const writeJson = async (filePath: string, data: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const loadKnownUrls = async (siteId: string, stateDir: string) => {
  const filePath = path.join(stateDir, `${siteId}-known-urls.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.urls)) return new Set<string>(parsed.urls);
  } catch {
    // ignore missing state
  }
  return new Set<string>();
};

const saveKnownUrls = async (siteId: string, stateDir: string, urls: Set<string>) => {
  const filePath = path.join(stateDir, `${siteId}-known-urls.json`);
  await writeJson(filePath, { urls: Array.from(urls).sort() });
};

const fetchListing = async (
  site: SiteConfig,
  pagination: PaginationConfig,
  page: number,
  firecrawl: FirecrawlLike,
): Promise<ListingFetchResult> => {
  const url = pageUrlFor(pagination, site.url, page);
  const includeTags = site.linkSelector;
  const dispatcher = site.skipTlsVerify
    ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const fallbackWithFirecrawl = async (): Promise<ListingFetchResult> => {
    const scraped = await firecrawl.scrape(url, {
      formats: ["html", "markdown"],
      onlyMainContent: false,
      includeTags,
    });
    const html = scraped.html ?? scraped.rawHtml ?? scraped.markdown;
    const links: string[] = [];
    if (html && site.linkSelector?.length) {
      const $ = load(html);
      const collected = new Set<string>();
      for (const selector of site.linkSelector) {
        $(selector).each((_, el) => {
          const elHref = $(el).attr("href");
          const anchorHref = $(el).find("a").first().attr("href");
          const href = elHref ?? anchorHref;
          if (!href) return;
          const normalized = normalizeUrl(href, url);
          if (normalized) collected.add(normalized);
        });
      }
      links.push(...collected);
    }
    if (html && !links.length) {
      const $ = load(html);
      const collected = new Set<string>();
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        const normalized = normalizeUrl(href ?? "", url);
        if (normalized) collected.add(normalized);
      });
      links.push(...collected);
    }
    return { html: scraped.html ?? scraped.rawHtml, links, rawLinks: links, selectorLinks: links, linkSource: "selector" };
  };

  if (pagination.strategy === "firecrawl") {
    return fallbackWithFirecrawl();
  }
  if (pagination.strategy === "rss-feed") {
    const xml = await fetchTextWithRetry(url, {
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      maxRetries: DEFAULT_MAX_RETRIES,
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
      dispatcher,
    });
    const $ = load(xml, { xmlMode: true });
    const links = new Set<string>();

    const addUrl = (maybeUrl: string | undefined) => {
      if (!maybeUrl) return;
      const normalized = normalizeUrl(maybeUrl, url);
      if (normalized) links.add(normalized);
    };

    // RSS: iterate items; prefer <link>, fallback to <guid isPermaLink="true"> or URL-looking GUID when link is absent.
    $("item").each((_, itemEl) => {
      const link = $(itemEl).children("link").first().text().trim();
      if (link) {
        addUrl(link);
        return;
      }
      const guidEl = $(itemEl).children("guid").first();
      const guid = guidEl.text().trim();
      const isPerma = (guidEl.attr("ispermalink") ?? "").toLowerCase() === "true";
      if (isPerma || /^https?:\/\//i.test(guid)) addUrl(guid);
    });

    // Atom: iterate entries; pick rel="alternate" if present; else fallback to first link.
    $("entry").each((_, entryEl) => {
      const altLink = $(entryEl)
        .children("link")
        .filter((_, el) => (($(el).attr("rel") ?? "alternate").toLowerCase() === "alternate"))
        .first()
        .attr("href");
      if (altLink) {
        addUrl(altLink.trim());
        return;
      }
      const anyLink = $(entryEl).children("link").first().attr("href");
      if (anyLink) addUrl(anyLink.trim());
    });

    const finalLinks = Array.from(links);
    return { html: xml, links: finalLinks, rawLinks: finalLinks, linkSource: "feed" };
  }
  if (pagination.strategy === "api-wordpress") {
    try {
      const endpoint = pagination.template.replace("{page}", String(page));
      const resp = await fetchWithRetry(endpoint, {
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
        maxDelayMs: DEFAULT_MAX_DELAY_MS,
        dispatcher,
        retryOn: (error, response) => {
          // Don't retry on 400 with rest_post_invalid_page_number (end of pagination)
          if (response?.status === 400) {
            return false;
          }
          // Retry on timeout, network, or 5xx/429
          if (error instanceof FetchTimeoutError || error instanceof FetchNetworkError) {
            return true;
          }
          if (response) {
            return response.status === 429 || response.status >= 500;
          }
          return true;
        },

      });
      if (!resp.ok) {
        if (resp.status === 400) {
          try {
            const data = (await resp.json()) as { code?: string };
            if (data?.code === "rest_post_invalid_page_number") {
              logger.warn("WP API pagination reached end", {
                siteId: site.id,
                page,
                status: resp.status,
              });
              return { html: undefined, links: [] };
            }
          } catch {
            // ignore parse errors, fall through to throw
          }
        }
        throw new Error(`Failed to fetch API listing: ${resp.status} ${resp.statusText}`);
      }
      const json = await resp.json();
      const linkField = pagination.linkField ?? "link";
      const links: string[] = Array.isArray(json)
        ? json
          .map((item) => item?.[linkField])
          .filter((v): v is string => typeof v === "string")
        : [];
      return { html: undefined, links };
    } catch (err) {
      logger.warn("API WordPress listing failed, falling back to Firecrawl", {
        siteId: site.id,
        page,
        error: String(err),
      });
      return fallbackWithFirecrawl();
    }
  }
  if (pagination.strategy === "api-json") {
    try {
      const endpoint = url;
      const resp = await fetchWithRetry(endpoint, {
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
        maxDelayMs: DEFAULT_MAX_DELAY_MS,
        headers: pagination.headers,
        dispatcher,
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch API JSON listing: ${resp.status} ${resp.statusText}`);
      }
      const json = await resp.json();
      const linkField = pagination.linkField ?? "url";
      const linkTemplate = (pagination as { linkTemplate?: string }).linkTemplate;
      const links: string[] = [];

      const addLinksFromArray = (arr: unknown[]) => {
        for (const item of arr) {
          if (item && typeof item === "object" && linkField in (item as Record<string, unknown>)) {
            const val = (item as Record<string, unknown>)[linkField];
            if (typeof val === "string") {
              const hydrated = linkTemplate ? linkTemplate.replace("{value}", val) : val;
              links.push(hydrated);
            }
          } else if (item && typeof item === "object" && "url" in (item as Record<string, unknown>)) {
            const val = (item as Record<string, unknown>)["url"];
            if (typeof val === "string") {
              const hydrated = linkTemplate ? linkTemplate.replace("{value}", val) : val;
              links.push(hydrated);
            }
          }
        }
      };

      if (Array.isArray(json)) {
        addLinksFromArray(json);
      } else if (json && typeof json === "object") {
        const obj = json as Record<string, unknown>;
        if (Array.isArray(obj.results)) addLinksFromArray(obj.results);
        if (Array.isArray(obj.items)) addLinksFromArray(obj.items);
        if (Array.isArray(obj.data)) addLinksFromArray(obj.data);
      }

      return { html: undefined, links };
    } catch (err) {
      logger.warn("API JSON listing failed, falling back to Firecrawl", {
        siteId: site.id,
        page,
        error: String(err),
      });
      return fallbackWithFirecrawl();
    }
  }

  // path-template / single-page: tentar HTML direto com timeout e retry; fallback para Firecrawl se falhar ou não achar links.
  if (pagination.strategy === "path-template" || pagination.strategy === "single-page") {
    let lastHtmlError: unknown;
    try {
      const html = await fetchTextWithRetry(url, {
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
        maxDelayMs: DEFAULT_MAX_DELAY_MS,
        dispatcher,
      });
      const $ = load(html);
      const collected = new Set<string>();
      if (site.linkSelector?.length) {
        for (const selector of site.linkSelector) {
          $(selector).each((_, el) => {
            const elHref = $(el).attr("href");
            const anchorHref = $(el).find("a").first().attr("href");
            const href = elHref ?? anchorHref;
            if (!href) return;
            const normalized = normalizeUrl(href, url);
            if (normalized) collected.add(normalized);
          });
        }
      }
      // Fallback: pegue todos os anchors se nenhum selector foi fornecido ou não trouxe links.
      if (!collected.size) {
        $("a").each((_, el) => {
          const href = $(el).attr("href");
          const normalized = normalizeUrl(href ?? "", url);
          if (normalized) collected.add(normalized);
        });
      }
      const links = Array.from(collected);
      if (links.length) {
        return {
          html,
          links,
          rawLinks: links,
          selectorLinks: links,
          linkSource: site.linkSelector?.length ? "selector" : "json",
        };
      }
      lastHtmlError = new Error("No links found via direct HTML");
    } catch (err) {
      lastHtmlError = err;
    }
    logger.warn("HTML fetch failed or no links found, falling back to Firecrawl", {
      siteId: site.id,
      page,
      error: lastHtmlError ? (lastHtmlError instanceof Error ? lastHtmlError.message : String(lastHtmlError)) : undefined,
    });
    return await fallbackWithFirecrawl();
  }

  // Default fallback.
  return fallbackWithFirecrawl();
};

const scrapeArticle = async (firecrawl: FirecrawlLike, url: string): Promise<ArticleContent> => {
  const scraped = await firecrawl.scrape(url, { formats: ["markdown", "html", "rawHtml"] });
  const markdown = scraped.markdown ?? scraped.html ?? scraped.rawHtml;
  if (!markdown) {
    throw new Error(`Empty article content for ${url}`);
  }
  return {
    url,
    listingPage: "",
    discoveredAt: new Date().toISOString(),
    markdown,
    html: scraped.html,
  };
};

const saveArticle = async (baseDir: string, siteId: string, article: ArticleContent) => {
  const slug = safeSlugFromUrl(article.url);
  const siteDir = path.join(baseDir, "articles", siteId);
  await fs.mkdir(siteDir, { recursive: true });
  await fs.writeFile(path.join(siteDir, `${slug}.md`), article.markdown, "utf8");
  await writeJson(path.join(siteDir, `${slug}.json`), article);
};

const saveListingResult = async (
  baseDir: string,
  siteId: string,
  runId: string,
  page: number,
  listing: ListingPage,
  links: string[],
) => {
  const filePath = path.join(baseDir, "urls", `${siteId}-${runId}-page-${page}.json`);
  await writeJson(filePath, {
    ...listing,
    discoveredUrls: links,
  });
};

const saveAggregateUrls = async (baseDir: string, siteId: string, runId: string, urls: string[]) => {
  const filePath = path.join(baseDir, "urls", `${siteId}-${runId}-all.json`);
  await writeJson(filePath, { urls });
};

/** Firecrawl client type - either single client or pool of clients */
export type FirecrawlLike = FirecrawlClient | FirecrawlPool;

export type IngestOptions = {
  site: SiteConfig;
  firecrawl: FirecrawlLike;
  runId: string;
  outputDir?: string;
  stateDir?: string;
  pageDelayMs?: number;
  retry429?: boolean;
  listOnly?: boolean;
  retries?: number;
  supabase?: SupabaseClient;
  supabaseRunKey?: string;
  failureLogger?: FailureLogger;
  /** Ignore existing URLs and process all pages (bypasses hit-existing stop) */
  ignoreExisting?: boolean;
  /** Max consecutive page failures before stopping */
  maxConsecutivePageFailures?: number;
};

export async function ingestSite(options: IngestOptions): Promise<SiteIngestionResult> {
  const { site, firecrawl, runId } = options;
  const outputDir = options.outputDir ?? path.join(process.cwd(), "data", "runs", runId);
  const stateDir = options.stateDir ?? path.join(process.cwd(), "data", "state");
  const pageDelayMs = options.pageDelayMs ?? 5000;
  const retry429 = options.retry429 ?? true;
  const listOnly = options.listOnly ?? false;
  const maxRetries = options.retries ?? 5;
  const supabase = options.supabase;
  const supabaseRunKey = options.supabaseRunKey ?? `${runId}-${site.id}`;
  const failureLogger = options.failureLogger ?? getFailureLogger();
  const maxConsecutivePageFailures = options.maxConsecutivePageFailures ?? 3;
  const ignoreExisting = options.ignoreExisting ?? false;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });

  let supabaseRunId: string | undefined;
  const supabaseArticleIds = new Map<string, string>();
  const listingPageByUrl = new Map<string, string>();
  const discoveredAtByUrl = new Map<string, string>();
  let failedPages = 0;
  let failedArticles = 0;
  let consecutivePageFailures = 0;

  if (supabase) {
    try {
      const run = await supabase.upsertIngestionRun({
        runKey: supabaseRunKey,
        siteId: site.id,
        status: "running",
        startedAt: new Date().toISOString(),
      });
      supabaseRunId = run.id;
    } catch (err) {
      logger.warn("Failed to upsert Supabase ingestion run", { siteId: site.id, runKey: supabaseRunKey, error: String(err) });
    }
  }

  let baselineKnown = new Set<string>();
  const knownUrls = await loadKnownUrls(site.id, stateDir);
  baselineKnown = new Set([...baselineKnown, ...knownUrls]);

  if (supabase) {
    try {
      const supabaseKnown = await supabase.listKnownUrlsForSite(site.id);
      baselineKnown = new Set([...baselineKnown, ...supabaseKnown]);
    } catch (err) {
      logger.warn("Failed to load known URLs from Supabase", { siteId: site.id, error: String(err) });
    }
  }

  const knownUrlsCombined = new Set(baselineKnown);
  const seenThisRun = new Set<string>();

  const newUrls: string[] = [];
  const articles: ArticleContent[] = [];

  // Detectar e configurar paginação (silenciado)
  const pagination = await ensurePagination(site, firecrawl);
  // When ignoreExisting is true and no maxPages is set, use a sensible default to avoid infinite loops
  const effectiveMaxPages = pagination.maxPages ?? (ignoreExisting ? 200 : undefined);

  let pagesVisited = 0;
  let stopReason: SiteIngestionResult["stopReason"] = "max-pages";

  for (let page = pagination.startPage; !effectiveMaxPages || page <= effectiveMaxPages; page += 1) {
    try {
      let listing: ListingFetchResult | null = null;
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
          listing = await fetchListing(site, pagination, page, firecrawl);
          break;
        } catch (err) {
          const msg = String(err);
          const wantsRetry429 = retry429 && msg.includes("429");
          const shouldRetry = attempt + 1 < maxRetries && (wantsRetry429 || true);
          if (!shouldRetry) throw err;
          const delay = Math.min(1000 * (attempt + 1) ** 2, 8000);
          await sleep(delay);
        }
      }
      if (!listing) throw new Error("Failed to fetch listing after retries");
      pagesVisited += 1;

      const pageUrl = pageUrlFor(pagination, site.url, page);
      const filtered: string[] = [];
      let hitExisting = false;

      for (const link of listing.links) {
        if (baselineKnown.has(link)) {
          hitExisting = true;
          if (!ignoreExisting) {
            // Found existing URL, stopping pagination (silenciado)
            break; // early-stop: reached older news
          }
          // When ignoreExisting is true, continue but don't add known URLs
          continue;
        }
        if (!seenThisRun.has(link)) {
          filtered.push(link);
          seenThisRun.add(link);
        }
      }

      await saveListingResult(
        outputDir,
        site.id,
        runId,
        page,
        {
          pageUrl,
          links: listing.links,
          rawLinks: listing.rawLinks,
          selectorLinks: listing.selectorLinks,
          linkSource: listing.linkSource,
          hitExisting,
        },
        filtered,
      );

      if (!filtered.length && hitExisting && !ignoreExisting) {
        stopReason = "hit-existing";
        break;
      }
      if (!filtered.length && !listing.links.length) {
        stopReason = "no-links";
        break;
      }

      for (const url of filtered) {
        newUrls.push(url);
        knownUrlsCombined.add(url);
        listingPageByUrl.set(url, pageUrl);
        const discoveredAt = new Date().toISOString();
        discoveredAtByUrl.set(url, discoveredAt);

        if (supabase) {
          try {
            const record = await supabase.upsertArticle({
              siteId: site.id,
              sourceUrl: url,
              listingPageUrl: pageUrl,
              discoveredAt,
              ingestionRunId: supabaseRunId,
              extractionStatus: listOnly ? "pending" : undefined,
            });
            if (record?.id) supabaseArticleIds.set(url, record.id);
          } catch (err) {
            logger.warn("Supabase upsert_article failed", {
              siteId: site.id,
              url,
              error: String(err),
            });
          }
        }
      }

      if (hitExisting && !ignoreExisting) {
        stopReason = "hit-existing";
        break;
      }

      if (pagination.strategy === "single-page") {
        stopReason = "empty-page";
        break;
      }

      // Reset consecutive failure count on success
      consecutivePageFailures = 0;
    } catch (error) {
      failedPages += 1;
      consecutivePageFailures += 1;
      const pageUrl = pageUrlFor(pagination, site.url, page);
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Failed to process listing page", {
        siteId: site.id,
        page,
        pageUrl,
        error: errorMessage,
        consecutiveFailures: consecutivePageFailures,
        maxConsecutivePageFailures,
      });

      // Log failure for later reprocessing
      await failureLogger.logFailure({
        siteId: site.id,
        runId,
        type: "listing-page",
        url: pageUrl,
        page,
        error: errorMessage,
        attempts: maxRetries,
        retryable: isRetryableError(error),
      });

      // Continue trying if we haven't hit too many consecutive failures
      if (consecutivePageFailures >= maxConsecutivePageFailures) {
        logger.error("Too many consecutive page failures, stopping", {
          siteId: site.id,
          consecutiveFailures: consecutivePageFailures,
          maxConsecutivePageFailures,
        });
        stopReason = "fetch-error";
        break;
      }

      // For single-page strategy, stop on error
      if (pagination.strategy === "single-page") {
        stopReason = "fetch-error";
        break;
      }

      // Otherwise continue to next page
      logger.info("Continuing to next page despite failure", {
        siteId: site.id,
        failedPage: page,
        nextPage: page + 1,
      });
    }

    if (pageDelayMs > 0) await new Promise((r) => setTimeout(r, pageDelayMs));
  }

  await saveKnownUrls(site.id, stateDir, knownUrlsCombined);
  await saveAggregateUrls(outputDir, site.id, runId, newUrls);

  if (!listOnly && stopReason !== "fetch-error") {
    // Phase 2: scrape each new URL after pagination is done.
    for (const url of newUrls) {
      try {
        const article = await scrapeArticle(firecrawl, url);
        article.listingPage = listingPageByUrl.get(url) ?? "";
        article.discoveredAt = discoveredAtByUrl.get(url) ?? article.discoveredAt;
        article.supabaseId = supabaseArticleIds.get(url);
        articles.push(article);
        await saveArticle(outputDir, site.id, article);

        if (supabase) {
          try {
            const contentHash = hashContent(article.markdown);
            const record = await supabase.upsertArticle({
              siteId: site.id,
              sourceUrl: article.url,
              listingPageUrl: article.listingPage,
              discoveredAt: article.discoveredAt,
              contentHash,
              rawMarkdown: article.markdown,
              rawHtml: article.html,
              ingestionRunId: supabaseRunId,
              extractionStatus: "succeeded",
            });
            const articleId = record?.id ?? article.supabaseId;
            if (record?.id) {
              article.supabaseId = record.id;
              supabaseArticleIds.set(article.url, record.id);
            }
            if (articleId) {
              await supabase.markArticleStage({
                articleId,
                stage: "extraction",
                status: "succeeded",
                payload: { runId, siteId: site.id },
              });
            }
          } catch (err) {
            logger.warn("Supabase extraction status update failed", {
              siteId: site.id,
              url,
              error: String(err),
            });
          }
        }
      } catch (error) {
        failedArticles += 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to scrape article", { siteId: site.id, url, error: errorMessage });

        // Log failure for later reprocessing
        await failureLogger.logFailure({
          siteId: site.id,
          runId,
          type: "article-scrape",
          url,
          error: errorMessage,
          attempts: 1,
          retryable: isRetryableError(error),
        });

        if (supabase) {
          const articleId = supabaseArticleIds.get(url);
          if (articleId) {
            try {
              await supabase.markArticleStage({
                articleId,
                stage: "extraction",
                status: "failed",
                error: errorMessage,
                payload: { runId, siteId: site.id },
              });
            } catch (markErr) {
              logger.warn("Failed to flag Supabase extraction failure", {
                siteId: site.id,
                url,
                error: String(markErr),
              });
            }
          }
        }
        // continue with other URLs
      }
      if (pageDelayMs > 0) await new Promise((r) => setTimeout(r, pageDelayMs));
    }
  }

  if (supabase) {
    try {
      const status = stopReason === "fetch-error" && failedPages > 0 ? "failed" : "succeeded";
      await supabase.upsertIngestionRun({
        runKey: supabaseRunKey,
        siteId: site.id,
        status,
        pagesVisited,
        newUrls: newUrls.length,
        stopReason,
        error: status === "failed" ? `${failedPages} pages failed, ${failedArticles} articles failed` : null,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn("Failed to finalize Supabase ingestion run", {
        siteId: site.id,
        runKey: supabaseRunKey,
        error: String(err),
      });
    }
  }

  // Log summary of failures
  if (failedPages > 0 || failedArticles > 0) {
    logger.warn("Ingestion completed with failures", {
      siteId: site.id,
      failedPages,
      failedArticles,
      newUrls: newUrls.length,
      pagesVisited,
    });
  }

  return {
    siteId: site.id,
    pagesVisited,
    newUrls,
    articles,
    stopReason,
    failedPages,
    failedArticles,
  };
}
