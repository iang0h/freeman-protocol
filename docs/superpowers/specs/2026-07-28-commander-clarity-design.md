# Freeman Protocol: Commander Clarity

## Purpose

This release should preserve Freeman Protocol's current cyber-defense identity while fixing late-wave slowdown and making its strategy systems easier to understand. It adds automatic sentry deployment, meaningful agent evolutions, clearer player upgrades, and a shuffled soundtrack using the supplied MP3 masters.

The release is successful when:

- late encounters remain responsive with the full squad and three sentries;
- GPU resource counts return toward their baseline as temporary objects expire;
- building a sentry requires one click by default;
- every agent has two understandable, mutually exclusive evolution paths;
- the player can see which personal and squad upgrades are active;
- all three music tracks play in a non-repeating shuffled rotation; and
- desktop, touch, WebGL, and Canvas-fallback play remain functional.

## Scope

### Included

- WebGL and Canvas-fallback performance improvements.
- Automatic sentry placement with manual placement retained.
- One evolution choice for each of the four existing agents.
- A between-wave squad-upgrade step funded with Compute.
- Clearer player-upgrade descriptions and stack indicators.
- Streaming background music, shuffle, crossfades, volume controls, and persisted preferences.
- Automated gameplay-system tests and late-wave profiling hooks.

### Excluded

- Additional recruitable characters.
- A squad-size or loadout limit.
- Sentry archetypes or sentry evolution trees.
- New maps, missions, enemies, bosses, or save-game progression.
- Multiplayer, accounts, leaderboards, or backend storage.

## Architecture

The current engine implementations remain in place: `FreemanEngine` is the primary Three.js renderer and `FreemanCanvasEngine` is the fallback. Rules that both engines need must move into small renderer-independent modules rather than being duplicated inside the two engines.

The new boundaries are:

- **Combat pacing:** owns encounter queues, active-enemy limits, and reinforcement release.
- **Sentry placement:** generates valid candidates and selects the highest-coverage location.
- **Agent progression:** defines evolutions, prices, exclusivity, and combat modifiers.
- **Audio manager:** owns music playback, procedural sound effects, buses, preferences, and lifecycle.
- **Three.js resource lifecycle:** owns shared resources and cleanup/pooling of temporary render objects.

The React component remains responsible for menus and HUD state. It should not perform per-frame simulation work.

## Performance Foundation

### Enemy rendering

Enemy point lights are removed. Their glow remains visible through emissive materials, rings, and the existing arena lighting. Geometry and immutable materials are shared by enemy type where practical. When a material must change per enemy, only that material is cloned.

The directional shadow remains, but small enemies do not cast shadows by default. The operator, Core, agents, sentries, and boss may retain shadows if profiling shows the frame budget can support them.

### Combat pacing

Encounter totals remain unchanged so late waves do not lose difficulty or rewards. Enemies beyond the active budget wait in a spawn queue.

- WebGL target: at most 36 ordinary active enemies, plus the boss and boss-phase summons.
- Canvas fallback target: at most 28 ordinary active enemies, plus the boss and boss-phase summons.
- A queued enemy is released when an active enemy dies or when the active count is below the budget.
- Releases are paced in groups of at most four, at least 0.75 seconds apart, so enemies do not appear in one frame.
- A wave completes only after the active list, reinforcement schedule, and spawn queue are empty.

The HUD enemy count represents all remaining threats: active enemies plus queued and scheduled enemies. This prevents a misleading count when pacing is active.

### Resource lifecycle

Every dynamic object has one cleanup path. Cleanup removes it from the scene and releases owned geometry, materials, textures, audio listeners, and animation resources exactly once.

Shared geometry and materials are reference-owned by caches and are not disposed by individual enemies. Projectiles and common effects use small object pools. Pool capacity is bounded; excess objects are disposed.

`clearDynamic()`, death, expiry, restart, renderer disposal, and failed model loading use the same cleanup primitives. Removed resources must remain reachable until cleanup has completed.

### Frame-loop costs

A uniform spatial grid indexes active enemies by arena cell. Agents, sentries, projectiles, melee attacks, and aim assistance query nearby cells instead of scanning the full enemy list.

Frequently used vectors, arrays, and candidate records are reused. Frame loops do not create spread copies solely to make mutation safe; removal is handled through reverse iteration or deferred removal queues.

Procedural noise buffers are cached by cue instead of being generated on every hit. Simultaneous sound-effect voices have a conservative cap.

