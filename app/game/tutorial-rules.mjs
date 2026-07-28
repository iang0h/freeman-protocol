export const TUTORIAL_STEPS = Object.freeze([
  "move",
  "shoot",
  "recruit",
  "command",
  "observe",
  "complete",
  "skipped",
]);

const TRANSITIONS = Object.freeze({
  move: { "movement-complete": "shoot" },
  shoot: { "training-cleared": "recruit" },
  recruit: { "kairos-recruited": "command" },
  command: { "guard-selected": "observe" },
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

export function advanceTutorial(step, event) {
  return TRANSITIONS[step]?.[event] ?? step;
}

export function isTutorialProtected(step) {
  return step !== null && step !== "complete" && step !== "skipped";
}

export function canRetryFirstWave({ wave, tutorialResolved, checkpoint }) {
  return wave === 1 && tutorialResolved && checkpoint;
}
