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
  assert.match(game, /aria-expanded=\{mobileSquadOpen\}/);
  assert.match(
    styles,
    /\.agent-dock:not\(\.is-mobile-open\) \.squad-commands/,
  );
  assert.match(styles, /\.camera-panel\s*\{\s*display:\s*none;/);
});

test("pulls the camera back for portrait play", () => {
  assert.match(game, /const portraitPullback/);
  assert.match(game, /aspect < 0\.58 \? 1\.5/);
});

test("keeps both sentry deployment actions available on mobile", () => {
  assert.match(game, /base-builder__manual/);
  assert.match(styles, /\.base-builder__manual/);
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
