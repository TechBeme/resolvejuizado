import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ingestSite } from "../src/pipeline/ingest.js";

class FirecrawlStub {
  public scrapeCalls: string[] = [];

  async scrape(url: string) {
    this.scrapeCalls.push(url);
    if (url.includes("article")) {
      return { markdown: `content for ${url}` };
    }
    return {
      html: '<a href="https://example.com/article-1">link</a>',
    };
  }
}

class SupabaseStub {
  public runs: any[] = [];
  public articles: any[] = [];
  public stages: any[] = [];
  public known = new Set<string>();

  async upsertIngestionRun(payload: any) {
    this.runs.push(payload);
    return { id: "run-1" } as any;
  }

  async upsertArticle(payload: any) {
    this.articles.push(payload);
    return { id: payload.p_source_url ?? payload.sourceUrl ?? "article-id" } as any;
  }

  async markArticleStage(payload: any) {
    this.stages.push(payload);
    return {} as any;
  }

  async listKnownUrlsForSite() {
    return this.known;
  }
}

test("ingestSite stores new URLs and marks extraction in Supabase", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-test-"));
  const outputDir = path.join(tmpDir, "out");
  const stateDir = path.join(tmpDir, "state");

  const firecrawl = new FirecrawlStub();
  const supabase = new SupabaseStub();

  const site = {
    id: "site-1",
    url: "https://example.com/list",
    active: true,
    pagination: { strategy: "firecrawl", startPage: 1, maxPages: 1 },
  } as any;

  const result = await ingestSite({
    site,
    firecrawl: firecrawl as any,
    runId: "run-xyz",
    outputDir,
    stateDir,
    pageDelayMs: 0,
    supabase: supabase as any,
    supabaseRunKey: "run-xyz-site-1",
  });

  assert.equal(result.newUrls.length, 1);
  assert.equal(result.articles.length, 1);
  assert.equal(firecrawl.scrapeCalls.filter((u) => u.includes("article")).length, 1);

  const statuses = supabase.stages.map((s) => `${s.stage}:${s.status}`);
  assert.deepEqual(statuses, ["extraction:succeeded"]);

  const runFinal = supabase.runs[supabase.runs.length - 1];
  assert.ok(runFinal, "should finalize run in Supabase");
  assert.equal(runFinal.status, "succeeded");

  await fs.rm(tmpDir, { recursive: true, force: true });
});
