export const AGENT_VISUAL_IDS = Object.freeze([
  "kairos",
  "kira",
  "forge",
  "covenant",
  "relay",
  "scout",
  "warden",
  "nova",
]);

const makeVisual = (id, roleLabel, fallbackClass, accent) =>
  Object.freeze({
    portraitSrc: `/asset-catalog/agents/${id}.webp`,
    roleLabel,
    fallbackClass,
    accent,
  });

export const AGENT_VISUALS = Object.freeze({
  kairos: makeVisual("kairos", "TIME CONTROL", "is-temporal", "#e86b3a"),
  kira: makeVisual("kira", "PRECISION", "is-precision", "#9ec4c9"),
  forge: makeVisual("forge", "ASSAULT", "is-assault", "#d7a640"),
  covenant: makeVisual("covenant", "REPAIR", "is-repair", "#f0eee8"),
  relay: makeVisual("relay", "RESOURCE", "is-resource", "#58bfc8"),
  scout: makeVisual("scout", "MOBILE", "is-mobile", "#9bd13b"),
  warden: makeVisual("warden", "CORE GUARD", "is-guard", "#a99ee8"),
  nova: makeVisual("nova", "BOSS ASSAULT", "is-boss", "#db4b83"),
});

export function getAgentVisual(agentId) {
  return AGENT_VISUALS[agentId] ?? null;
}
