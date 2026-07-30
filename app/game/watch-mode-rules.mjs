export const WATCH_PRIORITIES = ["survive", "farm", "expand"];
export const WATCH_SPEEDS = [1, 2, 4];
export const WATCH_STARTER_AGENT_COUNT = 4;
export const WATCH_STARTER_SENTRY_COUNT = 1;
export const WATCH_COMPONENT_SALVAGE_PER_WAVE = 3;
export const WATCH_INCOMING_DAMAGE_MULTIPLIER = 0.8;
export const WATCH_INTERMISSION_CORE_REPAIR = 18;
export const WATCH_REWARD_CAPS = {
  compute: 2_500,
  components: 120,
  shards: 80,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createWatchState() {
  return {
    paused: false,
    speed: 1,
    priority: "survive",
    survivalMs: 0,
    sessionIncome: { compute: 0, components: 0, shards: 0 },
    lastEvent: "NETWORK STANDING BY",
    visible: true,
  };
}

export function setWatchSpeed(state, speed) {
  const numeric = Number(speed);
  const nearest = WATCH_SPEEDS.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best,
  WATCH_SPEEDS[0]);
  return { ...state, speed: nearest };
}

export function setWatchPriority(state, priority) {
  const next = WATCH_PRIORITIES.includes(priority) ? priority : state.priority;
  return { ...state, priority: next };
}

export function pauseForVisibility(state, hidden) {
  const visible = !hidden;
  return {
    ...state,
    visible,
    paused: hidden ? true : state.paused,
    lastEvent: hidden ? "RUN PAUSED — RETURN TO RESUME" : state.lastEvent,
  };
}

export function tickWatchState(state, deltaMs, { visible = state.visible } = {}) {
  if (state.paused || !visible) return { ...state, visible };
  const delta = clamp(Number(deltaMs) || 0, 0, 250);
  return {
    ...state,
    visible: true,
    survivalMs: state.survivalMs + delta * state.speed,
  };
}

export function creditWatchWaveReward(state, reward = {}) {
  const income = { ...state.sessionIncome };
  for (const key of Object.keys(WATCH_REWARD_CAPS)) {
    const amount = Math.max(0, Math.floor(Number(reward[key]) || 0));
    income[key] = clamp(income[key] + amount, 0, WATCH_REWARD_CAPS[key]);
  }
  return {
    ...state,
    sessionIncome: income,
    lastEvent: "WAVE REWARDS CREDITED",
  };
}

export function isWatchMode(mode) {
  return mode === "watch";
}
