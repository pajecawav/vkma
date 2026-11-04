/**
 * The one extension-API entrypoint. Firefox's `chrome` namespace exists
 * as a porting aid but is callback-only; promises live on its native
 * `browser`; Chrome (pre-`browser`) exposes promise-based MV3 APIs on
 * `chrome`. Pick the promise-capable namespace at runtime and type it as
 * `chrome`: the shapes this extension uses are identical, and every
 * context (content scripts, the FAB iframe, panel pages, the event
 * page) provides the picked namespace.
 *
 * Route every extension-API call through `api`: in Firefox every
 * promise-style call on bare `chrome`
 * (`chrome.storage.local.get().then`, `await chrome.tabs.query`) dies
 * with `TypeError: ... is undefined`.
 */
export const api = (globalThis as { browser?: typeof chrome }).browser ?? chrome;

/** Firefox has no sidePanel API (and no side panel surface at all). */
export const sidePanelSupported = (): boolean => api.sidePanel !== undefined;
