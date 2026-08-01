import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, game, page, styles] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/FreemanProtocol.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(game, /aria-expanded=\{mobilePanel === "command" && mobileSquadOpen\}/);
  assert.match(
    styles,
    /\.agent-dock:not\(\.is-mobile-open\) \.squad-commands/,
  );
  assert.match(styles, /\.camera-panel\s*\{\s*display:\s*none;/);
});

test("uses one active mobile command tray at a time", () => {
  assert.match(game, /type MobilePanel = "command" \| "defend" \| "skills"/);
  assert.match(game, /const \[mobilePanel, setMobilePanel\] = useState<MobilePanel \| "closed">\("closed"\)/);
  assert.match(game, /mobile-panel-switcher/);
  assert.match(game, /aria-pressed=\{mobilePanel === panel\}/);
  assert.match(game, /\["command", "COMMAND"\]/);
  assert.match(game, /\["defend", "DEFEND"\]/);
  assert.match(game, /\["skills", "SKILLS"\]/);
  assert.match(styles, /\.mobile-panel--inactive/);
});

test("keeps commander mode available without opening it by default", () => {
  assert.match(game, /type MobilePanel = "command" \| "defend" \| "skills"/);
  assert.match(game, /const \[mobilePanel, setMobilePanel\] = useState<MobilePanel \| "closed">\("closed"\)/);
  assert.match(game, /COMMAND/);
  assert.match(game, /RECRUIT|RECRUIT AGENT/);
  assert.match(game, /FIGHTING|GATHERING|REPAIRING|OFFLINE/);
  assert.match(styles, /\.commander-actions/);
  assert.match(game, /THE CORE IS YOUR WIN CONDITION/);
  assert.match(game, /AGENTS FIGHT AUTOMATICALLY/);
  assert.match(game, /AGENTS GATHER MATERIALS/);
  assert.match(game, /REPAIR OFFLINE AGENTS/);
  assert.match(game, /UPGRADE BETWEEN WAVES/);
});

test("offers macro and tactical camera presentation controls", () => {
  assert.match(game, /mobile-camera-toggle/);
  assert.match(game, /MACRO MAP/);
  assert.match(game, /TACTICAL VIEW/);
  assert.match(styles, /\.mobile-camera-toggle/);
});

test("keeps commander mode compact until the roster is explicitly opened", () => {
  assert.match(game, /const \[mobileSquadOpen, setMobileSquadOpen\] = useState\(false\)/);
  assert.match(
    styles,
    /\.agent-dock\.mobile-panel--command\.is-mobile-open \.agent-grid/,
  );
  assert.match(
    styles,
    /\.agent-dock\.mobile-panel--command:not\(\.is-mobile-open\) \.agent-grid[\s\S]*display:\s*none/,
  );
});

