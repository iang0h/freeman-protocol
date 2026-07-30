import assert from "node:assert/strict";
import test from "node:test";
import { getCommanderObjective } from "../app/game/objective-director.mjs";

const base = {
  core: 180,
  maxCore: 180,
  offlineAgents: 0,
  repairBayOnline: true,
  canRecruit: false,
  canBuild: false,
  workshopActive: false,
  placingDefense: false,
};

test("protects the Core before every other commander action", () => {
  assert.equal(
    getCommanderObjective({ ...base, core: 60 }).id,
    "protect-core",
  );
});

test("prioritizes repairing an offline agent after the Core is safe", () => {
  assert.equal(
    getCommanderObjective({ ...base, offlineAgents: 1 }).id,
    "repair-agent",
  );
});

test("walks the commander through recruit, build, and workshop actions", () => {
  assert.equal(getCommanderObjective({ ...base, canRecruit: true }).id, "recruit-agent");
  assert.equal(getCommanderObjective({ ...base, canBuild: true }).id, "build-sentry");
  assert.equal(
    getCommanderObjective({ ...base, workshopActive: true }).id,
    "upgrade-network",
  );
});

test("falls back to defending the Core when no management action is urgent", () => {
  const objective = getCommanderObjective(base);
  assert.deepEqual(objective, {
    id: "defend-core",
    label: "DEFEND THE CORE",
    detail: "Your agents are fighting automatically. Watch the network and intervene when needed.",
    action: "defend",
  });
});
