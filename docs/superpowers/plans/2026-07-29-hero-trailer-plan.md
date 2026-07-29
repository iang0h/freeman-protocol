# Hero Trailer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied silent trailer as a muted looping intro background that stops immediately when the player starts the mission.

**Architecture:** Store a compressed H.264 MP4 and poster image in `public/`. Render the video only inside the existing `mode === "intro"` screen, behind the current copy and controls. Add source-contract coverage for the video attributes, intro layering, start handler, and reduced-motion fallback; preserve the existing engine transition unchanged.

**Tech Stack:** Next.js/React, TypeScript, CSS, ffmpeg, Node test runner, Vercel.

## Global Constraints

- Video must autoplay muted, loop, and remain inline on mobile.
- `START MISSION` must transition directly into the existing game mode.
- Video must never delay game startup or block interaction.
- `prefers-reduced-motion` must use the poster without autoplaying the trailer.
- Keep the existing intro typography and controls readable above the footage.
- Provide a compressed MP4 fallback suitable for mobile delivery.

---

### Task 1: Prepare media assets

**Files:**
- Create: `public/video/freeman-protocol-trailer.mp4`
- Create: `public/video/freeman-protocol-trailer-poster.jpg`

- [ ] **Step 1: Inspect source media**

Run `ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of json "/Users/iangoh/Downloads/Freeman Protocol Trailer.mp4"` and record the 1280×720, 10-second source characteristics.

- [ ] **Step 2: Encode a muted web delivery copy**

Run:

```bash
mkdir -p public/video
ffmpeg -y -i "/Users/iangoh/Downloads/Freeman Protocol Trailer.mp4" -an -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p -movflags +faststart -crf 25 -preset medium public/video/freeman-protocol-trailer.mp4
```

- [ ] **Step 3: Extract a poster frame**

Run:

```bash
ffmpeg -y -i public/video/freeman-protocol-trailer.mp4 -frames:v 1 -q:v 3 public/video/freeman-protocol-trailer-poster.jpg
```

- [ ] **Step 4: Verify media output**

Run `ffprobe` against both outputs and confirm the MP4 has no audio stream, has `faststart`, and is materially smaller than the 15 MB source.

- [ ] **Step 5: Commit media**

```bash
git add public/video
git commit -m "feat: add muted hero trailer assets"
```

### Task 2: Add failing intro trailer contract tests

**Files:**
- Modify: `tests/game-source-contracts.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a source contract that reads `app/FreemanProtocol.tsx` and asserts the intro contains a `hero-trailer` video with `autoPlay`, `muted`, `loop`, `playsInline`, a poster path, and that it is rendered only for intro mode. Add CSS source assertions for reduced-motion poster fallback.

- [ ] **Step 2: Run the focused test**

Run `node --test tests/game-source-contracts.test.mjs` and confirm the new assertions fail because the trailer markup does not exist yet.

### Task 3: Integrate trailer into the intro screen

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add minimal video markup**

Inside the existing `mode === "intro"` section, render:

```tsx
<video
  className="hero-trailer"
  autoPlay
  muted
  loop
  playsInline
  poster="/video/freeman-protocol-trailer-poster.jpg"
  aria-hidden="true"
>
  <source src="/video/freeman-protocol-trailer.mp4" type="video/mp4" />
</video>
```

Keep the existing `START MISSION` callback unchanged so unmounting the intro stops playback and enters the game immediately.

- [ ] **Step 2: Add readable layering**

Add `.hero-trailer` as an absolute, full-bleed, cover-positioned layer below `.intro-network` and `.intro-copy`, with `object-fit: cover`, reduced opacity, and `pointer-events: none`. Add a dark gradient overlay using the existing intro atmosphere layer or a dedicated pseudo-element.

- [ ] **Step 3: Add reduced-motion behavior**

Under `@media (prefers-reduced-motion: reduce)`, hide the video and keep the poster visible through the intro background. Do not change button behavior.

- [ ] **Step 4: Run the focused test**

Run `node --test tests/game-source-contracts.test.mjs`; confirm the new trailer and CSS assertions pass.

- [ ] **Step 5: Commit integration**

```bash
git add app/FreemanProtocol.tsx app/globals.css tests/game-source-contracts.test.mjs
git commit -m "feat: add autoplay hero trailer intro"
```

### Task 4: Verify and publish

**Files:**
- No new source files.

- [ ] **Step 1: Run the full test suite**

Run `node --test tests/*.test.mjs`; expect all existing tests plus the new trailer contract to pass.

- [ ] **Step 2: Run typecheck and build**

Run `tsc --noEmit --incremental false` and the production build. Confirm the compressed video is copied into the deployment output.

- [ ] **Step 3: Inspect the rendered intro route**

Confirm the landing page returns HTTP 200 and serves `/video/freeman-protocol-trailer.mp4` and its poster with HTTP 200.

- [ ] **Step 4: Push and deploy**

Push `main` and deploy the validated build to the existing Vercel project using the archive upload path.
