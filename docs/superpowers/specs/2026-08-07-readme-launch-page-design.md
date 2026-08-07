# Freeman Protocol README launch page design

## Goal

Turn the repository README from an implementation-oriented starter document into a visual, launch-ready product page that makes the game understandable in one screen and gives prospective players a reason to click through. Keep technical setup available, but move it below the product story.

## Audience and success criteria

- A Product Hunt visitor should understand what Freeman Protocol is, what they do in a run, and where to play without reading a long paragraph.
- A GitHub visitor should see the game's visual identity immediately and be able to open the trailer or live game from the first section.
- Gameplay claims must match the current product: campaign and Watch Mode are available; co-op is feature-flagged and should be labeled as coming soon unless a production WebSocket endpoint is configured.
- Screenshots should use large, readable compositions and the supplied/generated game visuals rather than tiny UI captures.

## Page structure

1. Hero: repository-supported artwork, title, short pitch, status badges, and links to the live game and YouTube trailer.
2. Game loop: five short steps — gather, recruit, repair, deploy, survive.
3. Differentiators: three visual cards for autonomous AI warband, living battlefield, and Watch Mode.
4. Gameplay gallery: recruitment, battlefield, Watch Mode, and mobile images with one-line captions.
5. Trailer: clickable YouTube thumbnail linking to `https://youtu.be/SesS1bd7b4c`.
6. Current status: desktop/mobile availability, campaign/Watch Mode availability, and co-op status.
7. Developer setup: concise prerequisites, commands, and a compact co-op deployment note.

## Asset plan

- Convert the supplied AVIF artwork to a repository PNG under `public/marketing/readme/` for the hero.
- Reuse the existing poster at `public/video/freeman-protocol-trailer-poster.jpg` for the trailer link.
- Reuse the Product Hunt gallery images from `public/marketing/product-hunt/` for the gameplay gallery so the README and launch page share a visual system.
- Use relative image paths from `README.md` so GitHub renders the assets from the repository.
- Keep image alt text descriptive and avoid embedding important information only in image text.

## Content and visual rules

- Use short sentences, strong headings, and whitespace; remove the long starter-template explanations from the first half of the page.
- Keep the palette and language aligned with the game: graphite, ivory, orange, and teal; tactical but cinematic.
- Use HTML tables only for compact, stable GitHub layouts; avoid CSS that GitHub strips.
- Do not imply that co-op is live when the deployment is not configured.
- Preserve the existing canonical setup instructions, but compress them into a readable developer section below the launch content.

## Verification

- Render the README mentally from GitHub-supported Markdown/HTML only: relative images, tables, headings, links, and badges.
- Confirm every referenced asset exists and has a stable repository path.
- Check that no secret, local filesystem path, or unverified production claim appears in the README.
- Run `git diff --check` and inspect the changed README and asset list before committing.
