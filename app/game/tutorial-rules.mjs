export const TUTORIAL_STEPS = Object.freeze([
  "move",
  "shoot",
  "recruit",
  "observe",
  "complete",
  "skipped",
]);

const TRANSITIONS = Object.freeze({
  move: { "movement-complete": "shoot" },
  shoot: { "training-cleared": "recruit" },
  recruit: { "kairos-recruited": "observe" },
  observe: { "breach-cleared": "complete" },
  complete: {},
  skipped: {},
});

export const FIRST_WAVE = Object.freeze({
  initial: Object.freeze([
    "virus", "virus", "virus", "virus",
    "virus", "virus", "virus", "virus",
    "phisher",
  ]),
  reinforcement: Object.freeze(["virus", "virus", "virus"]),
  reinforcementDelay: 9,
  damageMultiplier: 0.72,
});

export const OBSERVE_BREACH = Object.freeze([
  Object.freeze({ type: "virus", x: -3, z: -3.2, speed: 0.85, damage: 3, reward: 8 }),
  Object.freeze({ type: "virus", x: 0, z: -4.2, speed: 0.85, damage: 3, reward: 8 }),
  Object.freeze({ type: "virus", x: 3, z: -3.2, speed: 0.85, damage: 3, reward: 8 }),
  Object.freeze({ type: "virus", x: -1.4, z: -5.1, speed: 0.85, damage: 3, reward: 8 }),
  Object.freeze({ type: "virus", x: 1.4, z: -5.1, speed: 0.85, damage: 3, reward: 8 }),
]);

export function advanceTutorial(step, event) {
  return TRANSITIONS[step]?.[event] ?? step;
}

export function canPerformTutorialAction(step, action) {
  if (!isTutorialProtected(step)) return true;
  if (action.startsWith("recruit-")) {
    return step === "recruit" && action === "recruit-kairos";
  }
  return true;
}

export function isTutorialProtected(step) {
  return step !== null && step !== "complete" && step !== "skipped";
}

export function canRetryFirstWave({ wave, tutorialResolved, checkpoint }) {
  return wave === 1 && tutorialResolved && checkpoint;
}