### Adaptive quality

The engine records a rolling frame-time average for diagnostics and adaptive quality. If average frame time remains above 22 ms for two seconds, it halves cosmetic particle counts and reduces pixel ratio by 0.1, down to a floor of 1.0. If average frame time remains below 17 ms for five seconds, it restores one quality step. Quality changes have a five-second cooldown to prevent oscillation.

This is a fallback mechanism, not the primary performance fix.

## Automatic Sentry Deployment

The base panel exposes:

- **AUTO-DEPLOY SENTRY** as the primary action; and
- **PLACE MANUALLY** as the secondary action.

Both actions use the existing cost progression and three-sentry maximum.

### Automatic placement

The placement system samples deterministic candidates on two rings around the Core. It rejects candidates outside the current legal annulus or too close to an existing sentry.

Each valid candidate receives a score based on:

- minimum distance from existing sentries;
- angular coverage of an uncovered approach sector;
- useful distance from the Core;
- overlap with existing sentry firing ranges; and
- immediate obstruction by the player, Core, or active enemies.

The highest-scoring candidate is selected. Ties use a stable clockwise ordering, making tests and repeated play predictable.

The game briefly displays the chosen position and firing range, then spends Compute and builds the sentry. If no valid candidate exists, no Compute is spent and the player receives a clear explanation.

### Manual placement

Manual placement preserves the current pointer/touch ghost. It adds a visible legal placement band and an 8.5-unit firing-range preview. The game runs at reduced simulation speed during placement, but the UI and pointer remain responsive. Cancelling never spends Compute.

## Agent Evolution

The recruitable roster remains Kairos, Kira, Forge, and Covenant. Each recruited agent begins at rank one and may purchase exactly one of two evolutions. Evolution is permanent for the current run and cannot be stacked or switched.

### Kairos

- **Cryo Mesh — 70 Compute:** the slow jumps to the two nearest enemies within 2.5 units at 70% of its normal duration.
- **Stasis Lock — 70 Compute:** three hits within five seconds freeze a non-boss elite for 1.2 seconds. Bosses receive a 45% slow for the same duration instead. The trigger has a five-second per-target cooldown.

### Kira

- **Execution Protocol — 90 Compute:** Kira independently prioritizes bosses, Trojans, and high-health targets and deals 35% bonus damage to elites below 40% health.
- **Rail Pierce — 90 Compute:** projectiles continue through two additional targets, dealing 70% and 45% of the original damage.

### Forge

- **Cluster Burst — 110 Compute:** impact deals 45% damage to enemies within 1.8 units, fulfilling Forge's crowd-clear role.
- **Suppression Loop — 110 Compute:** consecutive hits on one target reduce Forge's attack interval by 8% per hit, up to 32%. Changing targets resets the bonus. At maximum stacks the target's attack interval increases by 20% for two seconds.

### Covenant

- **Aegis Relay — 130 Compute:** every eight seconds the player receives a 20-damage shield and the Core receives a 30-damage shield. A new shield replaces the remaining value rather than stacking.
- **Nanite Repair — 130 Compute:** each support pulse repairs 18 player health and 16 Core health and reduces every recruited agent's disabled timer by 1.5 seconds.

Evolution values are balance constants covered by tests. A full-run economy simulation verifies that at least two evolutions are affordable in an ordinary successful run without making all four automatic purchases.

Agent cards show role, damage, attack interval, range, utility, current rank, and chosen evolution. Role copy must describe actual targeting and effects.

## Between-Wave Progression

Wave completion becomes a two-step planning screen:

1. Select one free player/team upgrade from the existing three-card draft.
2. Optionally spend Compute on one available agent evolution, or continue without buying one.

The second step appears only when at least one recruited agent has not evolved. It never blocks continuing.

The player-upgrade system retains its existing six concepts but:

- displays acquired stack counts;
- uses accurate outcome descriptions;
- distinguishes player, Core, squad, and economy effects;
- calculates attack-rate improvements from actual attacks per second; and
- caps Power Shots, Stronger Defense, Faster AI Team, EMP Overdrive, and Squad Command at two stacks;
- changes Faster AI Team to 15% shorter attack intervals per stack and labels the resulting attacks-per-second increase accurately;
- changes EMP Overdrive to 50% additional damage per stack;
- changes Squad Command to 25% additional agent damage per stack; and
- leaves Field Repair uncapped because it has no permanent multiplicative effect.

