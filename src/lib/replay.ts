/** Hand-off of a history row's settings to the tool that will re-run it. */

const KEY_PREFIX = 'pdfstudio.replay.v1.';

export function saveReplay(tool: string, params: Record<string, unknown>): void {
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${tool}`, JSON.stringify(params));
  } catch {
    // Storage can be unavailable; replay is a convenience only.
  }
}

export function takeReplay<T>(tool: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(`${KEY_PREFIX}${tool}`);
    if (raw === null) return null;
    window.sessionStorage.removeItem(`${KEY_PREFIX}${tool}`);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
