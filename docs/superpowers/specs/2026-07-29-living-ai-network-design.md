# Living AI Network, Loot, and Mobile Combat Design

## Goal

Make the Freeman Protocol catalog and first-wave game loop feel like a living AI network while improving mobile combat parity and reducing command micromanagement.

## Approved behavior

### Loot

Enemies may drop physical pickups on defeat. Pickups stay in the arena until the player walks over them. The initial loot families are repair, component, and upgrade shard. Collection updates the player/Core or upgrade inventory and shows a short HUD confirmation. Drops are bounded, deterministic under test, and cleaned up at wave/session end.

### Mobile combat

On touch devices, tapping the arena fires toward the tapped world position. The existing virtual movement stick remains movement-only. Pointer cancellation, focus loss, and overlay transitions clear any active touch state so movement cannot latch.

### Autonomous recruits

Recruited AI agents act independently according to role profiles: assault prioritizes nearby threats, support protects the player/Core and seeks repair opportunities, and defense anchors breach lanes and important zones. Recruit UI presents status and relationship information; victory does not depend on manual commands.

Agents may enter a bounded improvisation state when health, enemy density, or wave pressure meets a role-specific threshold. An improvising agent can spawn a temporary sub-agent with a simplified inherited role. Sub-agents have a hard lifetime and population cap, disappear on expiry or wave end, and cannot recursively spawn more agents.

### Visual catalog and logo

The catalog keeps the Freeman serif wordmark, dark field, ivory typography, and orange accent from the reference screens, then adds a cinematic living-network layer: pulsing nodes, faint signal paths, scanline/edge-glow treatment on portraits, and compact status animation. Catalog sections become Live Agents, Threat Archive, and Field Components. Loot cards use cyan/white for repair, amber for components, and violet/orange for upgrade shards. Motion uses CSS and small composited layers so mobile remains responsive.

## Architecture

- Add pure rule modules for loot rolls/pickup resolution and autonomous agent decisions/sub-agent lifecycle.
- Keep the Three.js and Canvas fallback engines on the same rules modules and shared event vocabulary.
- Route inventory/progression writes through the existing safe storage helpers.
- Preserve existing tutorial gates and input reset behavior while allowing tap-to-fire after the guided movement step.
- Keep catalog data-driven: agent, threat, and loot entries should be plain data consumed by reusable React card components.

## Acceptance criteria

- A defeated enemy can create a visible pickup; the pickup is not collected until player overlap.
- Repair and component pickups produce the correct bounded resource/health changes.
- Touch tap fires toward the tap target without moving the player or requiring a desktop click.
- Recruited agents make role-appropriate decisions without a command action.
- Improvisation spawns at most the configured temporary sub-agent cap; sub-agents expire and are removed at wave end.
- Catalog visibly contains animated agent portraits and loot cards while retaining the Freeman visual identity.
- Unit/source-contract tests cover loot, touch firing, autonomous decisions, and sub-agent expiry; existing tests, lint, and production builds remain green.

