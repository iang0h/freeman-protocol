# Campaign and Watch Mode Design

## Goal

Give Freeman Protocol two clearly different ways to play:

- **Campaign:** the player actively controls the commander through the finite level sequence and completes the story run.
- **Watch Mode:** the player delegates control to the autonomous AI network, watches an endless wave loop, and spends earned resources on upgrades and expansion while the browser tab remains open.

## Product behavior

### Mode selection

At mission start, show a lightweight mode selector with two cards:

- **CAMPAIGN** — “Play the mission. Finish all levels.”
- **WATCH MODE** — “Let the network run. Farm resources endlessly.”

The selected mode is stored in the active session and displayed in the HUD. Switching modes during a run is not allowed; the player returns to the mode selector after ending a run.

### Campaign mode

Campaign preserves the existing finite wave progression, combat controls, intermissions, objectives, upgrades, and level completion. Autonomous agents continue their existing support behaviors, but the player remains the primary actor.

### Watch Mode

Watch Mode uses the existing combat and autonomous-network systems, with the player commander set to a safe observer state. The simulation remains active only while the game is open and the page is visible. Closing, refreshing, or backgrounding the tab pauses/ends the active run rather than generating unbounded offline rewards.

The network runs an endless loop:

1. Spawn the next wave after the existing three-second intermission.
2. Agents fight, gather loot, recruit temporary sub-agents, build sentries, repair damaged agents/core systems, and spend eligible resources on autonomous upgrades.
3. On wave completion, credit session rewards and show a short summary.
4. Continue until the player pauses or ends the run, the core is destroyed, or the session reaches a safety cap.

The player can:

- Pause/resume the simulation.
- Choose simulation speed (`1x`, `2x`, `4x`) with a safe upper bound.
- Set an AI priority preset: `SURVIVE`, `FARM`, or `EXPAND`.
- Buy available upgrades and recruit additional agents.
- Trigger emergency repair or reserve deployment when the resource cost is affordable.

### Watch HUD

The watch HUD prioritizes readable macro information:

- Mode and running/paused state.
- Current wave and survival time.
- Compute, Components, Shards, and session income.
- Active agents and temporary sub-agents.
- Core health and threat level.
- Priority and speed controls.
- `END RUN` action with confirmation.

Individual AI activity is shown as compact event feed entries such as “Kira collected Components”, “Nox repaired the core”, or “Agent 03 spawned two sub-agents”.

## Rewards and persistence

Watch Mode rewards use the existing resource types and are credited after each completed wave. To protect the economy, each session has a bounded reward multiplier and a maximum active-agent/sub-agent count. Speeding up simulation does not multiply rewards; it only shortens real time.

The current save system stores the latest session state locally. Guest play requires no account. Achievements are recorded locally first; a future account layer can sync achievements, cross-device saves, and leaderboards without changing the gameplay contract.

If the tab becomes hidden, the simulation pauses and displays “RUN PAUSED — RETURN TO RESUME”. No rewards accrue while hidden. If the page is refreshed or closed, the latest completed-wave rewards remain in local storage, but the active wave is not simulated in the background.

## Architecture and data flow

- Add a `gameMode` field to the session state (`campaign` | `watch`).
- Add a `watchState` slice containing `paused`, `speed`, `priority`, `survivalMs`, `sessionIncome`, and `lastEvent`.
- Reuse `autonomy-rules.mjs`, `autonomous-network-rules.mjs`, wave rules, loot rules, repair rules, and progression rules as the simulation primitives.
- Add a small watch-mode controller that advances the existing tick/update loop, applies the selected priority preset, and emits typed activity events.
- Gate the controller with `document.visibilityState`; hidden pages pause deterministically.
- Keep rendering separate from simulation state so the watch HUD can be simplified on mobile and expanded on desktop.

## Failure handling

- If an autonomous action cannot pay its resource cost, skip it and record a non-blocking event.
- If all agents are down, enter a recoverable `NETWORK CRITICAL` state and offer repair/reserve actions before ending the run.
- If the core reaches zero, stop the loop, preserve completed-wave rewards, and show a run summary.
- Reset transient watch controls on a new run so a previous `4x` speed or priority cannot surprise the player.

## Testing

- Unit tests for mode selection and persistence.
- Unit tests for watch loop progression, three-second wave intermission reuse, pause/resume, speed bounds, visibility pause, reward crediting, and safety caps.
- Contract tests proving campaign behavior remains finite and watch mode remains endless while active.
- Rendered UI tests for mode cards, watch HUD labels, priority/speed controls, and end-run confirmation.
- Full test suite, TypeScript, lint, and production build before deployment.

## Out of scope for this iteration

- Server-side accounts or authentication.
- True offline progression while the browser is closed.
- Leaderboards, cloud saves, or cross-device achievement sync.
- A separate watch-mode combat simulator; the feature must reuse the existing game systems.
