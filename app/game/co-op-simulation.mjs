import { canAffordMaterialCost, spendMaterialCost } from "./progression.mjs";
import { resolveArmoredDamage } from "./combat-rules.mjs";
import { createEmpState, fireEmp, tickEmp } from "./emp-rules.mjs";
import { applyLootPickup, canCollectLoot, rollLootDrop } from "./loot-rules.mjs";
import { chooseAutonomousNetworkAction, repairCore } from "./autonomous-network-rules.mjs";
import { PLAYER_RESERVE_BATCH_SIZE, canSpendTemporarySubAgent, clearSubAgents, spawnTemporarySubAgent, tickSubAgents } from "./autonomy-rules.mjs";
import { repairTurret } from "./repair-rules.mjs";
import { selectAutoSentryPosition } from "./sentry-placement.mjs";
import { tickWaveIntermission } from "./wave-rules.mjs";
import { WARBAND_SLOTS, canRecruitWarbandSlot, recruitWarbandSlot } from "./warband-rules.mjs";
import { getBossEncounter, tickBoss } from "./boss-rules.mjs";

export const SENTRY_BASE_COST = 80;
export const SENTRY_COST_STEP = 35;
export const SHOOT_DAMAGE = 10;
export const SHOOT_COOLDOWN_MS = 250;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const elapsed = (value) => Math.max(0, finite(value));
const actionError = (code, message) => ({ code, message });

function seededRandom(seed) {
  let value = 2_166_136_261;
  for (const character of String(seed ?? "")) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16_777_619);
  }
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function enemyHealth(enemy) {
  return Math.max(0, finite(enemy?.health, finite(enemy?.hp)));
}

function withEnemyHealth(enemy, health) {
  return "hp" in enemy && !("health" in enemy)
    ? { ...enemy, hp: health }
    : { ...enemy, health };
}

function lootForEnemy(enemy, state) {
  if (enemy?.loot && typeof enemy.loot === "object") {
    return {
      id: enemy.loot.id ?? `loot-${enemy.id}`,
      type: enemy.loot.type,
      value: enemy.loot.value,
      x: finite(enemy.x),
      y: finite(enemy.y ?? enemy.z),
    };
  }
  const dropped = rollLootDrop(enemy?.kind ?? enemy?.type, seededRandom(`${state.seed}:${enemy?.id}`));
  return dropped ? { ...dropped, x: finite(enemy.x), y: finite(enemy.y ?? enemy.z) } : null;
}

function damageEnemies(state, targetIds, damage, playerId) {
  const targets = new Set(targetIds);
  const defeated = [];
  const enemies = (state.enemies ?? []).reduce((next, enemy) => {
    if (!targets.has(enemy.id)) {
      next.push({ ...enemy });
      return next;
    }
    const resolved = resolveArmoredDamage(damage, {
      armored: enemy.armored === true,
      armorMultiplier: finite(enemy.armorMultiplier, 1),
      armorBreakReduction: finite(enemy.armorBreakReduction),
    });
    const nextHealth = Math.max(0, enemyHealth(enemy) - resolved);
    if (nextHealth === 0) {
      defeated.push(enemy);
      return next;
    }
    next.push(withEnemyHealth(enemy, nextHealth));
    return next;
  }, []);
  const loot = [...(state.loot ?? []), ...defeated.map((enemy) => lootForEnemy(enemy, state)).filter(Boolean)];
  const players = (state.players ?? []).map((player) => player.id === playerId
    ? { ...player, contribution: { ...(player.contribution ?? {}), kills: finite(player.contribution?.kills) + defeated.length } }
    : { ...player });
  return { ...state, enemies, loot, players };
}

function sharedResourcesAfterPickup(resources, core, loot) {
  const picked = applyLootPickup({
    health: core.health,
    maxHealth: core.maxHealth,
    components: resources.components,
    shards: resources.shards,
    repairKits: resources.repairKits,
  }, loot);
  return {
    core: { ...core, health: picked.health },
    resources: {
      ...resources,
      components: picked.components,
      shards: picked.shards ?? resources.shards,
      repairKits: picked.repairKits ?? resources.repairKits,
    },
  };
}

function collectVisibleLoot(state) {
  let resources = { ...state.resources };
  let core = { ...state.core };
  const collected = [];
  const remaining = [];
  for (const loot of state.loot ?? []) {
    const collector = (state.players ?? []).find((player) =>
      player.connected && canCollectLoot(player.operator, loot));
    if (!collector) {
      remaining.push({ ...loot });
      continue;
    }
    ({ resources, core } = sharedResourcesAfterPickup(resources, core, loot));
    collected.push({ loot, playerId: collector.id });
  }
  const players = (state.players ?? []).map((player) => {
    const amount = collected.filter((entry) => entry.playerId === player.id).length;
    return amount === 0 ? { ...player } : {
      ...player,
      contribution: { ...(player.contribution ?? {}), loot: finite(player.contribution?.loot) + amount },
    };
  });
  return { ...state, core, resources, loot: remaining, players };
}

