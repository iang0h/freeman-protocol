import assert from "node:assert/strict";
import test from "node:test";

import {
  readStoredNumber,
  readStoredValue,
  writeStoredValue,
} from "../app/game/storage.mjs";

test("safe storage retains an in-memory value when browser storage throws", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const key = `storage-test-${Date.now()}`;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
  });
  try {
    assert.equal(readStoredNumber(key, 17), 17);
    writeStoredValue(key, "42");
    assert.equal(readStoredValue(key, "missing"), "42");
    assert.equal(readStoredNumber(key, 17), 42);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
