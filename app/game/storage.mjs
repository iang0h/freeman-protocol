const memoryStorage = new Map();

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function readStoredValue(key, fallback = null) {
  if (memoryStorage.has(key)) return memoryStorage.get(key);
  try {
    const value = browserStorage()?.getItem(key);
    if (value !== null && value !== undefined) return value;
  } catch {}
  return memoryStorage.get(key) ?? fallback;
}

export function writeStoredValue(key, value) {
  memoryStorage.set(key, value);
  try {
    browserStorage()?.setItem(key, value);
  } catch {}
}

export function readStoredNumber(key, fallback = 0) {
  const value = Number(readStoredValue(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}
