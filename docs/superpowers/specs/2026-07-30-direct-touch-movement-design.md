# Direct Touch Movement and Objective UI Removal

## Goal

Make the mobile battlefield less cluttered and easier to control by removing the non-actionable objective overlays and replacing the virtual joystick with direct touch-drag movement.

## Scope

- Remove the visible `objective-banner` and `mobile-objective-card` from the gameplay HUD.
- Keep the tutorial overlay and internal progression/objective systems intact.
- Remove the mobile virtual-stick component and its visual styling.
- On touch-capable playfields, a press still aims/fires and a drag from that press supplies normalized movement until release or cancellation.
- Preserve desktop mouse, middle-button camera rotation, keyboard, and existing touch action-button behavior.

## Interaction contract

1. Touch pointer down on the canvas records the gesture origin, aims, and fires (or confirms placement).
2. Touch pointer movement converts displacement from the origin into a clamped movement vector with the existing dead-zone normalizer.
3. Touch pointer up/cancel, visibility changes, and window blur clear the movement vector and touch aim state.
4. HUD controls remain DOM buttons above the canvas and therefore do not begin a movement gesture.

## Verification

- Source-contract tests assert objective markup and joystick markup are absent.
- Source-contract tests assert both renderers expose touch drag state, movement normalization, pointer capture, and reset behavior.
- Existing gameplay, mobile layout, typecheck, lint, and production build checks remain green.
