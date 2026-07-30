# Mobile Commander Layout

## Goal

Make Freeman Protocol comfortable and playable on portrait and landscape phones by giving the arena priority and showing only one action surface at a time.

## Interaction model

- The top HUD becomes a compact status strip on screens up to 820px wide. Detailed progression telemetry and camera controls remain available on desktop but do not consume mobile play space.
- A mobile panel switcher exposes three mutually exclusive trays: Fight, Skills, and Warband. The active tray is always visible; inactive trays do not intercept pointer input.
- Fight keeps the virtual stick, shoot, slash, dash, EMP, and repair actions together in large touch targets.
- Skills presents the four agent skill buttons without covering the arena.
- Warband presents squad orders and the recruitment cards in a scrollable tray. Existing automatic AI behavior is unchanged.
- Upgrade/evolution overlays own the mobile viewport while open. Persistent combat, skill, warband, repair, and movement controls are hidden until the player returns to gameplay.
- All mobile actions use at least 48px touch targets, respect safe-area insets, and support touch/pointer input without keyboard-only labels.

## Visual rules

- Desktop styling and placement remain unchanged.
- Mobile status uses the existing health/core meters plus compact compute, enemy, and wave values.
- The arena remains visible between the status strip and the bottom tray; long content scrolls inside the tray rather than expanding over the arena.
- Portrait and landscape layouts use the same panel state and safe-area spacing.

## Accessibility

- Panel switcher buttons expose `aria-pressed` and a labelled group.
- The active tray has a descriptive label; hidden trays are not focusable.
- Existing keyboard controls remain available on desktop.
