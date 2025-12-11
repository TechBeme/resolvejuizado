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
    return {
      html: [
        '<a href="https://example.com/known">known</a>',
        '<a href="https://example.com/new-article">new</a>',
      ].join(""),
    };
  }
}

test("ingestSite stops pagination when encountering known URLs", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-existing-"));
  const outputDir = path.join(tmpDir, "out");
  const stateDir = path.join(tmpDir, "state");
  await fs.mkdir(stateDir, { recursive: true });

  const siteId = "site-1";
  const knownUrl = "https://example.com/known";
  await fs.writeFile(path.join(stateDir, `${siteId}-known-urls.json`), JSON.stringify({ urls: [knownUrl] }), "utf8");

  const firecrawl = new FirecrawlStub();

  const site = {
    id: siteId,
    url: "https://example.com/list",
    active: true,
    pagination: { strategy: "firecrawl", startPage: 1, maxPages: 2 },
  } as any;

  const result = await ingestSite({
    site,
    firecrawl: firecrawl as any,
    runId: "run-1",
    outputDir,
    stateDir,
    pageDelayMs: 0,
    listOnly: true,
  });

  assert.equal(result.stopReason, "hit-existing");
  assert.equal(result.newUrls.length, 0);
  assert.equal(result.pagesVisited, 1);
  assert.equal(firecrawl.scrapeCalls.length, 1, "only listing scrape should be called");

  const aggregate = JSON.parse(await fs.readFile(path.join(outputDir, "urls", `${siteId}-run-1-all.json`), "utf8"));
  assert.deepEqual(aggregate.urls, []);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
