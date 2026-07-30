# Commander-First Mobile Design

## Goal

Make mobile play understandable and strategic by presenting the battlefield as a zoomed-out management view, explaining the current objective, and letting autonomous AI agents carry most of the combat workload.

## Product principles

- The Core is the win condition and is always named as the primary objective.
- Agents are the player's army; the player manages the network rather than aiming continuously.
- Every major screen state offers one recommended next action.
- Direct combat remains available, but it is secondary to management.
- Desktop keeps its current tactical HUD and controls.

## Mobile gameplay flow

### Strategic map

Mobile gameplay opens with a macro camera framing the Core, recruited agents, sentries, active threats, loot, and terrain lanes together. A `TACTICAL VIEW` control toggles the closer combat framing for players who want to intervene directly. The macro framing is a camera presentation change only; it does not change enemy, loot, or targeting rules.

### Objective director

A compact, persistent objective card sits below the status strip. It contains an objective label, one sentence of context, and one recommended action button. Recommended actions are derived from current state in this order: protect an endangered Core, repair an offline agent or bay, recruit when a slot and materials are available, deploy a sentry when a slot is available, upgrade during a workshop, then defend. Alerts such as warboss telegraphs remain visible, but they do not replace the objective card.

### Commander center

The mobile primary tray becomes `COMMAND`. It contains:

- warband count and current command preset;
- compact cards for each agent with state (`FIGHTING`, `GATHERING`, `REPAIRING`, or `OFFLINE`);
- one-tap `RECRUIT`, `REPAIR`, `BUILD`, and `UPGRADE` actions when valid;
- optional squad presets (`FOLLOW ME`, `GUARD CORE`, `FOCUS BOSS`) rather than mandatory micromanagement.

The existing autonomous engine remains authoritative. Agents continue choosing targets, gathering materials, returning to repair, and spawning bounded temporary sub-agents through the existing rules.

### Secondary defend tray

The current direct controls move under a `DEFEND` tray. It contains the virtual stick, shoot, slash, dash, EMP, and field-kit actions with the existing touch behavior. The player can switch trays without changing the active AI command.

### Onboarding

The first-wave tutorial is expanded into six short commander steps: identify the Core, observe autonomous agents, collect or delegate materials, recruit a specialist, repair an offline agent, and upgrade between waves. Each step points to the exact button or map object it introduces and can be skipped after the first completion.

## State and component boundaries

- `mobileMode`: `command | defend | skills` controls the primary mobile tray.
- `cameraPresentation`: `macro | tactical` controls the mobile camera framing and is independent of combat simulation.
- `objectiveDirector`: a pure presentation selector consumes `HudState` and returns `{ label, detail, action }` without mutating engine state.
- Existing `HudState`, autonomous agent rules, recruitment rules, repair rules, and camera methods remain the source of truth.
- Desktop renders existing panels; new mobile-only elements are hidden above the mobile breakpoint.

## Accessibility and touch requirements

- Objective and tray controls have descriptive labels and pressed states.
- Recommended actions are at least 48px tall and have text labels, not icons alone.
- Macro/tactical toggle works with pointer and keyboard input.
- Long command content scrolls inside its tray and respects safe-area insets.
- Offline, disabled, and unaffordable states are written in plain language.

## Verification plan

- Add source contract tests for the objective director, command/defend trays, macro toggle, and tutorial copy.
- Add pure unit tests covering objective priority for Core danger, repair, recruit, build, upgrade, and defend fallback.
- Run the full Node suite, TypeScript, lint, and production build.
- Verify the deployed custom domain returns the new build after publishing.
