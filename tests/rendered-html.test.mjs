import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("catalog source defines the living network sections and reusable cards", async () => {
  const [catalog, styles] = await Promise.all([
    readFile(new URL("../app/asset-catalog/AssetCatalog.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/asset-catalog/AssetCatalog.module.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(catalog, /const agentEntries/);
  assert.match(catalog, /const threatEntries/);
  assert.match(catalog, /const lootEntries/);
  assert.match(catalog, /function SignalBadge/);
  assert.match(catalog, /function AgentPortraitCard/);
  assert.match(catalog, /function LootCard/);
  assert.match(catalog, />Live Agents</);
  assert.match(catalog, />Threat Archive</);
  assert.match(catalog, />Field Components</);
  assert.match(styles, /--loot-cyan:\s*#83d7df/);
  assert.match(styles, /--loot-amber:\s*#d8a14b/);
  assert.match(styles, /--loot-violet:\s*#a78bfa/);
});

test("renders the living network catalog route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("catalog", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/asset-catalog", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Live Agents/);
  assert.match(html, /Threat Archive/);
  assert.match(html, /Field Components/);
});
