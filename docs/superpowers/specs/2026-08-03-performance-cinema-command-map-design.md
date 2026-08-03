# Freeman Protocol: Performance, Cinema Watch, Command Map, Themes, and Shared Simulation

## Status

Approved design for implementation on 2026-08-03.

## Goal

Make Freeman Protocol remain playable and readable as waves scale while adding a cinematic spectator experience, a useful macro command view, distinct battleground presentation, stronger combat feedback, and one authoritative simulation boundary shared by the WebGL and Canvas renderers.

## Scope

### 1. Adaptive performance manager

Add a renderer-independent quality profile module and a small runtime performance monitor. Profiles are `low`, `medium`, and `high` and control only bounded presentation cost:

- pixel ratio cap;
- robot idle-animation work;
- dynamic effects and particle ceilings;
- shadows and shadow-map size;
- optional bloom/grade hooks;
- distant background dressing.

The default profile uses touch capability, device memory, and hardware concurrency as hints. The monitor samples frame duration over a rolling window and steps down one profile after sustained below-budget frames. It never steps up automatically during combat. A WebGL context-loss handler switches to the Canvas fallback or a recovery surface without mutating campaign state. The simulation tick, wave pacing, and damage numbers remain unchanged by quality.

### 2. Cinema Watch mode

Keep the existing Watch Mode economy and autonomous network, but add a presentation layer named `cinemaWatch`:

- speed controls `0.5x`, `1x`, `2x`, and `4x`;
- pause/resume;
- a clean capture view that hides management panels while leaving a small wave/status badge;
- an orbit/follow camera that chooses the current breach, boss, or loot event;
- automatic restart after a watch run reaches its terminal wave or recovery limit.

The normal Watch Mode panel remains available. Cinema controls are explicit and keyboard/touch reachable; they never change campaign resources or create offline progress.

### 3. Command Map view

Extend the existing macro camera with a tactical presentation toggle. In Command Map, the arena remains visible but renderers add high-contrast markers for:

- Core and repair bay;
- living, disabled, and gathering agents;
- sentries;
- loot pickups;
- breach lanes and extraction/portal zones;
- current boss and selected threat.

The map uses one focused layer rather than opening the full Warband/Intel/Actions panels. Clicking/tapping a marker focuses the camera or opens the relevant compact action. The view has no gameplay authority; it reads the shared snapshot and preserves existing controls.

### 4. Data-driven battleground themes

Add three visual battleground looks on top of existing terrain modifiers. A theme owns background, fog, grid/ground palette, accent lights, zone dressing, and one clear gameplay modifier. Initial themes:

- `clear-grid`: legible neutral starting field;
- `relay-storm`: cyan relay pylons, electrical arcs, and the existing route/targeting modifier;
- `data-fog`: warmer fog and the existing reduced long-range targeting modifier.

Themes are compact data records consumed by both renderers. They may reuse existing geometry and effect pools; no runtime remote models or heavy post-processing dependency is introduced. Theme selection changes at wave transitions and is deterministic from the wave/seed.

### 5. Pooled combat feedback budget

Build on existing pooled effects rather than adding a general-purpose effect library. Add bounded, readable events:

- hit flash and short enemy flinch;
- critical/armor-break emphasis;
- kill burst with a distinct color by threat class;
- boss arrival/impact shockwave;
- small camera punch/hit-stop with reduced-motion safeguards.

Effects have explicit maximum counts and release/dispose paths in both engines. If the budget is exhausted, the oldest low-priority effect is dropped; combat logic still resolves normally.

### 6. Shared simulation snapshot boundary

Do not perform a risky full Worker migration in this pass. Introduce a serializable `FreemanSimulationSnapshot`/`FreemanSimulationView` boundary around the decisions already shared by the pure rules modules. Both engines continue owning their native objects, but wave transitions, watch-mode intent, target selection, agent action state, and resource totals are derived from the same normalized snapshot helpers. A source-contract test ensures the WebGL and Canvas loops consume the same helper output and do not diverge on wave/agent state.

## Architecture and data flow

1. `app/game/quality-rules.mjs` owns profile selection, frame-budget transitions, and profile serialization.
2. `app/game/battleground-rules.mjs` owns deterministic theme records and the current wave-to-theme mapping.
3. `app/game/simulation-view.mjs` owns normalized serializable snapshots for agents, enemies, pickups, defenses, wave, and resources. It imports no Three.js or DOM APIs.
4. `FreemanEngine` and `FreemanCanvasEngine` call the same pure helpers, then apply positions/materials/effects locally.
5. `app/page.tsx` renders the cinema controls and command-map toggle from HUD/view state. Existing co-op presentation continues to gate local simulation.
6. CSS keeps command-map markers and cinema controls touch-safe and safe-area aware.

## Accessibility and responsive behavior

- All cinema and map controls have visible labels, keyboard focus, and 44px minimum touch targets.
- Mobile defaults to Command Map markers without secondary telemetry; desktop may show the full map legend.
- `prefers-reduced-motion` disables orbit drift, hit-stop, and camera punch while preserving hit/kill color cues.
- Quality changes are announced through the existing toast/HUD activity channel, not an intrusive modal.
- Cinema mode always exposes a visible exit/pause control.

## Testing and verification

- Unit tests cover quality selection/downgrade, deterministic theme mapping, snapshot normalization, and cinema state transitions.
- Source-contract tests assert both renderers import and consume the same quality/theme/simulation helpers.
- Mobile-layout tests assert command-map/cinema controls remain safe-area aware and touch-sized.
- Run the complete Node test suite, scoped ESLint, Next production build, Vinext production build, `git diff --check`, and a local runtime smoke check for `/` and `/asset-catalog`.
- Perform a manual browser check at desktop, portrait mobile, and reduced-motion settings before claiming completion.

## Non-goals

- No direct copy of the chess repository's generated models, audio, or visual assets.
- No new account/offline progression behavior.
- No change to wave balance, resource costs, loot values, or co-op protocol semantics.
- No full Worker-based simulation migration in this pass.
