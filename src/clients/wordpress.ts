type CreatePostPayload = {
  title: string;
  content: string;
  status?: "draft" | "publish";
  excerpt?: string;
  slug?: string;
  featured_media?: number;
  categories?: number[];
  meta?: Record<string, unknown>;
};

type WordPressCategory = {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
};

export class WordPressClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(opts: { baseUrl: string; appUser: string; appPassword: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    const token = Buffer.from(`${opts.appUser}:${opts.appPassword}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`WordPress API error ${response.status} ${response.statusText}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async createPost(payload: CreatePostPayload) {
    return this.request<{ id: number; link: string; status: string; slug: string }>(
      "/wp-json/wp/v2/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft", ...payload }),
      },
    );
  }

  async uploadMedia(file: {
    filename: string;
    data: Uint8Array;
    mimeType: string;
    altText?: string;
  }) {
    const media = await this.request<{ id: number; source_url: string }>(
      "/wp-json/wp/v2/media",
      {
        method: "POST",
        headers: {
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Content-Type": file.mimeType,
        },
        body: Buffer.from(file.data),
      },
    );

    if (file.altText) {
      await this.request(`/wp-json/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: file.altText }),
      });
    }

    return media;
  }

  async listCategories(): Promise<WordPressCategory[]> {
    return this.request<WordPressCategory[]>("/wp-json/wp/v2/categories?per_page=100", {
      method: "GET",
    });
  }

  async getCategoryBySlug(slug: string): Promise<WordPressCategory | null> {
    const categories = await this.request<WordPressCategory[]>(
      `/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}`,
      { method: "GET" },
    );
    return categories.length > 0 ? categories[0] : null;
  }

  async createCategory(payload: { name: string; slug: string; description?: string }): Promise<WordPressCategory> {
    return this.request<WordPressCategory>("/wp-json/wp/v2/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async getOrCreateCategory(name: string, slug: string): Promise<WordPressCategory> {
    const existing = await this.getCategoryBySlug(slug);
    if (existing) {
      return existing;
    }
    return this.createCategory({ name, slug, description: `Notícias sobre ${name}` });
  }
}
