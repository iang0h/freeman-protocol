# Freeman Protocol: Visual Warband and Wave Stability

## Status

Approved design for implementation on 2026-08-06.

## Goal

Make the recruit screen immediately understandable without relying on numeric troop markers, and keep every wave visibly active through the late-game pressure spikes. The player should recognize an agent by silhouette and role, understand the next useful action at a glance, and see agents and temporary sub-agents produce purposeful movement and combat instead of orbiting or idling.

## Scope

### 1. Generated agent portraits

Generate eight coherent, square, low-poly chest-up portraits with ImageGen. Each portrait has the same crop and lighting language, a dark neutral background, no text, and a distinct role cue:

- Kairos: temporal ring and ice visor;
- Kira: precision scope and heavy marksman armor;
- Forge: rotary assault armor and muzzle glow;
- Covenant: luminous repair shield/halo;
- Relay: relay antenna and resource pack;
- Scout: lightweight visor and fast-movement silhouette;
- Warden: broad core shield and defensive plating;
- Nova: magenta star-core boss-assault armor.

Store the generated UI-only assets under `public/asset-catalog/agents/`. Add a presentation map keyed by the eight existing `AgentId` values. The map contains the static source path, accent color, and CSS fallback role class. Generated images are not loaded by the Three.js or Canvas combat engines, so a missing asset cannot prevent boot.

### 2. Visual-first recruit and command UI

Replace the visible numeric diamond in recruit cards with a portrait tile containing the accent ring, state dot, and accessible agent name. Keep the `1–8` keyboard shortcut as a small corner hint, but never use it as the unit identity.

The default card hierarchy is:

1. portrait;
2. short agent name;
3. one role icon/badge;
4. concise status (`READY`, `FIGHT`, `GATHER`, `REPAIR`, or `OFFLINE`);
5. compact resource chips for compute, components, and shards.

Damage, cooldown, range, armor, and full status explanations remain available through `title`, focus descriptions, and `aria-describedby`, but are removed from the default desktop/mobile layout. Resource chips use consistent icons and color, and the affordable state is communicated by color plus a check icon rather than a sentence.

Reuse the same portrait presentation in the recruitment advisor, skill tray, co-op world markers, and command-map agent markers. Preserve existing callbacks, card order, agent IDs, health bars, skill cooldown rings, co-op labels, and keyboard behavior. The co-op and world markers hide persistent text labels by default and expose the name through tooltip/ARIA.

Squad orders and player actions become icon-first controls with short labels and tooltips: follow, guard, focus, recruit, build, repair, and deploy. The control still has a visible text label at normal desktop size; on compact/mobile layouts the icon is the primary cue and the label is reduced to one word. Touch targets remain at least 44px.

### 3. Boss convergence and enemy stall recovery

The late-wave stall is caused by assault/improvise agents orbiting a boss at a radius larger than the boss's attack stop radius. The boss then follows the moving ring indefinitely, leaving `enemies.length` nonzero and blocking wave completion.

Change both WebGL and Canvas agent anchoring so an assault/improvise orbit around a boss is clamped inside that boss's effective stop radius, with a small safety margin. The behavior remains visually distributed but gives the boss a reachable target. Non-boss agent behavior and squad commands retain their current roles.

Add a shared pure movement helper/watchdog used by both renderers:

- preserve a small terrain lane bias when an enemy is far from its target;
- fade that bias near the target so radial progress always wins;
- track target identity and radial distance over time;
- if an enemy makes negligible radial progress for the safety interval, force a direct convergence vector and reset its route state;
- reset the watchdog when the target changes, the enemy is telegraphed, or the enemy is disabled.

The fallback must not teleport enemies or bypass their attack range. It only guarantees that a live threat eventually reaches a valid target and that a completed wave can reach intermission.

### 4. Cinematic temporary sub-agent bursts

Keep the existing four-sub-agent-per-parent limit, material cost, lifetime upgrades, and wave-transition cleanup. Replace the current edge-triggered `improvise` spawn gate with a bounded cadence:

- while the parent is under its existing role pressure threshold and has an available child slot, it may attempt a spawn after a short cooldown;
- each child still costs one component and one shard;
- the parent may never exceed four active children;
- enforce a global cinematic cap across all parents to protect mobile performance;
- when a child expires, the parent becomes eligible again after the cooldown;
- no child can spawn another child.

The spawn action emits a ring/burst, a concise activity-log event, and a small HUD toast. Children receive visible role-colored markers and perform their existing attack, repair, or guard actions. In Watch Mode, cadence is slightly more eager when the selected priority is `EXPAND` or `FARM`, but resource availability and the global cap remain authoritative. In campaign mode, the same pressure thresholds apply so the mechanic is useful without filling the arena on wave one.

### 5. Performance and fallback requirements

Use one shared portrait image per visible agent ID and lazy/deferred decoding where supported. Keep procedural 3D combat geometry unchanged. Reuse pooled temporary-sub-agent markers and existing effect pools; do not create an unbounded object per spawn. Canvas receives the same decisions, statuses, and portrait fallback classes, while its combat actors remain procedural 2D shapes.

## Data flow and interfaces

1. Add a presentation-only `AGENT_VISUALS` map and a small `AgentPortrait` render helper; do not alter `AGENTS` or `WARBAND_SLOTS` gameplay data.
2. Add a pure movement/stall helper in `app/game/` that accepts numeric positions, target identity, elapsed time, route bias, and prior watchdog state, and returns a normalized movement vector plus the next watchdog state.
3. Add a pure sub-agent cadence helper that accepts parent pressure, active children, materials, elapsed time, and the global cap, and returns whether a spawn may be attempted plus the next cooldown state.
4. Both renderers consume the helpers and continue to own Three.js/Canvas positions, pools, effects, and callbacks.
5. React renders portrait and compact control state from existing HUD/engine state; it does not read renderer internals.

## Accessibility and responsive behavior

- Portraits have meaningful alt text when informative and `aria-hidden` when the surrounding button already names the agent.
- Every recruit/action/order target keeps a visible focus state and a minimum 44px touch area.
- Mobile hides secondary metrics and long descriptions rather than shrinking them below readable sizes.
- Keyboard shortcuts remain available on desktop, but never serve as the only discoverable action.
- Portrait load failure falls back to an accent-colored role glyph and never disables recruitment.
- Reduced-motion mode suppresses spawn burst scale animation while preserving the status/event cue.

## Testing and verification

- Add unit tests for complete portrait-map coverage and fallback metadata for all eight agents.
- Add source/UI contract tests confirming numeric markers are not the visible identity and portraits are used by roster, advisor, skills, co-op markers, and command map.
- Add responsive contract tests for compact cards, role/status chips, and 44px controls.
- Add movement tests proving terrain bias fades near a target, stalled enemies switch to direct convergence, and target changes reset the watchdog.
- Add a regression test proving a boss can be reached by assault agents and a wave can transition after the boss dies.
- Add sub-agent cadence tests for cooldown, material cost, four-per-parent limit, global cap, expiry re-eligibility, and no child chaining.
- Run the full Node test suite, production type/build checks, lint/source contracts, and a browser smoke pass for desktop Warband, mobile Warband, WebGL, Canvas fallback, Watch Mode wave 4–5, and asset-catalog image loading.

## Non-goals

- No changes to agent costs, role definitions, wave rewards, or the eight-wave campaign structure.
- No online multiplayer synchronization changes.
- No runtime dependency on generated portrait images or a model-conversion service.
- No unlimited sub-agent spawning or persistent sub-agent army between waves.
