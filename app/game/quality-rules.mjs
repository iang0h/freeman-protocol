export const QUALITY_ORDER = Object.freeze(["low", "medium", "high"]);

export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    pixelRatioCap: 1,
    robotAnimationStride: 3,
    maxCombatEffects: 36,
    shadowMapSize: 0,
    bloom: false,
    grade: "neutral",
    distantDressing: false,
    simulationScale: 1,
  }),
  medium: Object.freeze({
    pixelRatioCap: 1.5,
    robotAnimationStride: 2,
    maxCombatEffects: 64,
    shadowMapSize: 512,
    bloom: false,
    grade: "balanced",
    distantDressing: true,
    simulationScale: 1,
  }),
  high: Object.freeze({
    pixelRatioCap: 2,
    robotAnimationStride: 1,
    maxCombatEffects: 96,
    shadowMapSize: 1024,
    bloom: true,
    grade: "cinematic",
    distantDressing: true,
    simulationScale: 1,
  }),
});

const clampIndex = (index) =>
  Math.max(0, Math.min(QUALITY_ORDER.length - 1, index));

const normalizeProfile = (profile) =>
  QUALITY_ORDER.includes(profile) ? profile : "medium";

export function selectQualityPreset({
  touch = false,
  deviceMemory = 4,
  hardwareConcurrency = 4,
} = {}) {
  if (touch || deviceMemory <= 2 || hardwareConcurrency <= 2) return "low";
  if (deviceMemory >= 8 && hardwareConcurrency >= 8) return "high";
  return "medium";
}

export function getQualitySettings(profile) {
  return QUALITY_PRESETS[normalizeProfile(profile)];
}

export function createQualityMonitor(profile = "medium") {
  return Object.freeze({ profile: normalizeProfile(profile), overBudgetFrames: 0 });
}

export function tickQualityMonitor(state, frameMs) {
  const current = normalizeProfile(state?.profile);
  const overBudget = Number(frameMs) > 33.34;
  const overBudgetFrames = overBudget
    ? (Number(state?.overBudgetFrames) || 0) + 1
    : 0;
  const index = QUALITY_ORDER.indexOf(current);
  const shouldDowngrade = overBudgetFrames >= 30 && index > 0;
  return Object.freeze({
    profile: shouldDowngrade
      ? QUALITY_ORDER[clampIndex(index - 1)]
      : current,
    overBudgetFrames: shouldDowngrade ? 0 : overBudgetFrames,
  });
}
