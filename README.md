# Freeman Protocol

Freeman Protocol is a browser-based cyber-defense action game. The player loop
is:

**gather → recruit/upgrade → repair → deploy skills → survive boss waves**

Destroy threats and collect their materials, then recruit the persistent
eight-slot warband and install upgrades between waves. Keep agents and sentries
operational through the separate repair bay and field kits, deploy each
specialist’s cooldown skill at the right moment, and use the visible EMP charge
to disrupt encounters. From wave three onward, armored warbosses telegraph
their strikes and drop rare Components and Shards that fund the final recruits.
The Covenant Core is protect-only: defend it, but do not treat it as a repair
target.

## Runtime and Sites Notes

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Optional co-op multiplayer deployment

Co-op is intentionally feature-flagged. The browser only enables the room
lobby when a public WebSocket endpoint is injected at build time. Set the
canonical `CO_OP_WS_URL` environment variable to the `wss://` origin of the
Worker that serves `/api/co-op/rooms/:roomCode` (for example,
`wss://freeman-rooms.example.workers.dev`). The Vite config also accepts
`NEXT_PUBLIC_CO_OP_WS_URL` for deployments that only expose framework-prefixed
client variables. Never put a token or credential in either value, and do not
commit `.env*` files or secret values.

The room Worker needs a Cloudflare Durable Object namespace binding named
`CO_OP_ROOMS` pointing to the `MultiplayerRoom` class, plus the first Durable
Object migration for that class. The local preview binding and migration are
declared in `vite.config.ts`; provision the equivalent binding and migration in
the production Worker before pointing the frontend at it. Keep
`.openai/hosting.json` unchanged until the real production binding has been
provisioned by the hosting platform.

If `CO_OP_WS_URL` (or its `NEXT_PUBLIC_` compatibility name) is absent, the
lobby remains safely disabled and displays **CO-OP COMING SOON**. If a Worker
is reached without `CO_OP_ROOMS`, its WebSocket room route returns `503` rather
than attempting a broken upgrade. Campaign and Watch Mode continue to run
without a network endpoint.

### Production checklist

1. Deploy `worker/index.ts` and `worker/multiplayer-room.ts` with the
   `CO_OP_ROOMS` Durable Object binding and migration.
2. Confirm the Worker responds to `GET /api/co-op/rooms/ABC123` with a WebSocket
   upgrade only after the binding is present.
3. Set `CO_OP_WS_URL` in the frontend build environment, redeploy, and verify
   that the lobby no longer shows **CO-OP COMING SOON**.
4. Keep all credentials in the hosting provider's secret store; do not commit
   them to Git or place them in source code.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
