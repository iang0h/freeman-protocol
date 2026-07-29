const freezeSkill = (skill) => Object.freeze({
  ...skill,
  targetKinds: Object.freeze([...skill.targetKinds]),
});

export const AGENT_SKILLS = Object.freeze({
  kairos: freezeSkill({
    id: "time-fracture",
    agentId: "kairos",
    label: "TIME FRACTURE",
    cooldownMs: 12_000,
    targetKinds: ["enemy"],
  }),
  kira: freezeSkill({
    id: "mark-execution",
    agentId: "kira",
    label: "MARK / EXECUTION",
    cooldownMs: 10_000,
    targetKinds: ["enemy"],
  }),
  forge: freezeSkill({
    id: "armor-break-burst",
    agentId: "forge",
    label: "ARMOR BREAK",
    cooldownMs: 9_000,
    targetKinds: ["enemy"],
  }),
  covenant: freezeSkill({
    id: "repair-barrier",
    agentId: "covenant",
    label: "REPAIR / BARRIER",
    cooldownMs: 14_000,
    targetKinds: ["agent", "turret", "repair-bay"],
  }),
});

const SKILLS_BY_ID = Object.freeze(
  Object.fromEntries(
    Object.values(AGENT_SKILLS).map((skill) => [skill.id, skill]),
  ),
);

const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const health = (unit) => finite(unit?.hp ?? unit?.health);

export function getSlowMovementMultiplier(slowLeftMs, slowMultiplier = 0.48) {
  if (finite(slowLeftMs) <= 0) return 1;
  return Math.min(1, Math.max(0.1, finite(slowMultiplier, 0.48)));
}

function cooldownLeft(agent, skillId) {
  return Math.max(0, finite(agent?.skillCooldowns?.[skillId]));
}

export function canUseSkill(agent, skillId, context = {}) {
  const skill = SKILLS_BY_ID[skillId];
  const target = context.target;
  return Boolean(
    skill &&
      agent?.id === skill.agentId &&
      health(agent) > 0 &&
      Math.max(0, finite(agent?.disabledLeftMs)) === 0 &&
      cooldownLeft(agent, skillId) === 0 &&
      target &&
      health(target) > 0 &&
      skill.targetKinds.includes(target.kind),
  );
}

function skillEffects(skillId, target) {
  if (skillId === "time-fracture") {
    return [{
      type: "time-fracture",
      targetId: target.id,
      radius: 3.5,
      slowMultiplier: 0.35,
      durationMs: 4_000,
    }];
  }
  if (skillId === "mark-execution") {
    const maximum = Math.max(1, finite(target.maxHp ?? target.maxHealth, 1));
    const executes = health(target) / maximum <= 0.25;
    return [
      {
        type: "mark",
        targetId: target.id,
        durationMs: 5_000,
        damageMultiplier: 1.5,
      },
      {
        type: "damage",
        targetId: target.id,
        amount: executes ? 96 : 48,
        executes,
      },
    ];
  }
  if (skillId === "armor-break-burst") {
    return [
      {
        type: "armor-break",
        targetId: target.id,
        armorReduction: 0.55,
        durationMs: 6_000,
      },
      {
        type: "suppressive-burst",
        targetId: target.id,
        radius: 2.75,
        damage: 24,
        slowMs: 2_000,
        slowMultiplier: 0.62,
      },
    ];
  }
  return [
    { type: "repair", targetId: target.id, amount: 30 },
    {
      type: "barrier",
      targetId: target.id,
      amount: 36,
      durationMs: 5_000,
    },
  ];
}

export function useSkill(agent, skillId, context = {}) {
  if (!canUseSkill(agent, skillId, context)) {
    return { agent, effects: [] };
  }
  const skill = SKILLS_BY_ID[skillId];
  return {
    agent: {
      ...agent,
      skillCooldowns: {
        ...(agent.skillCooldowns ?? {}),
        [skillId]: skill.cooldownMs,
      },
    },
    effects: skillEffects(skillId, context.target),
  };
}
