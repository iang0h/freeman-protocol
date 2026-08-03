const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const position = (entity) => ({
  x: finite(entity?.x),
  z: finite(entity?.z ?? entity?.y),
});

const normalizeEntity = (entity, index, defaults = {}) =>
  Object.freeze({
    id: String(entity?.id ?? `${defaults.kind ?? "entity"}-${index + 1}`),
    kind: String(entity?.kind ?? defaults.kind ?? "entity"),
    hp: Math.max(0, finite(entity?.hp ?? entity?.health)),
    maxHp: Math.max(0, finite(entity?.maxHp ?? entity?.maxHealth)),
    ...position(entity),
    state: String(entity?.state ?? defaults.state ?? "active"),
    value: Math.max(0, finite(entity?.value)),
    parentId: entity?.parentId == null ? null : String(entity.parentId),
    remainingMs: Math.max(0, finite(entity?.remainingMs)),
  });

const normalizeArray = (items, defaults) =>
  Object.freeze((Array.isArray(items) ? items : []).map((item, index) =>
    normalizeEntity(item, index, defaults),
  ));

const normalizeResources = (resources = {}) =>
  Object.freeze({
    compute: Math.max(0, Math.floor(finite(resources.compute))),
    components: Math.max(0, Math.floor(finite(resources.components))),
    shards: Math.max(0, Math.floor(finite(resources.shards))),
  });

const normalizeLandmark = (landmark, fallback = {}) =>
  Object.freeze({
    hp: Math.max(0, finite(landmark?.hp ?? landmark?.health)),
    maxHp: Math.max(0, finite(landmark?.maxHp ?? landmark?.maxHealth)),
    ...position({ ...fallback, ...landmark }),
  });

export function createSimulationView(input = {}) {
  const view = {
    wave: Math.max(1, Math.min(8, Math.trunc(finite(input.wave, 1)))),
    resources: normalizeResources(input.resources),
    core: normalizeLandmark(input.core),
    operator: normalizeLandmark(input.operator),
    agents: normalizeArray(input.agents, { kind: "agent", state: "active" }),
    enemies: normalizeArray(input.enemies, { kind: "threat", state: "alive" }),
    pickups: normalizeArray(input.pickups, { kind: "loot", state: "available" }),
    sentries: normalizeArray(input.sentries, { kind: "sentry", state: "active" }),
    subAgents: normalizeArray(input.subAgents, { kind: "sub-agent", state: "active" }),
    boss: input.boss ? normalizeEntity(input.boss, 0, { kind: "boss", state: "alive" }) : null,
  };
  return Object.freeze(view);
}
