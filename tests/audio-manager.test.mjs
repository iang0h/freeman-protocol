import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

import { writeStoredValue } from "../app/game/storage.mjs";

const audioManagerPath = new URL("../app/game/AudioManager.ts", import.meta.url);
const playlistPath = new URL("../app/game/playlist.mjs", import.meta.url).href;
const storagePath = new URL("../app/game/storage.mjs", import.meta.url).href;
const source = await readFile(audioManagerPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
  .replaceAll('"./playlist.mjs"', `"${playlistPath}"`)
  .replaceAll('"./storage.mjs"', `"${storagePath}"`);
const { AudioManager, getStoredAudioSettings } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

function createAudioTestManager({ playRejects = false } = {}) {
  let rejectPlayback = playRejects;

  class FakeAudio {
    constructor() {
      this.src = "";
      this.preload = "";
      this.duration = Number.POSITIVE_INFINITY;
      this.currentTime = 0;
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
      );
    }

    load() {}

    play() {
      return rejectPlayback
        ? Promise.reject(new Error("Autoplay blocked"))
        : Promise.resolve();
    }

    pause() {}

    removeAttribute() {}
  }

  const makeNode = () => ({
    gain: { value: 0, setTargetAtTime() {} },
    connect(target) { return target; },
    disconnect() {},
  });
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = makeNode();
    }

    createGain() { return makeNode(); }
    createDynamicsCompressor() { return makeNode(); }
    createMediaElementSource() { return makeNode(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  globalThis.Audio = FakeAudio;
  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = () => 0;

  return {
    manager: new AudioManager(),
    setPlayRejects(value) {
      rejectPlayback = value;
    },
  };
}

test("audio settings snapshot reflects persisted mute and volume values", () => {
  writeStoredValue("freeman-audio-muted", "true");
  writeStoredValue("freeman-music-volume", "0.25");
  writeStoredValue("freeman-sfx-volume", "0.72");
  const { manager } = createAudioTestManager();

  assert.deepEqual(manager.getSettings(), {
    muted: true,
    musicVolume: 0.25,
    sfxVolume: 0.72,
    playback: "idle",
  });
});

test("stored audio settings can hydrate React before an engine creates Audio players", () => {
  writeStoredValue("freeman-audio-muted", "true");
  writeStoredValue("freeman-music-volume", "0.3");
  writeStoredValue("freeman-sfx-volume", "0.6");

  assert.deepEqual(getStoredAudioSettings(), {
    muted: true,
    musicVolume: 0.3,
    sfxVolume: 0.6,
    playback: "idle",
  });
});

test("audio settings subscribers observe blocked playback and its retry", async () => {
  writeStoredValue("freeman-audio-muted", "false");
  writeStoredValue("freeman-music-volume", "0.42");
  writeStoredValue("freeman-sfx-volume", "0.72");
  const { manager, setPlayRejects } = createAudioTestManager({ playRejects: true });
  const snapshots = [];
  const unsubscribe = manager.subscribe((settings) => snapshots.push(settings));

  manager.startMusic();
  await Promise.resolve();
  assert.equal(manager.getSettings().playback, "blocked");
  assert.equal(snapshots.at(-1).playback, "blocked");

  setPlayRejects(false);
  manager.enableAudio();
  await Promise.resolve();
  assert.equal(manager.getSettings().playback, "playing");
  assert.equal(snapshots.at(-1).playback, "playing");
  unsubscribe();
});
