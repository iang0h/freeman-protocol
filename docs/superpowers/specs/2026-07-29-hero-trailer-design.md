# Hero Trailer Design

## Goal

Use the supplied Freeman Protocol trailer as the landing-screen atmosphere without delaying or obscuring the existing mission-start flow.

## Behavior

- The trailer renders only while the app is in `intro` mode.
- It autoplay loops silently, stays inline on mobile, and cannot capture pointer input.
- The existing `START MISSION` handler remains the single transition into the game; intro unmount stops the video immediately.
- Reduced-motion users receive the trailer poster instead of animated playback.

## Delivery

- H.264 MP4, muted, fast-start encoded, served from `public/video/`.
- JPEG poster frame from the same trailer.
- Full-bleed cover video behind the existing intro content, with a dark gradient for text contrast.

## Validation

Source-contract tests cover required video attributes and reduced-motion styling. Full tests, TypeScript, production build, and direct media-route checks must pass before deployment.
