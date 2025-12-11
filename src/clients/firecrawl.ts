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

export type FirecrawlCrawlOptions = {
  url: string;
  maxDiscoveryDepth?: number;
  limit?: number;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  crawlEntireDomain?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
  sitemap?: "include" | "exclude" | "only";
  prompt?: string;
  scrapeOptions?: FirecrawlScrapeOptions & {
    maxAge?: number;
    parsers?: string[];
  };
};

type FirecrawlCrawlResponse = {
  success: boolean;
  data?: unknown;
  message?: string;
};

export type FirecrawlCrawlPage = {
  url: string;
  markdown?: string;
  html?: string;
  content?: string;
  text?: string;
};

export type FirecrawlCrawlResult = {
  urls: string[];
  pages: FirecrawlCrawlPage[];
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



export class FirecrawlClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.firecrawl.dev";
  }

  async scrape(url: string, options?: FirecrawlScrapeOptions): Promise<FirecrawlScrapeResult> {
    const body = {
      url,
      formats: options?.formats ?? ["markdown", "html"],
      onlyMainContent: options?.onlyMainContent ?? false,
      waitFor: options?.waitFor,
      includeTags: options?.includeTags,
      excludeTags: options?.excludeTags,
      maxAge: options?.maxAge,
      mobile: options?.mobile,
      parsers: options?.parsers,
    };

    const response = await fetch(`${this.baseUrl}/v1/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
    const response = await fetch(`${this.baseUrl.replace(/\/v1$/, "")}/v2/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        onlyMainContent: false,
        includeTags: options?.includeTags,
        excludeTags: options?.excludeTags,
        maxAge: options?.maxAge,
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
  }

  async crawl(options: FirecrawlCrawlOptions): Promise<FirecrawlCrawlResult> {
    const response = await fetch(`${this.baseUrl}/v1/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firecrawl crawl failed: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = (await response.json()) as FirecrawlCrawlResponse;
    if (!data.success) {
      throw new Error(`Firecrawl crawl unsuccessful: ${data.message ?? "unknown error"}`);
    }

    const urls = new Set<string>();
    const pages: FirecrawlCrawlPage[] = [];

    const addPage = (page: unknown) => {
      if (!page || typeof page !== "object") return;
      const maybe = page as { url?: string; markdown?: string; html?: string; content?: string; text?: string };
      if (maybe.url) {
        urls.add(maybe.url);
        pages.push({
          url: maybe.url,
          markdown: maybe.markdown,
          html: maybe.html,
          content: maybe.content,
          text: maybe.text,
        });
      }
    };

    const addUrl = (value: unknown) => {
      if (typeof value === "string") urls.add(value);
      if (value && typeof value === "object" && (value as { url?: string }).url) {
        urls.add((value as { url: string }).url);
      }
    };

    const tryExtract = (payload: unknown) => {
      if (!payload) return;
      const maybeArray = payload as unknown[];
      if (Array.isArray(maybeArray)) {
        maybeArray.forEach((entry) => {
          addUrl(entry);
          addPage(entry);
        });
      }
      if (payload && typeof payload === "object") {
        const obj = payload as Record<string, unknown>;
        if (Array.isArray(obj.urls)) obj.urls.forEach(addUrl);
        if (Array.isArray(obj.data)) obj.data.forEach((entry) => {
          addUrl(entry);
          addPage(entry);
        });
        if (Array.isArray(obj.results)) obj.results.forEach((entry) => {
          addUrl(entry);
          addPage(entry);
        });
        if (Array.isArray(obj.pages)) obj.pages.forEach(addPage);
        if (Array.isArray(obj.items)) obj.items.forEach((entry) => {
          addUrl(entry);
          addPage(entry);
        });
      }
    };

    tryExtract(data.data);
    tryExtract((data as { data?: { data?: unknown } }).data?.data);
    tryExtract((data as { data?: { results?: unknown } }).data?.results);

    return { urls: Array.from(urls), pages };
  }

  async extract(options: FirecrawlExtractOptions): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/v1/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
  }

  async extractStatus(id: string): Promise<FirecrawlExtractResponse> {
    const response = await fetch(`${this.baseUrl}/v1/extract/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firecrawl extract status failed: ${response.status} ${response.statusText} - ${text}`);
    }
    return (await response.json()) as FirecrawlExtractResponse;
  }
}
