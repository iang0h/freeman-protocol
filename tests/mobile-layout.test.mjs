import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, game, styles] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/FreemanProtocol.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("uses the full safe mobile viewport", () => {
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("keeps mobile gameplay clear by collapsing secondary controls", () => {
  assert.match(game, /mobile-squad-toggle/);
  assert.match(game, /aria-expanded=\{mobilePanel === "warband" && mobileSquadOpen\}/);
  assert.match(
    styles,
    /\.agent-dock:not\(\.is-mobile-open\) \.squad-commands/,
  );
  assert.match(styles, /\.camera-panel\s*\{\s*display:\s*none;/);
});

test("uses one active mobile command tray at a time", () => {
  assert.match(game, /type MobilePanel = "fight" \| "skills" \| "warband"/);
  assert.match(game, /const \[mobilePanel, setMobilePanel\] = useState<MobilePanel>\("fight"\)/);
  assert.match(game, /mobile-panel-switcher/);
  assert.match(game, /aria-pressed=\{mobilePanel === panel\}/);
  assert.match(game, /\["fight", "FIGHT"\]/);
  assert.match(game, /\["skills", "SKILLS"\]/);
  assert.match(game, /\["warband", "WARBAND"\]/);
  assert.match(styles, /\.mobile-panel--inactive/);
});

test("keeps workshop overlays from being covered by mobile gameplay trays", () => {
  assert.match(game, /className=\{`game-shell mode-\$\{mode\}`\}/);
  assert.match(game, /mobile-status-strip/);
  assert.match(styles, /\.mode-upgrade[\s\S]*\.mobile-action-tray/);
  assert.match(styles, /\.mode-evolution[\s\S]*\.mobile-action-tray/);
});

test("provides a compact, touch-safe mobile status and switcher", () => {
  assert.match(styles, /\.mobile-status-strip/);
  assert.match(styles, /\.mobile-panel-switcher/);
  assert.match(styles, /\.mobile-panel-switcher button[\s\S]*min-height:\s*48px/);
  assert.match(styles, /\.mobile-action-tray[\s\S]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)/);
});

test("keeps the recruitment dock interactive above workshop overlays", () => {
  const overlayZ = Number(
    styles.match(/\.overlay-screen\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
  );
  const workshopZ = Number(
    styles.match(/\.agent-dock\.is-workshop\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
  );

  assert.ok(workshopZ > overlayZ);
  assert.match(
    styles,
    /\.agent-dock\.is-workshop\s*\{[\s\S]*?pointer-events:\s*auto/,
  );
  assert.match(
    styles,
    /\.(?:mobile-squad-toggle|agent-card)[\s\S]*?touch-action:\s*manipulation/,
  );
  assert.match(
    game,
    /className=\{`agent-dock mobile-action-tray mobile-panel--warband/,
  );
});

test("pulls the camera back for portrait play", () => {
  assert.match(game, /const portraitPullback/);
  assert.match(game, /aspect < 0\.58 \? 1\.5/);
});

test("keeps both sentry deployment actions available on mobile", () => {
  assert.match(game, /base-builder__manual/);
  assert.match(styles, /\.base-builder__manual/);
});

test("keeps the repair field kit as a large touch-safe action", () => {
  assert.match(game, /repair-field-kit/);
  assert.match(game, /REPAIR \/ FIELD KIT/);
  assert.match(game, /useFieldKit\(\)/);
  assert.match(
    styles,
    /\.repair-field-kit\s*\{[\s\S]*?min-height:\s*48px/,
  );
});

test("keeps EMP, agent skills, and repair actions reachable on touch layouts", () => {
  assert.match(game, /aria-label="EMP pulse"/);
  assert.match(game, /className=\{`skill-actions mobile-action-tray mobile-panel--skills/);
  assert.match(game, /aria-label="Agent skill controls"/);
  assert.match(game, /className=\{`repair-field-kit mobile-action-tray mobile-panel--fight/);
  assert.match(styles, /\.skill-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, 42px\)/);
  assert.match(styles, /\.repair-field-kit\s*\{[\s\S]*?bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 76px\)/);
});

test("keeps the guided tutorial clear of mobile combat controls", () => {
  assert.match(game, /tutorial-card/);
  assert.match(game, /SKIP TUTORIAL/);
  assert.match(styles, /\.tutorial-card/);
  assert.match(styles, /bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 112px\)/);
  assert.match(styles, /\.tutorial-highlight/);
});

test("reflows the tutorial above an expanded mobile AI squad", () => {
  assert.match(game, /tutorial-card--above-squad/);
  assert.match(
    game,
    /tutorial\.target === "agents" \|\| mobileSquadOpen/,
  );
  assert.match(styles, /\.tutorial-card--above-squad/);
  assert.match(
    styles,
    /\.tutorial-card--above-squad\s*\{\s*bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 278px\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\) and \(orientation: landscape\)[\s\S]*?\.tutorial-card--above-squad\s*\{\s*bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 230px\)/,
  );
});

test("keeps mobile draft labels and workshop bonuses readable", () => {
  assert.match(
    styles,
    /\.protocol-screen:not\(\.evolution-screen\) \.protocol-grid em\s*\{\s*display:\s*block;/,
  );
  assert.match(
    styles,
    /\.evolution-screen \.progression-grid p\s*\{\s*display:\s*block;/,
  );
});

test("starts the desktop evolution workshop at the top", () => {
  assert.match(
    styles,
    /\.protocol-screen\.evolution-screen\s*\{\s*justify-content:\s*flex-start;/,
  );
});
