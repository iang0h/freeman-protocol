# Freeman Protocol: Progression and Escalation Design

## Goal

Make loot readable and collectible, give the player and recruited agents meaningful RPG progression, make temporary sub-agents combat-capable, and let enemy hackers scale their counter-play against EMP Overdrive. Preserve the approachable first wave while creating a foundation for later terrain and base-building.

## Scope

This pass covers four connected systems:

1. Physical loot presentation and inventory feedback.
2. Hybrid progression: wave draft choices plus component-funded upgrades.
3. Real temporary sub-agent behavior.
4. Data-driven enemy resistance and terrain modifiers.

Full authored terrain art and a base-building screen are future content, but the runtime model should expose map modifiers without renderer-specific rewrites.

## Player-facing behavior

### Loot

Every drop is a visible world pickup with a distinct silhouette, emissive color, landing motion, pulse, pickup sound, floating label, and HUD count. Repair Cells are cyan, Sentry Modules orange, and Protocol Shards violet. Elite drops may add Armor Plates, Weapon Cores, and Agent Memory Chips. Collection uses the existing walk-over interaction with a small magnet radius and remains readable on touch screens.

### Hybrid progression

After a wave, the player sees three draft cards: one player option, one agent option, and one defense/economy option. Components persist during the mission and are spent on deeper upgrades. Component costs and benefits are explicit in the upgrade/evolution UI; invalid purchases leave both inventory and Compute unchanged.

Agents retain distinct identities:

- Kairos: slow, stasis, and timing-window upgrades.
- Kira: marks, critical hits, and execution upgrades.
- Forge: splash, suppression, and armor-break upgrades.
- Covenant: healing, shields, and Core-repair upgrades.

The player chooses an armor profile: Vanguard (survivability), Striker (movement and weapon output), or Relay (EMP/support efficiency). Profiles are mutually exclusive for a mission and visibly affect HUD stats.

### Temporary sub-agents

When an agent improvises, it may spawn one bounded temporary sub-agent. The child inherits a simplified role: assault attacks nearby threats, support repairs/buffs, and defense intercepts near the Core. Children display a lifetime/health cue, can contribute to combat or recovery, never recursively spawn, and expire cleanly at their lifetime or wave transition.

### Hacker escalation

Wave one remains forgiving. Later waves progressively introduce counter-play: signal shields reduce EMP damage, Phishers create decoys, Trojans gain temporary armor, Rootkits reboot nearby threats, and jammer zones reduce EMP reliability. Resistance states are visible before EMP resolves. Enemy modifiers are shared between WebGL and Canvas engines.

### Terrain foundation

Encounter definitions gain optional terrain modifiers: Relay Storm, Firewall Lanes, Data Fog, and Split Breach. The first mission uses none; later checkpoints can activate one modifier at a time. Modifiers affect spawn/routing/visibility/EMP rules without requiring new map art in this pass.

## Architecture

- Keep pure rules in focused modules for loot visuals/types, progression costs, sub-agent behavior, hacker modifiers, and terrain modifiers.
- Keep WebGL and Canvas as consumers of the same rule outputs.
- Reuse pooled WebGL resources for pickup meshes and temporary minion visuals.
- Route persistence through the existing safe storage helpers; mission inventory may reset on defeat unless explicitly promoted later.
- Keep accessibility labels and non-visual HUD feedback for all pickups and resistance states.

## Acceptance criteria

- A player can clearly identify and walk over every common loot type on both renderers and mobile.
- Components and shards have observable gameplay effects and are consumed atomically by upgrades/evolutions.
- Each agent has at least one component-funded identity upgrade, and each armor profile changes player stats.
- Temporary sub-agents visibly attack, support, or defend according to inherited role and expire/reset without leaks.
- EMP damage is reduced or redirected by later hacker modifiers while wave one remains unchanged.
- Terrain modifiers are deterministic, tested, and consumed identically by both renderers.
- Existing tutorial, mobile input, cleanup, catalog, and full regression behavior remains intact.
