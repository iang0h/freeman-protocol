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
  if (ratio > threshold) return "fight";
  if (functioningSeparateBay(context.repairBay)) return "repair";
  if (finite(context.fieldKits) > 0) return "repair";
  return "retreat";
}

export function tickRepairBay(bay, units, elapsedMs) {
  const elapsed = Math.max(0, finite(elapsedMs));
  const canRepair = functioningSeparateBay(bay);
  const repairPerSecond = Math.max(0, finite(bay?.repairPerSecond, 18));
  const repairAmount = canRepair ? repairPerSecond * (elapsed / 1_000) : 0;
  const repairedUnits = (Array.isArray(units) ? units : []).map((unit) => {
    const timer = Math.max(0, disabledMs(unit) - elapsed);
    const eligible = unit?.repairDecision === "repair" || unit?.repairing === true;
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
