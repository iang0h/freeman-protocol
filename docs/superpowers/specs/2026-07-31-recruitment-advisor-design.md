# Recruitment Advisor Design

## Goal

Make the recruit decision legible during combat by showing whether the player should recruit, repair, save Compute, or defend the Core—and why.

## Advisor states

The advisor is a compact card beside the Warband control. It chooses one state from the current HUD and progression data:

- **RECRUIT ADVISED** when an affordable specialist addresses the largest current need.
- **REPAIR FIRST** when operator/agent recovery is more urgent than adding a unit.
- **DEFEND CORE** when Core threat density or Core health is critical.
- **HOLD COMPUTE** when no urgent investment is needed or the recommended recruit is unaffordable.

The card includes a one-sentence reason, recommended agent/role, current cost, current resources, and one action button. Unaffordable agents show the missing resource amount instead of a dead button.

## Decision rules

Priority order:

1. Core critical or under immediate breach pressure → defend/repair guidance.
2. Operator or recruited agents critically damaged → repair guidance.
3. Affordable unfilled roster slot with a role matching the current threat → recruit guidance.
4. No urgent need → hold Compute for the next upgrade.

The rules are pure presentation logic. They never spend resources or mutate simulation state. Campaign and Watch Mode use the same recommendation, while Watch Mode also reports the AI’s selected priority.

## Integration

- Add a pure `getRecruitmentAdvice(input)` helper under `app/game/`.
- Expose the advisor state through the existing HUD snapshot and render it in the compact desktop/mobile surface.
- Keep the full Warband overlay as the detailed roster and purchase surface.
- Add a short tutorial/help tooltip explaining that agents are chosen to cover battlefield needs, not collected blindly.

## Verification

- Unit-test every advice priority, affordability, and missing-resource message.
- Add source/UI contracts for the advisor card, action labels, and Watch Mode rationale.
- Run the full suite, lint, TypeScript, and production build before deployment.
