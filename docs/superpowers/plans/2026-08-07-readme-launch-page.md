# Freeman Protocol README Launch Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical-first README with a visual launch page that explains Freeman Protocol quickly and links visitors to the live game and trailer.

**Architecture:** Keep the product story in `README.md` using GitHub-supported Markdown and small HTML tables. Store the supplied hero conversion and existing game visuals under `public/marketing/readme/`, then reference all images with repository-relative paths. Preserve the existing setup and co-op notes in a concise developer section below the launch content.

**Tech Stack:** GitHub-flavored Markdown, GitHub-safe HTML tables, PNG/JPG/WEBP assets already used by the Vite/Vinext app.

## Global Constraints

- Use the supplied Freeman Protocol artwork and existing game visuals; do not invent unrelated branding.
- Use relative repository paths from `README.md`; never reference local filesystem paths.
- Keep campaign and Watch Mode claims current; label co-op as coming soon unless a production WebSocket endpoint is configured.
- Keep the first half visual and concise; technical setup belongs below the product story.
- Do not add secrets, credentials, or production environment values to documentation.

---

### Task 1: Add the supplied hero artwork to the repository

**Files:**
- Create: `public/marketing/readme/freeman-protocol-hero.png`

**Interfaces:**
- Produces: a repository-local hero image that can be referenced by `README.md`.

- [ ] **Step 1: Convert the supplied AVIF artwork to PNG**

Run from the repository root:

```bash
mkdir -p public/marketing/readme
sips -s format png \
  /Users/iangoh/Downloads/2d3ee6ea-b1df-4943-8a96-648588c245e4.avif \
  --out public/marketing/readme/freeman-protocol-hero.png
```

Expected: `public/marketing/readme/freeman-protocol-hero.png` exists and contains the supplied Freeman Protocol artwork.

- [ ] **Step 2: Verify the asset dimensions and format**

Run:

```bash
file public/marketing/readme/freeman-protocol-hero.png
sips -g pixelWidth -g pixelHeight public/marketing/readme/freeman-protocol-hero.png
```

Expected: a readable PNG with a landscape aspect ratio and no local-path dependency.

- [ ] **Step 3: Commit the asset**

```bash
git add public/marketing/readme/freeman-protocol-hero.png
git commit -m "docs: add README hero artwork"
```

### Task 2: Rewrite the README as a launch-first product page

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `public/marketing/readme/freeman-protocol-hero.png`, `public/video/freeman-protocol-trailer-poster.jpg`, and `public/marketing/product-hunt/02-recruitment.png` through `05-mobile-play.png`.
- Produces: a README whose first screen contains the hero, live game link, trailer link, and five-step player loop; later sections contain visual proof, current status, and developer setup.

- [ ] **Step 1: Replace the technical-first opening with the hero section**

Add a centered hero image and short launch copy using GitHub-safe HTML:

```md
<div align="center">
  <img src="public/marketing/readme/freeman-protocol-hero.png" alt="Freeman Protocol cyber-defense battlefield" width="100%" />

  # Freeman Protocol

  **Build an autonomous AI warband. Defend the Core. Survive the breach.**

  <a href="https://freeman.skillrivals.com/">Play the live game</a> ·
  <a href="https://youtu.be/SesS1bd7b4c">Watch the trailer</a>
</div>
```

- [ ] **Step 2: Add the concise game loop and feature cards**

Use a five-column table for `GATHER`, `RECRUIT`, `REPAIR`, `DEPLOY`, and `SURVIVE`, followed by three short feature cards explaining the autonomous warband, living battlefield, and Watch Mode. Keep each card to one sentence and avoid implementation jargon.

- [ ] **Step 3: Add visual gameplay proof**

Embed the four existing Product Hunt gallery images with descriptive captions:

```md
| Recruit your warband | Watch the network work |
| --- | --- |
| ![Recruitment screen](public/marketing/product-hunt/02-recruitment.png) | ![Watch Mode battlefield](public/marketing/product-hunt/04-watch-mode.png) |

| Fight across meaningful zones | Play on a phone |
| --- | --- |
| ![Living battlefield](public/marketing/product-hunt/03-living-battlefield.png) | ![Mobile gameplay](public/marketing/product-hunt/05-mobile-play.png) |
```

- [ ] **Step 4: Add the trailer card and current status**

Use the existing poster as a clickable link to the supplied YouTube video. State that campaign and Watch Mode are available, desktop and mobile are supported, and co-op is coming soon unless a production WebSocket endpoint is configured.

- [ ] **Step 5: Move setup and co-op deployment notes below the launch story**

Retain the existing Node.js prerequisite, `npm run dev`, `npm run build`, `npm test`, and co-op Worker requirements, but rewrite them as compact sections. Keep the exact environment variable names `CO_OP_WS_URL` and `NEXT_PUBLIC_CO_OP_WS_URL` and the `CO_OP_ROOMS` Durable Object binding name.

- [ ] **Step 6: Check Markdown paths and readability**

Run:

```bash
rg -n 'public/|https://|CO_OP|TODO|TBD' README.md
git diff --check
```

Expected: every referenced local asset exists, external links are intentional, no secrets or placeholders remain, and `git diff --check` is clean.

- [ ] **Step 7: Commit the README rewrite**

```bash
git add README.md
git commit -m "docs: redesign README for launch"
```

### Task 3: Final documentation verification

**Files:**
- Test: `README.md` and all referenced files under `public/marketing/readme/`, `public/marketing/product-hunt/`, and `public/video/`.

**Interfaces:**
- Consumes: the README and repository assets produced by Tasks 1–2.
- Produces: a clean, self-contained GitHub README with no broken relative references.

- [ ] **Step 1: Verify every referenced local image exists**

Run:

```bash
for asset in \
  public/marketing/readme/freeman-protocol-hero.png \
  public/marketing/product-hunt/02-recruitment.png \
  public/marketing/product-hunt/03-living-battlefield.png \
  public/marketing/product-hunt/04-watch-mode.png \
  public/marketing/product-hunt/05-mobile-play.png \
  public/video/freeman-protocol-trailer-poster.jpg; do
  test -f "$asset" || { echo "missing: $asset"; exit 1; }
done
```

Expected: the command exits successfully with no missing-asset output.

- [ ] **Step 2: Review the final diff and status**

Run:

```bash
git diff HEAD~2..HEAD -- README.md public/marketing/readme/freeman-protocol-hero.png
git status --short --branch
```

Expected: only the approved README/hero documentation work is present, with no unrelated source changes or untracked secrets.