test("removes redundant objective and joystick presentation", () => {
  assert.doesNotMatch(game, /objective-banner/);
  assert.doesNotMatch(game, /mobile-objective-card/);
  assert.doesNotMatch(game, /function VirtualStick/);
  assert.doesNotMatch(game, /className="virtual-stick/);
  assert.doesNotMatch(styles, /\.virtual-stick/);
});

test("keeps commander-only controls out of the desktop warband dock", () => {
  assert.match(styles, /\.commander-actions,\s*\.commander-explainer\s*\{\s*display:\s*none/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.commander-actions\s*\{\s*display:\s*grid/);
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

test("keeps recruitment advice readable and touch-safe beside Warband", () => {
  assert.match(page, /className=\{`recruitment-advisor recruitment-advisor--\$\{recruitmentAdvice\.state\}`\}/);
  assert.match(game, /className="combat-hud__advisor"/);
  assert.match(styles, /\.recruitment-advisor\s*\{/);
  assert.match(
    styles,
    /\.recruitment-advisor__action\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?touch-action:\s*manipulation/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.combat-hud__advisor\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top\) \+ 145px\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.recruitment-advisor\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.recruitment-advisor__resources dt\s*\{[\s\S]*?font-size:\s*12px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.recruitment-advisor__resources dd\s*\{[\s\S]*?font-size:\s*16px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.mobile-camera-toggle\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top\) \+ 278px\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.boss-health-banner,[\s\S]*?\.mission-toast\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top\) \+ 332px\)/,
  );
});

test("limits live mobile status to combat vitals, zone, and one alert", () => {
  const status = game.match(
    /<aside className="mobile-status-strip"[\s\S]*?<\/aside>/,
  )?.[0] ?? "";

  assert.match(status, /<small>HP<\/small>/);
  assert.match(status, /<small>CORE<\/small>/);
  assert.match(status, /<small>WAVE<\/small>/);
  assert.match(status, /<small>ZONE<\/small>/);
  assert.match(status, /<small>ALERT<\/small>/);
  assert.match(status, /hud\.currentZone/);
  assert.match(status, /hud\.threat/);
  assert.doesNotMatch(status, /<small>COMPUTE<\/small>/);
  assert.doesNotMatch(status, /<small>EMP<\/small>/);
});

test("keeps mobile type readable and removes secondary overlay telemetry", () => {
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.intel-overlay \.secondary-telemetry/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.mobile-status-strip small\s*\{[\s\S]*?font-size:\s*12px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.mobile-status-strip strong\s*\{[\s\S]*?font-size:\s*16px/,
  );
  assert.match(
    styles,
    /\.intel-overlay \.secondary-telemetry,\s*\.warband-overlay \.agent-metrics\s*\{\s*display:\s*none;/,
  );
  assert.match(game, /className="resource-grid secondary-telemetry"/);
  assert.match(game, /className="progression-telemetry secondary-telemetry"/);
  assert.match(game, /className="agent-metrics"/);
});

test("keeps the Intel overlay reachable on mobile", () => {
  assert.match(
    game,
    /className=\{`vitals-panel intel-overlay \$\{overlayState\.active === "intel" \? "is-active" : ""\}`\}/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 820px\)\s*\{\s*\.vitals-panel\s*\{\s*display:\s*none;/,
  );
  assert.match(
    styles,
    /\.vitals-panel\.intel-overlay:not\(\.is-active\)\s*\{\s*display:\s*none;/,
  );
  assert.match(
    styles,
    /\.vitals-panel\.intel-overlay\.is-active\s*\{[\s\S]*?display:\s*grid/,
  );
});

test("applies the compact status rules through the 820px mobile boundary", () => {
  assert.doesNotMatch(styles, /@media \(max-width: 760px\)/);
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)[\s\S]*?min-height:\s*52px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\) and \(orientation: landscape\)[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
  );
});

test("gives Watch Mode its own compact mobile spectator surface", () => {
  assert.match(game, /hud\.sessionMode === "watch"/);
  assert.match(
    styles,
    /\.game-shell:has\(\.watch-panel\) \.combat-hud__advisor,[\s\S]*?\.game-shell:has\(\.watch-panel\) \.mobile-action-tray,[\s\S]*?display:\s*none !important/,
  );
  assert.match(
    styles,
    /\.game-shell:has\(\.watch-panel\) \.watch-panel\s*\{[\s\S]*?bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 10px\)[\s\S]*?max-height:\s*min\(28dvh, 220px\)/,
  );
  assert.match(
    styles,
    /\.game-shell:has\(\.watch-panel\) \.watch-panel__metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/,
  );
});

test("shows exactly one full-width mobile tray while the roster stays collapsed", () => {
  assert.match(
    styles,
    /\.mobile-action-tray\.mobile-panel--inactive\s*\{[\s\S]*?display:\s*none !important/,
  );
  assert.match(
    styles,
    /\.mobile-action-tray\.mobile-panel--active\s*\{[\s\S]*?left:\s*10px[\s\S]*?right:\s*10px/,
  );
  assert.match(
    styles,
    /\.mobile-action-tray button\s*\{[\s\S]*?min-height:\s*48px/,
  );
  assert.match(
    styles,
    /\.agent-dock\.mobile-panel--command:not\(\.is-mobile-open\) \.agent-grid[\s\S]*?display:\s*none/,
  );
});

test("keeps the default mobile arena clear of advisor and command detail panels", () => {
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.recruitment-advisor__reason,[\s\S]*?\.recruitment-advisor__watch,[\s\S]*?\.recruitment-advisor__resources\s*\{[\s\S]*?display:\s*none/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.agent-dock\.mobile-panel--command:not\(\.is-mobile-open\) \.commander-actions\s*\{[\s\S]*?display:\s*none/,
  );
});

test("keeps portrait and landscape combat notices clear of the larger status strip", () => {
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 760px\) and \(orientation: landscape\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*?\.boss-health-banner,[\s\S]*?\.wave-intermission-banner,[\s\S]*?\.placement-guide,[\s\S]*?\.mission-toast\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top\) \+ 332px\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\) and \(orientation: landscape\)[\s\S]*?\.mobile-status-strip\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)[\s\S]*?\.mobile-status-strip__alert\s*\{[\s\S]*?grid-column:\s*auto/,
  );
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
    /className=\{`agent-dock mobile-action-tray mobile-panel--command/,
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

test("keeps the temporary reserve army action touch-safe", () => {
  assert.match(game, /DEPLOY RESERVE/);
  assert.match(styles, /\.commander-actions button[\s\S]*touch-action:\s*manipulation/);
  assert.match(game, /hud\.loot\.components < 3 \|\| hud\.loot\.shards < 3/);
});

test("raises mobile HUD text to readable touch sizes", () => {
  assert.match(styles, /\.mobile-status-strip strong[\s\S]*font-size:\s*16px/);
  assert.match(styles, /\.mobile-panel-switcher button[\s\S]*font-size:\s*10px/);
  assert.match(styles, /\.commander-actions button[\s\S]*font-size:\s*8px/);
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
  assert.match(game, /className=\{`repair-field-kit mobile-action-tray mobile-panel--defend/);
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
