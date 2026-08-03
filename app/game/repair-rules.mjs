export const DEFAULT_DISABLED_MS = 3_000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function maxHealth(unit) {
  return Math.max(0, finite(unit?.maxHp ?? unit?.maxHealth));
}

function health(unit) {
  return Math.min(maxHealth(unit), Math.max(0, finite(unit?.hp ?? unit?.health)));
}

function disabledMs(unit) {
  return Math.max(0, finite(unit?.disabledLeftMs));
}

function withHealth(unit, nextHealth) {
  const next = { ...unit };
  if ("health" in unit && !("hp" in unit)) next.health = nextHealth;
  else next.hp = nextHealth;
  return next;
}

function functioningSeparateBay(bay) {
  return Boolean(
    bay &&
      bay.isSeparate === true &&
      bay.operational !== false &&
      health(bay) > 0,
  );
}

export function applyUnitDamage(unit, amount) {
  const damage = Math.max(0, finite(amount));
  const nextHealth = Math.max(0, health(unit) - damage);
  const next = withHealth(unit, nextHealth);
  const priorDisabled = disabledMs(unit);
  const disableDuration = Math.max(0, finite(unit?.disableMs, DEFAULT_DISABLED_MS));
  next.disabledLeftMs = nextHealth === 0
    ? Math.max(priorDisabled, disableDuration)
    : priorDisabled;
  return next;
}

export function getRepairDecision(unit, context = {}) {
  const maximum = maxHealth(unit);
  const ratio = maximum > 0 ? health(unit) / maximum : 0;
  const threshold = Math.min(1, Math.max(0, finite(unit?.repairThreshold, 0.4)));
  const returnRatio = Math.max(threshold, Math.min(1, finite(unit?.returnHealthRatio, 0.8)));

  if (ratio >= returnRatio) return "return";
  if (unit?.repairDecision === "repair" || unit?.repairDecision === "retreat") {
    return functioningSeparateBay(context.repairBay)
      ? "repair"
      : "retreat";
  }
  if (ratio > threshold) return "fight";
  if (functioningSeparateBay(context.repairBay)) return "repair";
  return "retreat";
}

// A destroyed repair bay still produces a truthful "retreat" decision, but it
// cannot be a useful movement destination. Callers that know the bay state can
// use this helper to release a surviving agent back to its normal role target.
// Omitting the bay preserves the original action-gate semantics for callers
// that only need to evaluate a unit in isolation.
export function shouldWithdrawToRepairBay(repairDecision, repairBay) {
  const bayOnline = repairBay === undefined
    ? true
    : functioningSeparateBay(repairBay);
  return (
    (repairDecision === "repair" || repairDecision === "retreat") &&
    bayOnline
  );
}

export function getAgentActionState(unit, context = {}) {
  const repairDecision = unit?.repairDecision ?? "fight";
  const withdrawing = shouldWithdrawToRepairBay(
    repairDecision,
    context.repairBay,
  );
  return {
    withdrawing,
    canAct:
      health(unit) > 0 &&
      disabledMs(unit) === 0 &&
      !withdrawing,
  };
}

export function tickRepairBay(bay, units, elapsedMs) {
  const elapsed = Math.max(0, finite(elapsedMs));
  const canRepair = functioningSeparateBay(bay);
  const repairPerSecond = Math.max(0, finite(bay?.repairPerSecond, 18));
  const repairAmount = canRepair ? repairPerSecond * (elapsed / 1_000) : 0;
  const repairedUnits = (Array.isArray(units) ? units : []).map((unit) => {
    const timer = Math.max(0, disabledMs(unit) - elapsed);
    // A repair intent alone is not enough: the unit must have reached the
    // separate bay and explicitly be in its repairing state. This keeps the
    // autonomous retreat path from healing units while they are still in the
    // field (and is shared by both renderers).
    const eligible = unit?.atRepairBay === true && unit?.repairing === true;
    const nextHealth = canRepair && eligible && timer === 0
      ? Math.min(maxHealth(unit), health(unit) + repairAmount)
      : health(unit);
    return {
      ...withHealth(unit, nextHealth),
      disabledLeftMs: timer,
    };
  });
  return { bay: { ...bay }, units: repairedUnits };
}

export function resolveMitigatedDamage(damage, armorProfile = {}) {
  const base = Math.max(0, finite(damage));
  const multiplier = Number.isFinite(armorProfile?.damageMultiplier)
    ? Math.min(1, Math.max(0, armorProfile.damageMultiplier))
    : 1;
  return base * multiplier;
}

// Descriptive alias for callers that deal damage specifically to agents.
export const resolveAgentDamage = resolveMitigatedDamage;

export function repairTurret(turret, components) {
  const available = Math.max(0, Math.floor(finite(components)));
  const repairCost = Math.max(1, Math.floor(finite(turret?.repairCost, 1)));
  if (available < repairCost || health(turret) >= maxHealth(turret)) {
    return { turret: { ...turret }, components: available };
  }
  const amount = Math.max(0, finite(turret?.repairAmount, maxHealth(turret) * 0.25));
  return {
    turret: withHealth(turret, Math.min(maxHealth(turret), health(turret) + amount)),
    components: available - repairCost,
  };
}

export function findHostileProjectileHit(projectile, targets) {
  const projectileX = finite(projectile?.x);
  const projectileZ = finite(projectile?.z);
  const projectileRadius = Math.max(0, finite(projectile?.radius));
  const candidates = (Array.isArray(targets) ? targets : [])
    .filter((target) => finite(target?.hp ?? target?.health) > 0)
    .map((target) => ({
      target,
      distance: Math.hypot(
        projectileX - finite(target?.x),
        projectileZ - finite(target?.z),
      ),
      radius: Math.max(0, finite(target?.radius)),
    }))
    .filter((candidate) => candidate.distance <= projectileRadius + candidate.radius)
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.target ?? null;
}
