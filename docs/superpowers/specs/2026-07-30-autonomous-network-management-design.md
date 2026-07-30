# Autonomous Network Management Design

## Goal

Make desktop play more readable at mission start and let recruited agents manage the network using the shared resource wallet.

## Behavior

- Desktop starts in Macro Map presentation; mobile keeps its selected presentation.
- Agents collect repair, Component, and Shard loot.
- Every 3.5 seconds while playing, agents choose one deterministic action in priority order: paid Core repair, field-kit/sentry repair, automatic sentry construction, then no action.
- At wave completion, the autonomous network selects the first available upgrade and advances into the next wave without leaving a stale workshop prompt.
- Core repair costs 2 Components and restores 25 HP, capped at max health.
- Manual controls remain available and use the same resource costs.

## Compatibility

The policy is shared by WebGL and Canvas through `autonomous-network-rules.mjs`; renderer-specific methods apply the selected action and emit existing HUD/toast feedback.
