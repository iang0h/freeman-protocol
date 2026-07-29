# Freeman Protocol: Warbands and EMP Discipline

## Goal

Make EMP a deliberate emergency tool and deepen the warband loop: recruit up to eight persistent agents, let agents gather materials and construct bounded temporary sub-agents, make agents and turrets damageable, and introduce slow epic boss fights that reward the resources needed for late-roster growth.

## Player-facing behavior

### EMP

EMP Overdrive has a visible charge meter and a materially longer cooldown. Base pulse damage is lower; upgrades improve efficiency, radius, or resistance bypass rather than allowing repeated clears. Later hackers can resist, interrupt, redirect, or occupy EMP with jammer zones. Wave one remains readable and survivable.

### Warband

The roster expands from four to eight agents. Slots 1–4 retain approachable costs; slots 5–8 require escalating Compute, Components, and Protocol Shards. Every persistent agent has health, armor, role skills, repair threshold, and a retreat state. Agents autonomously return to the repair bay when badly damaged and resume when repaired. They can collect nearby materials when safe, contributing to the economy without direct commands.

### Temporary sub-agents

Each recruited agent can construct up to four temporary sub-agents. Construction consumes collected materials. A child lasts 10 seconds by default and 15–20 seconds with upgrades, inherits its parent role, shows a lifetime/health cue, and cannot recursively spawn. Children are cleared on expiry, wave transition, defeat, retry, and disposal.

### Damage and repair

Enemies can damage persistent agents and turrets. The Core remains a protected objective and is not a healing station. Agents repair at a separate repair bay, use field repair materials, or withdraw temporarily. Turrets can be repaired with Components or repair drones. If the repair bay is destroyed, agents must use field kits or remain withdrawn until it is rebuilt.

### Skills

Each agent has active/passive skills with cooldowns and role identity:

- Kairos: time fracture, stasis field, emergency rewind.
- Kira: mark, execution shot, cloak reposition.
- Forge: armor break, suppressive barrage, breach charge.
- Covenant: repair beam, barrier relay, rescue protocol.

New agents may specialize in scouting, resource collection, crowd control, or anti-boss work. Skills are visible in the warband UI and have deterministic cooldown/effect rules.

### Boss escalation

Later rounds can add one slow, heavily armored warboss alongside normal threats. Boss attacks are telegraphed, can damage agents and turrets, and drop rare materials required for slots 5–8 and advanced skills. Recruiting stronger agents increases boss intensity within bounded encounter limits.

## Architecture

- Add pure rules for EMP cooldown/damage, eight-slot recruitment costs, agent health/repair/material behavior, sub-agent construction budgets, skills, and boss encounters.
- Keep WebGL and Canvas consuming identical state transitions and encounter outputs.
- Pool temporary child and repair-bay visuals; dispose all resources on every lifecycle boundary.
- Keep the Core health model separate from repair-bay and agent health.
- Route mission inventory through safe storage/state helpers; purchases must be atomic and conserve Compute/Components/Shards.

## Acceptance criteria

- EMP cannot be fired again until its visible cooldown/charge is ready; wave one is still approachable.
- Both engines support eight recruitment slots with escalating, atomic costs.
- Agents collect materials, can be damaged, retreat to repair, and return; turrets can be damaged and repaired.
- Each agent can construct at most four non-recursive children; default lifetime is 10 seconds and upgrades reach 15–20 seconds.
- At least four role skills are implemented with cooldowns and shared WebGL/Canvas effects.
- Later encounters can include slow warbosses with telegraphed attacks and rare material rewards.
- The Core remains protect-only and can still be destroyed while agents repair.
- Existing loot, progression, terrain, tutorial, mobile, cleanup, catalog, and regression behavior remains intact.
