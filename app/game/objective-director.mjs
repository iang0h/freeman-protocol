const OBJECTIVES = Object.freeze({
  protect: Object.freeze({
    id: "protect-core",
    label: "PROTECT THE CORE",
    detail: "The Core is under pressure. Move your agents back and clear the breach.",
    action: "defend",
  }),
  repair: Object.freeze({
    id: "repair-agent",
    label: "REPAIR YOUR NETWORK",
    detail: "An agent is offline. Use a field kit or send them to a repair bay.",
    action: "repair",
  }),
  recruit: Object.freeze({
    id: "recruit-agent",
    label: "RECRUIT AN AI AGENT",
    detail: "Spend Compute and materials to expand your autonomous warband.",
    action: "recruit",
  }),
  build: Object.freeze({
    id: "build-sentry",
    label: "BUILD A SENTRY",
    detail: "Add another automated defender to cover the Core perimeter.",
    action: "build",
  }),
  upgrade: Object.freeze({
    id: "upgrade-network",
    label: "UPGRADE THE NETWORK",
    detail: "Choose an upgrade before the next breach arrives.",
    action: "upgrade",
  }),
  defend: Object.freeze({
    id: "defend-core",
    label: "DEFEND THE CORE",
    detail: "Your agents are fighting automatically. Watch the network and intervene when needed.",
    action: "defend",
  }),
});

export function getCommanderObjective({
  core,
  maxCore,
  offlineAgents,
  repairBayOnline = true,
  canRecruit,
  canBuild,
  workshopActive,
  placingDefense = false,
}) {
  const coreRatio = maxCore > 0 ? core / maxCore : 0;
  if (coreRatio <= 0.5) return OBJECTIVES.protect;
  if (placingDefense) return OBJECTIVES.build;
  if (offlineAgents > 0 || !repairBayOnline) return OBJECTIVES.repair;
  if (canRecruit) return OBJECTIVES.recruit;
  if (canBuild) return OBJECTIVES.build;
  if (workshopActive) return OBJECTIVES.upgrade;
  return OBJECTIVES.defend;
}