function tickOperators(state, elapsedMs) {
  return (state.players ?? []).map((player) => {
    const operator = player.operator ?? {};
    const input = player.input ?? {};
    const distance = elapsedMs / 1_000 * 3;
    const length = Math.hypot(finite(input.moveX), finite(input.moveY));
    const scale = length > 1 ? 1 / length : 1;
    return {
      ...player,
      shootCooldownLeftMs: Math.max(0, finite(player.shootCooldownLeftMs) - elapsedMs),
      emp: tickEmp(player.emp ?? createEmpState(), elapsedMs),
      operator: {
        ...operator,
        x: finite(operator.x) + finite(input.moveX) * scale * distance,
        y: finite(operator.y) + finite(input.moveY) * scale * distance,
        aimX: finite(input.aimX, finite(operator.aimX)),
        aimY: finite(input.aimY, finite(operator.aimY, 1)),
      },
    };
  });
}

function tickEnemyPressure(state, elapsedMs) {
  const damage = (state.enemies ?? []).reduce((total, enemy) => total +
    Math.max(0, finite(enemy.coreDamage, 3)) * elapsedMs / Math.max(1, finite(enemy.attackIntervalMs, 1_000)), 0);
  const health = Math.max(0, state.core.health - damage);
  return { ...state, core: { ...state.core, health } };
}

function tickAutonomousNetwork(state, elapsedMs) {
  const clock = finite(state.autonomousElapsedMs) + elapsedMs;
  if (clock < 3_500) return { ...state, autonomousElapsedMs: clock, subAgents: tickSubAgents(state.subAgents ?? [], elapsedMs) };
  const action = chooseAutonomousNetworkAction({
    mode: state.phase === "playing" ? "playing" : "waiting",
    coreDamaged: state.core.health < state.core.maxHealth,
    components: state.resources.components,
    damagedAgent: false,
    repairKits: state.resources.repairKits,
    damagedTurret: (state.sentries ?? []).some((sentry) => sentry.health < sentry.maxHealth),
    defenses: (state.sentries ?? []).length,
    maxDefenses: 3,
    compute: state.resources.compute,
    defenseCost: SENTRY_BASE_COST + (state.sentries ?? []).length * SENTRY_COST_STEP,
    watchPriority: state.priority,
  });
  if (action === "repair-core") {
    const repaired = repairCore({ hp: state.core.health, maxHp: state.core.maxHealth }, state.resources.components);
    if (repaired.repaired) return {
      ...state,
      autonomousElapsedMs: 0,
      subAgents: tickSubAgents(state.subAgents ?? [], elapsedMs),
      core: { ...state.core, health: repaired.core.hp },
      resources: { ...state.resources, components: repaired.components },
    };
  }
  return { ...state, autonomousElapsedMs: 0, subAgents: tickSubAgents(state.subAgents ?? [], elapsedMs) };
}

function tickBossState(state, elapsedMs) {
  if (!state.boss?.scheduled) return state;
  const result = tickBoss(state.boss, elapsedMs, { enemyCapacity: 0, targets: state.sentries ?? [] });
  const reward = result.events.find((event) => event.type === "reward-drop");
  return {
    ...state,
    boss: result.boss,
    resources: reward ? {
      ...state.resources,
      compute: state.resources.compute + reward.rewards.compute,
      components: state.resources.components + reward.rewards.components,
      shards: state.resources.shards + reward.rewards.shards,
    } : { ...state.resources },
  };
}

