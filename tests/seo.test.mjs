import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8").catch(() => "");
const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8").catch(() => "");

test("crawler endpoints expose the canonical public routes", () => {
  assert.match(robots, /freeman\.skillrivals\.com/);
  assert.match(robots, /sitemap\.xml/);
  assert.match(robots, /allow:\s*["']?\/["']?/i);
  assert.match(sitemap, /freeman\.skillrivals\.com/);
  assert.match(sitemap, /asset-catalog/);
});

test("root metadata declares the canonical game identity", () => {
  assert.match(layout, /metadataBase/);
  assert.match(layout, /freeman\.skillrivals\.com/);
  assert.match(layout, /alternates/);
  assert.match(layout, /canonical/);
  assert.match(layout, /VideoGame/);
  assert.match(layout, /VideoObject/);
  assert.match(layout, /thumbnailUrl/);
  assert.match(layout, /contentUrl/);
  assert.match(layout, /duration/);
  assert.match(layout, /WebSite/);
  assert.match(layout, /applicationCategory/);
  assert.match(layout, /GameApplication/);
});
