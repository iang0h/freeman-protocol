export const EMP_BASE_DAMAGE = 32;
export const EMP_COOLDOWN_MS = 16000;
export const EMP_MAX_CHARGE = 100;

const EMP_UPGRADES = Object.freeze({
  efficiency: Object.freeze({
    id: "efficiency",
    label: "PULSE EFFICIENCY",
    cost: 90,
    cooldownMultiplier: 0.75,
  }),
  radius: Object.freeze({
    id: "radius",
    label: "PULSE RADIUS",
    cost: 80,
    radiusMultiplier: 1.25,
  }),
  bypass: Object.freeze({
    id: "bypass",
    label: "RESISTANCE BYPASS",
    cost: 110,
    resistanceBypass: 0.25,
  }),
});

const nonNegativeFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
};

const normalizeState = (state = {}) => {
  const maxCharge = nonNegativeFinite(state.maxCharge, EMP_MAX_CHARGE);
  const cooldownMs = nonNegativeFinite(state.cooldownMs, EMP_COOLDOWN_MS);
  const cooldownLeftMs = Math.min(
    cooldownMs,
    nonNegativeFinite(state.cooldownLeftMs),
  );
  const charge = cooldownLeftMs > 0
    ? 0
    : Math.min(maxCharge, nonNegativeFinite(state.charge));

  return { charge, maxCharge, cooldownLeftMs, cooldownMs };
};

export function createEmpState({
  cooldownMs = EMP_COOLDOWN_MS,
  maxCharge = EMP_MAX_CHARGE,
} = {}) {
  const normalizedCooldownMs = nonNegativeFinite(cooldownMs, EMP_COOLDOWN_MS);
  const normalizedMaxCharge = nonNegativeFinite(maxCharge, EMP_MAX_CHARGE);
  return {
    charge: normalizedMaxCharge,
    maxCharge: normalizedMaxCharge,
    cooldownLeftMs: 0,
    cooldownMs: normalizedCooldownMs,
  };
}

export function tickEmp(state, elapsedMs) {
  const current = normalizeState(state);
  const elapsed = nonNegativeFinite(elapsedMs);
  const cooldownLeftMs = Math.max(0, current.cooldownLeftMs - elapsed);
  return {
    ...current,
    cooldownLeftMs,
    charge: cooldownLeftMs === 0 ? current.maxCharge : 0,
  };
}

export function canFireEmp(state) {
  const current = normalizeState(state);
  return current.cooldownLeftMs === 0 && current.maxCharge > 0 && current.charge >= current.maxCharge;
}

export function fireEmp(state, {
  baseDamage = EMP_BASE_DAMAGE,
  damageMultiplier = 1,
  terrainMultiplier = 1,
} = {}) {
  const current = normalizeState(state);
  if (!canFireEmp(current)) return { state: current, damage: 0 };

  const damage = Math.round(
    nonNegativeFinite(baseDamage, EMP_BASE_DAMAGE) *
      nonNegativeFinite(damageMultiplier, 1) *
      nonNegativeFinite(terrainMultiplier, 1),
  );
  return {
    state: {
      ...current,
      charge: 0,
      cooldownLeftMs: current.cooldownMs,
    },
    damage,
  };
}

export function getEmpUpgrade(upgradeId) {
  const upgrade = EMP_UPGRADES[upgradeId];
  return upgrade ? { ...upgrade } : null;
}
