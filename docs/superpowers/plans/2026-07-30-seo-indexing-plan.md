# Search Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Freeman Protocol discoverable and understandable to Google, Bing, and other crawlers on `https://freeman.skillrivals.com`.

**Architecture:** Add framework-native `robots.ts` and `sitemap.ts` route metadata, set the custom domain as `metadataBase` and canonical URL, and emit JSON-LD for the game and website from the root layout. Keep only public marketing/game routes in the sitemap.

**Tech Stack:** Next.js metadata APIs, TypeScript, JSON-LD, Node test runner, Vercel.

## Global Constraints

- Canonical host is `https://freeman.skillrivals.com`.
- Crawlers may access the public homepage and asset catalog.
- Sitemap must be available at `/sitemap.xml` and robots rules at `/robots.txt`.
- Do not expose private, utility, or internal paths in the sitemap.
- Verify output after deployment on the custom domain.

---

### Task 1: Add failing SEO contract tests

**Files:**
- Create: `tests/seo.test.mjs`

- [ ] Write tests asserting robots, sitemap, canonical metadata, JSON-LD, and custom-domain URLs.
- [ ] Run the focused test and confirm it fails because the SEO endpoints/metadata do not yet exist.

### Task 2: Implement crawler endpoints and metadata

**Files:**
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Modify: `app/layout.tsx`

- [ ] Add `robots()` allowing crawlers and referencing the canonical sitemap.
- [ ] Add `sitemap()` for `/` and `/asset-catalog` with stable priorities and timestamps.
- [ ] Set `metadataBase`, canonical alternates, richer descriptions, and keywords.
- [ ] Add `VideoGame` and `WebSite` JSON-LD with the canonical URL and playable game details.
- [ ] Run focused SEO tests and confirm they pass.

### Task 3: Verify and publish

- [ ] Run the full test suite, typecheck, lint, and production build.
- [ ] Push the validated commit to `main`.
- [ ] Deploy to Vercel.
- [ ] Verify `/robots.txt`, `/sitemap.xml`, and homepage canonical/JSON-LD responses on `freeman.skillrivals.com`.