Upgrade choices remain deterministic for testability. A capped upgrade is removed from later drafts and replaced by the next uncapped upgrade in rotation, preventing dead choices and repeated access to one dominant option.

## Music and Sound

The supplied MP3 files become:

- `public/audio/freeman-protocol.mp3`
- `public/audio/freeman-core-2.mp3`
- `public/audio/freeman-core-3.mp3`

Embedded cover-art streams and unnecessary metadata are stripped without re-encoding the audio. The original files in Downloads remain untouched.

### Playback

The audio manager uses two streaming `HTMLAudioElement` players connected to Web Audio gain nodes. It loads the active track and preloads only the next track.

A Fisher-Yates shuffle bag plays all three tracks once before reshuffling. The last track of one bag cannot be the first track of the next bag. A new run does not always force the same opening track.

Tracks crossfade over approximately four seconds. `ended` remains a fallback when duration metadata or timers are unreliable.

The mission-start gesture resumes the audio context and starts music. Rejected playback leaves the existing audio control available for a second user gesture.

### Mixing and preferences

Music and procedural effects use separate gain buses feeding a master gain and conservative compressor. Major cues may briefly duck music, but ordinary shots do not.

The controls expose:

- master mute;
- music volume; and
- effects volume.

Values are persisted in `localStorage`. Volume uses a perceptual curve. Pausing the mission pauses music; hiding the tab suspends or pauses audio and resumes only if it was previously playing. Disposal pauses media, removes listeners, disconnects nodes, and closes the context.

## User Interface

The existing visual language remains unchanged. New controls use the same typography, border, copper, and cyan treatment.

Desktop and touch layouts must support:

- the primary and secondary sentry actions without covering combat controls;
- agent statistics and evolution state;
- the optional between-wave evolution step;
- music and effects sliders inside the controls dialog; and
- readable feedback when auto-placement, evolution, or audio playback fails.

Keyboard support remains:

- `B` auto-deploys a sentry;
- `Shift+B` enters or cancels manual placement;
- number keys recruit agents; and
- all new planning-screen choices are reachable by keyboard and visible focus.

## Error Handling

- Insufficient Compute never changes placement or evolution state.
- Failed auto-placement never spends Compute.
- A missing or failed music track is skipped; gameplay and procedural sound effects continue.
- If Web Audio is unavailable, music falls back to direct media-element playback and mute controls still work.
- If WebGL is unavailable, the Canvas engine uses the same combat pacing, sentry, progression, and playlist rules.
- Pool exhaustion creates or disposes a bounded overflow object rather than dropping gameplay-critical projectiles.
- Model-loading failures keep the existing built-in visual fallback.

## Testing and Verification

Pure game rules are extracted into importable modules and tested with the repository's Node test runner.

Required automated coverage:

- shuffle bags include every track once and prevent boundary repeats;
- auto-placement returns valid, deterministic, well-spaced positions;
- failed placement does not spend Compute;
- active-enemy budgets are never exceeded and queued counts reach zero;
- waves cannot finish while queued or scheduled enemies remain;
- each agent accepts one evolution and rejects the competing path;
- upgrade stack labels match applied mathematics;
- dynamic object cleanup is idempotent;
- WebGL and Canvas HUD counts include queued threats;
- existing rendered-HTML and mobile-layout tests remain green.

Required manual verification:

- play or accelerated-simulate waves 1 and 7 with four agents and three sentries;
- compare frame time, render calls, lights, and renderer memory before and after;
- restart repeatedly and confirm geometry/texture counts return near baseline;
- verify keyboard, mouse, and touch sentry flows;
- verify every evolution's visible and mechanical effect;
- let the playlist cross two track boundaries and one reshuffle boundary;
- test mute, separate volume controls, pause, tab hiding, defeat, victory, and replay;
- test the Canvas fallback at desktop and mobile viewport sizes.

## Delivery Sequence

1. Extract and test shared rules for pacing, placement, shuffle, and progression.
2. Fix Three.js resource ownership, dynamic lights, pooling, and spatial queries.
3. Apply shared pacing and placement rules to both renderers.
4. Add the sentry UI and manual-placement indicators.
5. Add agent evolutions and the between-wave progression step.
6. Integrate and verify the supplied MP3 soundtrack.
7. Run automated tests, builds, late-wave profiling, and responsive play tests.
8. Deploy only after the verified source state is committed and saved as a hosting version.
