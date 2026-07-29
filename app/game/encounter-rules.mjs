const MAX_WAVE = 8;

const EMPTY_FLAGS = Object.freeze({
  virus: Object.freeze([]),
  phisher: Object.freeze([]),
  trojan: Object.freeze([]),
  rootkit: Object.freeze([]),
});

const TERRAIN_SEQUENCE = Object.freeze([
  Object.freeze({
    id: "relay-storm",
    label: "RELAY STORM",
    color: "#9ed8dd",
    empMultiplier: 1.15,
    targetingRangeMultiplier: 1,
    routeBias: 0.08,
    spawnAngleOffset: 0.18,
  }),
  Object.freeze({
    id: "firewall-lanes",
    label: "FIREWALL LANES",
    color: "#f08a4b",
    empMultiplier: 0.95,
    targetingRangeMultiplier: 1,
    routeBias: 0.28,
    spawnAngleOffset: 0.45,
  }),
  Object.freeze({
    id: "data-fog",
    label: "DATA FOG",
    color: "#a999c7",
    empMultiplier: 0.85,
    targetingRangeMultiplier: 0.72,
    routeBias: 0.12,
    spawnAngleOffset: -0.2,
  }),
  Object.freeze({
    id: "split-breach",
    label: "SPLIT BREACH",
    color: "#d9793f",
    empMultiplier: 0.9,
    targetingRangeMultiplier: 0.9,
    routeBias: -0.3,
    spawnAngleOffset: 0.78,
  }),
]);

const NO_TERRAIN = Object.freeze({
  id: "none",
  label: "CLEAR GRID",
  color: "#6f8c8d",
  empMultiplier: 1,
  targetingRangeMultiplier: 1,
  routeBias: 0,
  spawnAngleOffset: 0,
});

const normalizeWave = (wave) => {
  const numeric = Number.isFinite(Number(wave)) ? Math.trunc(Number(wave)) : 1;
  return Math.max(1, Math.min(MAX_WAVE, numeric));
};

const bounded = (value, maximum) =>
  Math.min(maximum, Math.max(0, Number(value.toFixed(3))));

export function getWaveModifiers(wave) {
  const normalizedWave = normalizeWave(wave);
  if (normalizedWave === 1) {
    return {
      wave: 1,
      resistance: {
        shieldReduction: 0,
        decoyReduction: 0,
        armorReduction: 0,
        jammerReduction: 0,
      },
      flagsByType: {
        virus: [...EMPTY_FLAGS.virus],
        phisher: [...EMPTY_FLAGS.phisher],
        trojan: [...EMPTY_FLAGS.trojan],
        rootkit: [...EMPTY_FLAGS.rootkit],
      },
    };
  }

  return {
    wave: normalizedWave,
    resistance: {
      shieldReduction: bounded(0.1 + (normalizedWave - 2) * 0.05, 0.35),
      decoyReduction:
        normalizedWave >= 3
          ? bounded(0.3 + (normalizedWave - 3) * 0.08, 0.7)
          : 0,
      armorReduction:
        normalizedWave >= 4
          ? bounded(0.24 + (normalizedWave - 4) * 0.055, 0.45)
          : 0,
      jammerReduction:
        normalizedWave >= 5
          ? bounded(0.12 + (normalizedWave - 5) * 0.06, 0.3)
          : 0,
    },
    flagsByType: {
      virus: ["shield"],
      phisher: [
        ...(normalizedWave >= 3 ? ["decoy"] : []),
        ...(normalizedWave >= 5 ? ["jammer"] : []),
      ],
      trojan: [
        "shield",
        ...(normalizedWave >= 4 ? ["armor"] : []),
      ],
      rootkit: [
        "shield",
        ...(normalizedWave >= 5 ? ["jammer"] : []),
      ],
    },
  };
}

export function getTerrainModifier(wave) {
  const normalizedWave = normalizeWave(wave);
  if (normalizedWave === 1) return { ...NO_TERRAIN };
  return {
    ...TERRAIN_SEQUENCE[(normalizedWave - 2) % TERRAIN_SEQUENCE.length],
  };
}

export function resolveEmpDamage(baseDamage, target, modifiers) {
  const damage = Math.max(0, Number(baseDamage) || 0);
  if (!modifiers || modifiers.wave <= 1) return damage;

  const flags = new Set(
    Array.isArray(target?.resistanceFlags) ? target.resistanceFlags : [],
  );
  const resistance = modifiers.resistance ?? {};
  let resolved = damage;
  if (flags.has("shield")) {
    resolved *= 1 - (resistance.shieldReduction ?? 0);
  }
  if (flags.has("decoy")) {
    resolved *= 1 - (resistance.decoyReduction ?? 0);
  }
  if (flags.has("armor")) {
    resolved *= 1 - (resistance.armorReduction ?? 0);
  }
  if (flags.has("jammer")) {
    resolved *= 1 - (resistance.jammerReduction ?? 0);
  }
  return Math.round(Math.max(0, resolved));
}
