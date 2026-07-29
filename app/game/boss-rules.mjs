export const BOSS_CAPS = Object.freeze({
  maxHealth: 1_600,
  maxMovementSpeed: 0.72,
  maxAttacksPerSecond: 0.34,
  maxRewardQuantity: 8,
  maxReinforcements: 6,
});

export const BOSS_REWARD_RATIONALE =
  "Warboss caches include field reserves so autonomous agents can improvise while your warband keeps growing.";

const PRE_FINAL_MATERIAL_REWARDS = Object.freeze({
  3: Object.freeze({ components: 4, shards: 3 }),
  4: Object.freeze({ components: 4, shards: 3 }),
  5: Object.freeze({ components: 4, shards: 3 }),
  6: Object.freeze({ components: 5, shards: 3 }),
  7: Object.freeze({ components: 5, shards: 3 }),
});

const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function normalizeWave(wave) {
  return clamp(Math.trunc(finite(Number(wave), 1)), 1, 99);
}

function seedValue(seed) {
  const text = String(seed ?? "");
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function getBossEncounter(wave, seed) {
  const normalizedWave = normalizeWave(wave);
  const seeded = seedValue(seed);
  const scheduled = normalizedWave >= 3;
  const intensity = seeded % 5;
  const maxHp = scheduled
    ? Math.min(
        BOSS_CAPS.maxHealth,
        640 + (normalizedWave - 3) * 125 + intensity * 20,
      )
    : 0;
  const attackIntervalMs = scheduled
    ? Math.max(3_000, 4_100 - (normalizedWave - 3) * 110 - intensity * 20)
    : 4_100;
  const movementSpeed = scheduled
    ? Math.min(
        BOSS_CAPS.maxMovementSpeed,
        Number((0.38 + (normalizedWave - 3) * 0.025 + intensity * 0.005).toFixed(3)),
      )
    : 0;
  const preFinalRewards = PRE_FINAL_MATERIAL_REWARDS[normalizedWave];
  const components = scheduled
    ? preFinalRewards?.components ??
      Math.min(5, 2 + Math.floor((normalizedWave - 2) / 2))
    : 0;
  const shards = scheduled
    ? preFinalRewards?.shards ??
      Math.min(3, 1 + Math.floor((normalizedWave - 1) / 3))
    : 0;
  const rewardQuantity = Math.min(
    BOSS_CAPS.maxRewardQuantity,
    components + shards,
  );
  const reinforcementCap = scheduled
    ? Math.min(
        BOSS_CAPS.maxReinforcements,
        2 + Math.floor((normalizedWave - 3) / 2),
      )
    : 0;

  return {
    id: `warboss-${normalizedWave}-${seeded.toString(36)}`,
    kind: "warboss",
    label: normalizedWave >= 8 ? "ROOTKIT PRIME" : "ARMORED WARLORD",
    wave: normalizedWave,
    scheduled,
    count: scheduled ? 1 : 0,
    maxActive: 1,
    hp: maxHp,
    maxHp,
    armored: true,
    armorReduction: Math.min(0.68, 0.48 + (normalizedWave - 3) * 0.02),
    movementSpeed,
    attackIntervalMs,
    attacksPerSecond: Number((1_000 / attackIntervalMs).toFixed(3)),
    attackCooldownLeftMs: Math.min(1_500, attackIntervalMs),
    telegraphMs: Math.max(1_300, 1_650 - (normalizedWave - 3) * 25),
    telegraphLeftMs: 0,
    attackDamage: Math.min(42, 22 + (normalizedWave - 3) * 3),
    attackRadius: Math.min(3.8, 2.4 + (normalizedWave - 3) * 0.18),
    pendingTargetId: null,
    pendingTargetKind: null,
    attackCount: 0,
    reinforcementCap,
    reinforcementsSpawned: 0,
    reinforcementTriggered: false,
    rewards: {
      compute: Math.min(180, 70 + normalizedWave * 12),
      components,
      shards,
    },
    rewardQuantity,
    rewardClaimed: false,
  };
}

export function getBossArmorMultiplier(boss, armorBroken = false) {
  if (!boss?.armored || armorBroken) return 1;
  return 1 - clamp(finite(boss.armorReduction), 0, 0.95);
}

function activeTargets(context) {
  return (Array.isArray(context?.targets) ? context.targets : [])
    .filter(
      (target) =>
        (target?.kind === "agent" || target?.kind === "turret") &&
        finite(target?.hp ?? target?.health) > 0,
    )
    .sort((left, right) => {
      const leftDistance = Math.hypot(finite(left.x), finite(left.z ?? left.y));
      const rightDistance = Math.hypot(finite(right.x), finite(right.z ?? right.y));
      return (
        leftDistance - rightDistance ||
        String(left.kind).localeCompare(String(right.kind)) ||
        String(left.id).localeCompare(String(right.id))
      );
    });
}

function selectTarget(boss, context) {
  const targets = activeTargets(context);
  if (targets.length === 0) return null;
  return targets[Math.max(0, Math.trunc(finite(boss.attackCount))) % targets.length];
}

function rewardEvent(boss) {
  return {
    type: "reward-drop",
    bossId: boss.id,
    rewards: { ...boss.rewards },
    quantity: boss.rewardQuantity,
  };
}

export function tickBoss(boss, elapsedMs, context = {}) {
  const next = { ...boss, rewards: { ...(boss?.rewards ?? {}) } };
  const events = [];
  if (!next.scheduled) return { boss: next, events };
  const elapsed = clamp(finite(elapsedMs), 0, 60_000);

  if (finite(next.hp) <= 0) {
    if (!next.rewardClaimed) {
      next.rewardClaimed = true;
      events.push(rewardEvent(next));
    }
    return { boss: next, events };
  }

  const healthRatio = finite(next.maxHp) > 0
    ? finite(next.hp) / finite(next.maxHp)
    : 0;
  if (
    healthRatio <= 0.5 &&
    !next.reinforcementTriggered &&
    next.reinforcementsSpawned < next.reinforcementCap
  ) {
    const enemyCapacity = Math.max(
      0,
      Math.trunc(finite(context.enemyCapacity, next.reinforcementCap)),
    );
    const count = Math.min(
      next.reinforcementCap - next.reinforcementsSpawned,
      enemyCapacity,
    );
    if (count > 0) {
      next.reinforcementsSpawned += count;
      next.reinforcementTriggered = true;
      events.push({
        type: "reinforcement",
        bossId: next.id,
        count,
        cap: next.reinforcementCap,
      });
    }
  }

  if (next.telegraphLeftMs > 0) {
    next.telegraphLeftMs = Math.max(0, next.telegraphLeftMs - elapsed);
    if (next.telegraphLeftMs === 0 && next.pendingTargetId !== null) {
      events.push({
        type: "damage",
        bossId: next.id,
        targetId: next.pendingTargetId,
        targetKind: next.pendingTargetKind,
        amount: next.attackDamage,
      });
      next.pendingTargetId = null;
      next.pendingTargetKind = null;
      next.attackCount = Math.max(0, Math.trunc(finite(next.attackCount))) + 1;
      next.attackCooldownLeftMs = next.attackIntervalMs;
    }
    return { boss: next, events };
  }

  next.attackCooldownLeftMs = Math.max(
    0,
    finite(next.attackCooldownLeftMs) - elapsed,
  );
  if (next.attackCooldownLeftMs > 0) return { boss: next, events };

  const target = selectTarget(next, context);
  if (!target) return { boss: next, events };
  next.pendingTargetId = target.id;
  next.pendingTargetKind = target.kind;
  next.telegraphLeftMs = next.telegraphMs;
  events.push({
    type: "telegraph",
    bossId: next.id,
    targetId: target.id,
    targetKind: target.kind,
    durationMs: next.telegraphMs,
    radius: next.attackRadius,
  });
  return { boss: next, events };
}
