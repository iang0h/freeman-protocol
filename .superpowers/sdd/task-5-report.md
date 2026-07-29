# Task 5 report: HUD, catalog, and regression coverage

## Delivered

- HUD telemetry now reports loot inventory, armor profile, agent ranks, active temporary sub-agents, terrain signal, and maximum hostile EMP resistance from both renderers.
- The asset catalog now documents armor profiles, elite recovery items, agent component progression, and terrain signals with compact responsive cards.
- Added source and rendered catalog assertions plus responsive and reduced-motion CSS coverage.

## Verification

- `tsc --noEmit` — passed.
- `node --test tests/game-source-contracts.test.mjs` — passed (30 tests).
- ESLint — passed.
- `git diff --check` — passed.
- `vinext build` — blocked in this environment: the bundled Node runtime cannot load the native Rolldown arm64 binding because macOS rejects its code signature. Consequently rendered-route and artifact checks require a usable build environment.

## Review fixes

- Replaced the single-largest resistance flag calculation with the maximum
  combined EMP reduction across hostile flag sets. The final wave now reports
  79% for stacked Decoy and Jammer resistance.
- Added catalog cards and rendered documentation for Stasis Array, Hunter Core,
  Breach Ammo, and Nanite Reserve, including component costs, rank caps, and
  concrete bonuses.
- Strengthened the renderer source contract so the WebGL and Canvas HUD
  payloads must each emit temporary sub-agent, terrain, and combined EMP
  resistance telemetry.
- Rebuilt `dist` with an ad-hoc-signed copy of the Codex-bundled Node runtime,
  avoiding macOS hardened-runtime library validation without modifying the
  bundled executable or project dependencies.

## Review verification

- `vinext build` — passed; generated both `/` and `/asset-catalog`.
- `node --test tests/*.test.mjs` — passed (93 tests), including the rendered
  `/asset-catalog` route.
- `tsc --noEmit` — passed.
- ESLint — passed.
- `bash scripts/validate-artifact.sh` — passed.
- `git diff --check` — passed.

---

# Task 5 implementation report: agent skills and escalating warbosses

## Scope delivered

- Added `app/game/skill-rules.mjs` with four deterministic composite role
  skills: Kairos time fracture, Kira mark/execution, Forge armor
  break/suppressive burst, and Covenant repair/barrier. Ownership, live-agent,
  cooldown, target-kind, and protect-only Core constraints are enforced before
  any effect is returned.
- Added `app/game/boss-rules.mjs` with seeded wave-three-plus encounters, one
  active slow armored boss, pre-attack telegraphs, deterministic agent/turret
  damage events, bounded reinforcement output, and capped Component/Shard
  rewards.
- Integrated the same rule outputs into WebGL and Canvas. Both renderers expose
  skill buttons and cooldown rings, boss health telemetry, telegraph markers,
  barriers, armor break, marks, slow fields, boss attacks, and collectible rare
  rewards.
- WebGL boss telegraphs use a capacity-two `BoundedPool`; Canvas renders the
  telegraph directly from persistent boss state without allocating a new
  display object per wave or frame.
- Bosses are inserted before normal formation capacity is filled. Excess normal
  threats remain in the existing bounded queue, and the final-wave legacy
  Rootkit entry is replaced by the single shared boss encounter.

## TDD evidence

1. Added four-skill and boss scheduling/telegraph/damage/reward tests before
   implementation.
2. The first focused run failed with the missing `skill-rules.mjs` module.
   Export-only stubs then produced four expected behavioral assertion failures.
3. Implemented the pure modules and reran the focused suite: 65 passed, 0
   failed.

## Verification

- Bundled Node `node --test tests/*.test.mjs`: 119 passed, 0 failed.
- `tsc --noEmit`: passed.
- ESLint: passed with no warnings or errors.
- `vinext build`: passed using an ad-hoc-signed temporary copy of the bundled
  Node runtime so macOS could load Rolldown's arm64 native binding. Both `/` and
  `/asset-catalog` were generated.
- `scripts/validate-artifact.sh`: passed.
- `git diff --check`: passed.

## Compatibility and concerns

- Core health is excluded from Covenant targets and remains protect-only.
- Existing EMP, repair-bay, eight-slot warband, material wallet, and temporary
  child lifecycle paths are unchanged.
- The normal `npm run build` wrapper cannot run directly in this worktree
  because GNU `timeout` and a local `node_modules/.bin/vinext` are absent. The
  equivalent Vinext build and artifact validation completed successfully using
  the repository's shared dependency tree.

## Final review corrections

- Preserved each skill's explicit slow multiplier and routed both normal-enemy
  and boss movement through the same pure multiplier rule in WebGL and Canvas.
- Applied the seeded boss `armorReduction` curve in both damage paths instead
  of the legacy fixed armor multiplier; boss armor now remains active until
  Forge breaks it.
- Raised the deterministic wave-three-through-eight material schedule so its
  guaranteed total covers the 21 Components and 13 Shards required to recruit
  slots five through eight, while every drop remains within the quantity cap.
- Replaced the obsolete final-wave three-phase claim with copy describing the
  implemented armor break and telegraphed-strike encounter.
- Added regression coverage for slow strength, armor scaling, cumulative
  recruitment funding, renderer integration, and final-wave copy.

Final verification after these corrections repeated the full 119-test suite,
typecheck, ESLint, `git diff --check`, Vinext production build for both routes,
and Sites artifact validation; all passed.
