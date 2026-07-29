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
  assert.match(catalog, /const armorEntries/);
  assert.match(catalog, /const terrainSignals/);
  assert.match(catalog, /function SignalBadge/);
  assert.match(catalog, /function AgentPortraitCard/);
  assert.match(catalog, /function LootCard/);
  assert.match(catalog, />Live Agents</);
  assert.match(catalog, />Threat Archive</);
  assert.match(catalog, />Field Components</);
  assert.match(catalog, />Armor Profiles</);
  assert.match(catalog, />Elite Recovery</);
  assert.match(catalog, />Terrain Signals</);
  assert.match(styles, /--loot-cyan:\s*#83d7df/);
  assert.match(styles, /--loot-amber:\s*#d8a14b/);
  assert.match(styles, /--loot-violet:\s*#a78bfa/);
  assert.match(styles, /\.progressionGrid/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("HUD source surfaces the progression and encounter telemetry from both engines", async () => {
  const game = await readFile(
    new URL("../app/FreemanProtocol.tsx", import.meta.url),
    "utf8",
  );

  for (const label of [
    "LOOT INVENTORY",
    "ARMOR PROFILE",
    "AGENT RANKS",
    "TEMP SUB-AGENTS",
    "TERRAIN SIGNAL",
    "EMP RESISTANCE",
  ]) {
    assert.match(game, new RegExp(label));
  }
  for (const field of ["temporarySubAgents", "terrainLabel", "empResistance"]) {
    assert.ok((game.match(new RegExp(`${field}:`, "g")) ?? []).length >= 3);
  }
  assert.match(game, /className="progression-telemetry"/);
  assert.match(game, /prefers-reduced-motion: reduce/);
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
  assert.match(html, /Armor Profiles/);
  assert.match(html, /Elite Recovery/);
  assert.match(html, /Terrain Signals/);
});
