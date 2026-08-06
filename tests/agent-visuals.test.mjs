import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_VISUAL_IDS,
  AGENT_VISUALS,
  getAgentVisual,
} from "../app/game/agent-presentation-rules.mjs";

test("agent visual catalog covers every recruit slot without numeric identity", () => {
  assert.deepEqual(AGENT_VISUAL_IDS, [
    "kairos",
    "kira",
    "forge",
    "covenant",
    "relay",
    "scout",
    "warden",
    "nova",
  ]);

  for (const id of AGENT_VISUAL_IDS) {
    const visual = AGENT_VISUALS[id];
    assert.match(
      visual.portraitSrc,
      new RegExp(`/asset-catalog/agents/${id}\\.webp$`),
    );
    assert.ok(visual.roleLabel.length > 0);
    assert.ok(visual.fallbackClass.length > 0);
    assert.match(visual.accent, /^#[0-9a-f]{6}$/i);
  }

  assert.equal(
    new Set(Object.values(AGENT_VISUALS).map((visual) => visual.fallbackClass))
      .size,
    8,
  );
  assert.equal(getAgentVisual("unknown"), null);
});
