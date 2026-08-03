# Freeman Protocol: Recruit, EMP, Watch Director, and War-Robot Presentation

## Status

Approved design for implementation on 2026-08-03.

## Goal

Make the first few minutes of Freeman Protocol easier to understand while making Watch Mode feel alive and making threats read as a war machine rather than abstract glowing shapes. The changes must work in the primary Three.js renderer, the 2D canvas fallback, desktop input, touch input, and the existing co-op presentation where applicable.

## Scope

### 1. Contextual recruit prompt

The existing recruitment advisor already computes the next role-matched candidate and whether the player can afford it. Reuse that rule output, but add a compact prompt that is shown only when the next recommended agent becomes affordable (and once when the player first enters a recruit-ready state). The prompt contains:

- the agent name and one-line role;
- a short reason tied to the current threat;
- current cost/affordability represented as a single readable line;
- a large `RECRUIT NOW` action that opens/highlights the relevant Warband card;
- a close/dismiss control.

The prompt is a transient status surface, not another dashboard. It must not repeat every HUD tick, remain permanently open after dismissal, or show the full eight-card roster. On mobile it uses a bottom-safe toast/panel with a minimum 44px action target; on desktop it is a compact anchored toast near the top-left HUD. Co-op keeps the prompt informational unless the local player can send the recruit action.

### 2. EMP ready affordance

When EMP charge reaches a usable state, emit a one-time `EMP READY` event for that charge cycle. Render it as a high-contrast, dismissible live prompt with a direct `EMP PULSE` button. The existing action button remains the canonical control, so the same action can be triggered by:

- the prompt button;
- the existing action button;
- keyboard `R` on desktop;
- a touch tap on mobile.

The prompt is suppressed while the EMP is on cooldown, while the player is not in combat, or after the player dismisses it until the next ready transition. The HUD label should say `READY` when usable and keep a concise cooldown countdown when unavailable. In co-op, the prompt follows the server snapshot and only enables when the room accepts actions.

### 3. Watch Mode activity director

Watch Mode needs a deterministic autonomous movement layer rather than only combat targeting. Add a pure `watch-director-rules.mjs` module that tracks a small state machine:

- `engage`: move toward a nearby threat or priority target;
- `collect`: move to the nearest useful loot pickup;
- `repair`: return to the Core/repair bay when damaged;
- `patrol`: circulate through the arena's meaningful zones when no immediate task exists;
- `unstick`: force a new target/route when movement has been below a threshold for a safety interval.

The director returns an intent and target point; both renderers apply movement and keep their own collision/path details. Agents continue to choose their own assault/support/defend roles and may gather materials, repair, build sentries, recruit the next agent, and spawn temporary sub-agents. The operator also moves autonomously in Watch Mode, prioritizing survival, loot, and threats according to the selected watch priority.

An anti-stall watchdog must reset a stuck route after roughly two seconds of negligible movement, emit a readable activity event, and never pause a wave because every actor happens to be waiting. Patrol targets use the existing Core, breach, extraction, repair, and portal zones so idle time still shows purposeful motion. Existing wave/intermission timing remains unchanged.

### 4. Low-poly war robots

Replace the runtime enemy silhouettes with lightweight low-poly robot rigs made from Three.js primitives: torso, head/sensor, shoulder/leg masses, weapon or antenna, threat ring, and readable health bar. Each enemy type receives a distinct silhouette and animation cue:

- virus: fast skirmisher drone with angular legs and a red sensor;
- phisher: ranged signal robot with antenna and weapon arm;
- trojan: heavy plated melee machine with shoulder armor;
- rootkit/boss: oversized armored war machine with emissive core, armor cues, and telegraph ring.

The rigs reuse geometry/materials where possible, keep draw calls bounded, and preserve the existing hit flash, recoil, death burst, and resistance indicators. The central torso remains the `EnemyRuntime.body` so current combat feedback can update emissive intensity without a new rendering contract.

The 2D canvas fallback receives matching robot silhouettes (body, head, legs, weapon, sensor) instead of circles/diamonds. This keeps gameplay readable when WebGL is unavailable.

Use ImageGen to create a single low-poly concept/asset-catalog render at `public/asset-catalog/war-robot-threat.webp`. It is a catalog/marketing asset and a visual reference, not a runtime texture dependency. There is no installed `img2threejs` converter in this repository; the interactive model is therefore procedural Three.js geometry so it loads immediately and can later be replaced by a generated GLB without changing combat rules.

## Data flow and interfaces

1. `FreemanEngine` and `FreemanCanvasEngine` continue to emit `HudState` through the existing callback.
2. Add small, serializable HUD fields for `recruitPrompt` and `empReadyPrompt` (or equivalent event-safe state) so React can render transient prompts without reading engine internals.
3. Keep decision logic pure and testable in `app/game/` modules. UI components only render state and call existing controller methods (`recruit`, `activateEmp`, and co-op action dispatch).
4. The watch director consumes normalized positions/health/resources and returns an intent; it does not import Three.js or Canvas APIs.
5. Generated art is referenced only by the asset catalog so failure to load the image cannot block the game.

## Accessibility and responsive behavior

- Prompts use `role="status"`/`aria-live="polite"` and have explicit labels.
- Every action target is at least 44px high on touch layouts.
- Mobile hides secondary resource breakdowns inside the prompt and shows only the decision, role, and action.
- Keyboard focus remains visible; `R` still works when the prompt is open.
- Reduced-motion users receive static robot poses and no forced camera shake beyond existing safeguards.

## Testing and verification

- Unit-test the watch director transitions and the two-second anti-stall reset.
- Unit-test recruit-ready and EMP-ready transition behavior so prompts do not spam.
- Add source-contract tests for both renderers and responsive prompt markup.
- Run the full Node test suite, TypeScript/Next production build, and a browser smoke check for campaign, watch, touch-sized layout, and the asset catalog.
- Confirm the generated catalog asset exists in the repository and is not required for the game boot path.

## Non-goals

- No new online model-conversion service or runtime GLB fetch.
- No additional roster mechanics or resource currencies.
- No change to the existing eight-wave campaign balance beyond movement/presentation safeguards.
