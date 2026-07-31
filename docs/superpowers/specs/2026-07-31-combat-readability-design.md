# Combat Readability and Arena Clarity Design

## Goal

Make Freeman Protocol's real-time combat readable at a glance while preserving its deeper warband, upgrade, repair, and watch-mode systems. The arena becomes the default surface; management opens intentionally as one focused overlay.

## Product decisions

- Desktop opens in a clean arena view with a compact combat HUD.
- The left dashboard is available through `INTEL` and the bottom warband dock through `WARBAND`.
- Only one management overlay is open at a time; campaign pauses while an overlay is open.
- Mobile uses the same hierarchy with larger type and no compressed secondary telemetry.
- The existing autonomous simulation remains authoritative; this is a presentation and feedback pass, not a second combat model.

## Combat HUD

The default desktop HUD contains only:

- `HP`, `CORE`, and `WAVE` in a slim top status bar;
- one active objective or urgent threat alert;
- a compact action cluster for currently relevant player actions;
- an `INTEL` toggle and a `WARBAND` toggle.

`INTEL` opens the existing health, resource, armor, terrain, and base information in a side overlay. `WARBAND` opens roster cards and squad orders in a bottom or centered overlay. Skills, repair, and inventory share a focused `ACTIONS` tray. Existing data remains available, but is no longer simultaneously rendered over the battle.

Watch Mode keeps its autonomous telemetry as a compact right-side status card. The activity feed is collapsed by default and expands on demand.

## Combat feedback

Every player attack should communicate connection, magnitude, and outcome:

- a visible aim reticle follows the current aim point or target;
- a short aim line appears while targeting or firing;
- hits produce a pooled flash, damage number, recoil/flinch, and impact sound;
- critical hits add a stronger flash and `CRITICAL` label;
- kills produce a distinct color-coded burst and a short combo streak;
- slash attacks render a directional arc with a readable active window;
- Core damage produces a separate warning pulse;
- effects are pooled and capped to avoid wave-time allocation spikes.

## Arena zones

The existing arena stays compact but gains meaningful destinations:

- **Core Chamber**: protected center and defense focus;
- **North Breach Lane**: frequent light threats;
- **South Breach Lane**: heavier threats and interception;
- **Compute Node**: valuable resource drops that pull agents outward;
- **Repair Bay**: recovery point for damaged agents and operator;
- **Boss Portal**: high-risk edge zone with elite arrival telegraphs.

Each zone receives a distinct floor treatment, landmark marker, and small location label. Loot and enemy routing should prefer these lanes so travel has a strategic purpose. Desktop uses macro framing by default; mobile uses a slightly tighter tactical framing.

## Mobile presentation

Mobile live combat shows only `HP`, `CORE`, `WAVE`, current zone, and one urgent alert. Secondary telemetry is removed rather than shrunk. Direct touch-drag movement remains the movement model; the joystick is not reintroduced.

`COMMAND`, `DEFEND`, and `SKILLS` remain mutually exclusive full-width trays. The roster is collapsed until explicitly opened. Action buttons meet touch targets and use readable labels. Agent and enemy silhouettes receive a modest mobile scale increase, with stronger team/enemy color separation and a persistent Core glow.

## Boundaries and data flow

- Existing `HudState`, engine simulation, autonomous rules, loot rules, and watch rules remain the source of truth.
- Presentation state adds an overlay discriminator such as `intel | warband | actions | closed`; it does not mutate simulation state.
- The reticle and feedback effects consume existing targeting, damage, projectile, and melee events.
- Arena-zone presentation derives from world coordinates and existing terrain/loot/enemy state.
- WebGL and Canvas fallback paths must expose equivalent feedback and HUD behavior.

## Failure and performance handling

- If a management overlay is opened during campaign, pause the simulation and resume on close.
- If a requested overlay has no actionable content, show a concise empty state rather than restoring the full dashboard.
- Cap combat feedback objects per frame and reuse existing pools where possible.
- Keep reduced-motion behavior available: use color and text feedback without large camera effects.
- Preserve watch-mode recovery, wave timing, and autonomous actions unchanged.

## Verification plan

- Add source contracts for desktop overlay toggles, compact HUD fields, one-overlay-at-a-time behavior, zone labels, reticle, hit/critical/kill feedback, and mobile typography floors.
- Add pure tests for zone selection and feedback event classification where practical.
- Run all Node tests, ESLint, TypeScript, and production build.
- Verify the deployed custom domain after publishing.

## Out of scope

- Replacing the existing 3D asset library or rebuilding all character models.
- Adding server accounts, cloud progression, or a separate combat simulator.
- Enlarging the arena beyond the current playable footprint.
