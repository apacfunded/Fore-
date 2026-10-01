// Callouts must be pump.fun links. Shared by the browser and the server.
export const CALLOUT_RE = /^https:\/\/(www\.)?pump\.fun\/\S+$/i;
export const HANDLE_RE = /^@?[A-Za-z0-9_]{2,20}$/;
export const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Trims and tidies a callout link so trivial variations count as the same link. */
export function normalizeCallout(url: string) {
  try {
    const u = new URL(url.trim());
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}
