# Wave Intermission and Player Reserve Army Design

## Goal

Give the operator more meaningful resource decisions while preserving autonomous agents, by adding a short automatic wave intermission and a player-triggered temporary reserve army.

## Behavior

- Clearing a non-final wave enters a three-second intermission with a visible countdown.
- The next wave starts automatically when the countdown expires; no upgrade overlay pauses the campaign.
- During intermission, existing recruit, sentry, and upgrade actions remain available.
- The player can deploy a temporary reserve army using the shared Components and Shards wallet.
- Reserve units are temporary, attack nearby threats, use the existing lifetime upgrade tiers, share the global temporary-unit cap, and are cleared at wave transitions or expiry.
- Recruited agents continue to autonomously gather loot and spawn their own temporary sub-agents using the same shared wallet and cap.

## Balance and safety

- The reserve action is resource-gated and rejects unaffordable deployments without mutation.
- The existing pooled renderer markers and temporary-sub-agent rules are reused so WebGL and Canvas remain bounded and visually consistent.
- The final victory wave is unchanged; no intermission is added after victory.
