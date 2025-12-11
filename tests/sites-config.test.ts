import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadActiveSites, persistPagination } from "../src/config/sites.js";

test("loadActiveSites normalizes ids, selectors and pagination defaults", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sites-config-"));
  const registryPath = path.join(tmpDir, "sites.json");

  const registry = {
    sites: [
      {
        url: "https://Foo.com/noticias/",
        active: true,
        linkSelector: ".post a",
        pagination: { strategy: "path-template", template: "https://foo.com/noticias/page/{page}" },
      },
      { url: "https://inactive.example.com", active: false },
    ],
  };

  await fs.writeFile(registryPath, JSON.stringify(registry), "utf8");

  const sites = await loadActiveSites(registryPath);
  assert.equal(sites.length, 1);
  const site = sites[0];
  assert.equal(site.id, "foo-com-noticias");
  assert.deepEqual(site.linkSelector, [".post a"]);
  assert.equal(site.pagination?.startPage, 1);
  assert.equal(site.pagination?.pageStep, 1);
  assert.equal(site.pagination?.pageBase, 0);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("persistPagination overwrites pagination in registry", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sites-config-"));
  const registryPath = path.join(tmpDir, "sites.json");

  const registry = {
    sites: [
      {
        url: "https://example.com/list",
        active: true,
        pagination: { strategy: "single-page" },
      },
    ],
  };
  await fs.writeFile(registryPath, JSON.stringify(registry), "utf8");

  await persistPagination(
    "example-com-list",
    { strategy: "path-template", template: "https://example.com/list/page/{page}", startPage: 1 },
    registryPath,
  );

  const updated = JSON.parse(await fs.readFile(registryPath, "utf8")) as any;
  assert.equal(updated.sites[0].pagination.template, "https://example.com/list/page/{page}");
  assert.equal(updated.sites[0].pagination.strategy, "path-template");

  await fs.rm(tmpDir, { recursive: true, force: true });
});
