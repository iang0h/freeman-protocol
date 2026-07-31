# Watch activity disclosure design

## Goal

Reduce the default footprint of the Watch Mode panel without removing live
autonomy telemetry. Live activity starts collapsed, shows the latest event in a
compact summary, and exposes the existing four-row activity log on request.

## Component behavior

`FreemanProtocol` owns a local `watchActivityExpanded` boolean initialized to
`false`. The activity header contains a real button wired with `aria-expanded`
and `aria-controls`. Activating it toggles the local disclosure state.

When collapsed, the activity region renders only the latest entry from
`hud.autonomyLog`, with `hud.lastAutonomyEvent` as its fallback. When expanded,
the compact summary is replaced by the existing ordered list of up to four
events. Leaving Watch Mode resets the disclosure to collapsed so every new
Watch Mode session begins in the compact state.

The change is presentation-only. Both renderers continue to produce the same
`autonomyLog` and `lastAutonomyEvent` telemetry.

## Styling and mobile behavior

The activity heading and toggle share a compact row. The collapsed latest-event
summary uses the existing monospace activity treatment and truncates safely.
The full log retains its current emphasis for the newest event.

At the existing 820px mobile boundary, the toggle has a minimum 44px touch
target. No Watch Mode controls, metrics, or telemetry fields are removed.

## Verification

A source/UI contract test must fail before implementation and then prove:

- disclosure state initializes to `false`;
- the toggle exposes `aria-expanded` and `aria-controls`;
- the collapsed branch renders only the latest-event summary;
- the expanded branch renders the four-row ordered log;
- leaving Watch Mode resets the disclosure;
- the mobile toggle has a 44px minimum touch target.

Focused source contracts, the complete test suite, lint, TypeScript, and the
production build must pass before deployment.
