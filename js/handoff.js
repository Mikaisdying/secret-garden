const PREFIX = "secret-garden.handoff.";
const MAX_AGE_MS = 30_000;
const inPreloadFrame = window.self !== window.top;

export function stashForGarden(name, value) {
  if (!inPreloadFrame) return;
  try {
    sessionStorage.setItem(PREFIX + name, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Storage blocked or over quota (stroke data can be large): the real page just fetches again.
  }
}

export function takeFromPreload(name) {
  if (inPreloadFrame) return undefined;
  try {
    const raw = sessionStorage.getItem(PREFIX + name);
    if (!raw) return undefined;
    sessionStorage.removeItem(PREFIX + name);
    const { at, value } = JSON.parse(raw);
    return Date.now() - at < MAX_AGE_MS ? value : undefined;
  } catch {
    return undefined;
  }
}