export function applyCoOpAction(state, playerId, message) {
  const player = (state.players ?? []).find((entry) => entry.id === playerId);
  if (!player) return { state, error: actionError("UNKNOWN_PLAYER", "Player is not in this room") };
  if (state.phase !== "playing") return { state, error: actionError("ROOM_NOT_PLAYING", "The room has not started") };

  if (message.action === "shoot") {
    if (finite(player.shootCooldownLeftMs) > 0) return { state, error: actionError("ACTION_COOLDOWN", "Shoot is cooling down") };
    if (!message.targetId || !(state.enemies ?? []).some((enemy) => enemy.id === message.targetId)) return { state, error: actionError("INVALID_TARGET", "Target is not active") };
    const next = damageEnemies(state, [message.targetId], SHOOT_DAMAGE, playerId);
    return { state: { ...next, players: next.players.map((entry) => entry.id === playerId ? { ...entry, shootCooldownLeftMs: SHOOT_COOLDOWN_MS } : entry) }, error: null };
  }

  if (message.action === "emp") {
    const fired = fireEmp(player.emp ?? createEmpState());
    if (fired.damage === 0) return { state, error: actionError("ACTION_COOLDOWN", "EMP is charging") };
    const next = damageEnemies(state, (state.enemies ?? []).map((enemy) => enemy.id), fired.damage, playerId);
    return { state: { ...next, players: next.players.map((entry) => entry.id === playerId ? { ...entry, emp: fired.state } : entry) }, error: null };
  }

  if (message.action === "repair") {
    if (message.targetId === "core") {
      const repaired = repairCore({ hp: state.core.health, maxHp: state.core.maxHealth }, state.resources.components);
      if (!repaired.repaired) return { state, error: actionError("INVALID_REPAIR", "Core cannot be repaired") };
      return { state: { ...state, core: { ...state.core, health: repaired.core.hp }, resources: { ...state.resources, components: repaired.components } }, error: null };
    }
    const sentry = (state.sentries ?? []).find((entry) => entry.id === message.targetId);
    if (!sentry) return { state, error: actionError("INVALID_TARGET", "Repair target is not active") };
    const repaired = repairTurret({ ...sentry, hp: sentry.health, maxHp: sentry.maxHealth }, state.resources.components);
    if (repaired.components === state.resources.components) return { state, error: actionError("INVALID_REPAIR", "Sentry cannot be repaired") };
    return { state: { ...state, resources: { ...state.resources, components: repaired.components }, sentries: state.sentries.map((entry) => entry.id === sentry.id ? { ...entry, health: repaired.turret.hp } : { ...entry }) }, error: null };
  }

  if (message.action === "recruit") {
    if (!message.agentId || !WARBAND_SLOTS.some((slot) => slot.id === message.agentId)) return { state, error: actionError("INVALID_AGENT", "Agent is not recruitable") };
    const recruitment = { ...state.resources, warband: state.warband.agents };
    if (!canRecruitWarbandSlot(recruitment, message.agentId)) return { state, error: actionError("INSUFFICIENT_RESOURCES", "Shared resources cannot recruit this agent") };
    const next = recruitWarbandSlot(recruitment, message.agentId);
    return { state: { ...state, resources: { ...state.resources, compute: next.compute, components: next.components, shards: next.shards }, warband: { ...state.warband, agents: next.warband } }, error: null };
  }

  if (message.action === "build-sentry") {
    const cost = SENTRY_BASE_COST + (state.sentries ?? []).length * SENTRY_COST_STEP;
    const costRecord = { compute: cost, components: 0, shards: 0 };
    const position = selectAutoSentryPosition(state.sentries ?? [], state.blockers ?? []);
    if (!position) return { state, error: actionError("INVALID_POSITION", "No valid sentry position remains") };
    if (!canAffordMaterialCost(state.resources, costRecord)) return { state, error: actionError("INSUFFICIENT_RESOURCES", "Shared resources cannot build a sentry") };
    const spent = spendMaterialCost(state.resources, costRecord);
    const id = `sentry-${(state.sentries ?? []).length + 1}`;
    return { state: { ...state, resources: { ...state.resources, ...spent }, sentries: [...(state.sentries ?? []), { id, ...position, health: 100, maxHealth: 100, repairCost: 1, repairAmount: 25 }] }, error: null };
  }

  if (message.action === "deploy-reserve") {
    if (!canSpendTemporarySubAgent(state.resources)) return { state, error: actionError("INSUFFICIENT_RESOURCES", "A reserve needs components and shards") };
    const parent = { id: message.agentId ?? playerId, role: "defend" };
    const subAgents = [...(state.subAgents ?? [])];
    const materials = { components: state.resources.components, shards: state.resources.shards };
    for (let index = 0; index < PLAYER_RESERVE_BATCH_SIZE; index += 1) {
      const spawned = spawnTemporarySubAgent(parent, { wavePressure: 1, materials, subAgents });
      if (!spawned) break;
      subAgents.push(spawned);
    }
    if (subAgents.length === (state.subAgents ?? []).length) return { state, error: actionError("INVALID_RESERVE", "No reserve can be deployed") };
    return { state: { ...state, resources: { ...state.resources, components: materials.components, shards: materials.shards }, subAgents }, error: null };
  }

  return { state, error: actionError("INVALID_ACTION", "Unsupported action") };
}

export function tickCoOpSimulation(state, elapsedMs) {
  const duration = elapsed(elapsedMs);
  if (state.phase !== "playing" || duration === 0) return { ...state };
  let next = { ...state, players: tickOperators(state, duration) };
  if (next.wave.status === "intermission") {
    const remaining = tickWaveIntermission(next.wave.intermissionRemainingMs ?? 3_000, duration);
    if (remaining > 0) return { ...next, wave: { ...next.wave, elapsedMs: next.wave.elapsedMs + duration, intermissionRemainingMs: remaining } };
    const number = next.wave.number + 1;
    const boss = getBossEncounter(number, next.seed, next.warband.agents.length);
    return { ...next, wave: { number, status: "playing", elapsedMs: 0 }, boss: boss.scheduled ? boss : null, subAgents: clearSubAgents() };
  }
  next = tickEnemyPressure(next, duration);
  next = tickAutonomousNetwork(next, duration);
  next = tickBossState(next, duration);
  next = collectVisibleLoot(next);
  const wave = { ...next.wave, elapsedMs: next.wave.elapsedMs + duration };
  if (next.core.health <= 0) return { ...next, phase: "ended", result: "defeat", wave: { ...wave, status: "ended" } };
  if ((next.enemies ?? []).length === 0) return { ...next, wave: { ...wave, status: "intermission", intermissionRemainingMs: 3_000 } };
  return { ...next, wave };
}
