/**
 * The timeline's ignored-events feature: a user-editable list of bridge
 * event names that stay out of the ledger. The model is two lists over a
 * frozen default set — `off` names disabled defaults (they come back when
 * re-enabled, and NEW defaults added in a later version reach existing
 * users, since defaults never get copied into storage), `extra` names
 * added on top. Everything is matched case-insensitively by exact name;
 * a request hides together with its paired response (the filter runs on
 * the group head), and a standalone event hides alone.
 */

/** The factory noise: fires on every scroll / viewport change / handshake
 * and drowns the dialogue the panel exists to show. */
export const DEFAULT_IGNORED_EVENTS: readonly string[] = [
	"VKWebAppScrollTop",
	"VKWebAppResizeWindow",
	"SetSupportedHandlers",
	"VKWebAppUpdateInsets",
	"VKWebAppUpdateConfig",
	"VKWebAppUpdateInfo",
];

export interface IgnoredEventsSettings {
	/** Bump on shape changes; parsers reject other versions to defaults. */
	v: 1;
	/** Master switch — the toolbar's eye toggle. */
	enabled: boolean;
	/** Disabled members of `DEFAULT_IGNORED_EVENTS` (kept for easy re-enable). */
	off: string[];
	/** User-added names, on top of the defaults. */
	extra: string[];
}

export const DEFAULT_IGNORED_SETTINGS: IgnoredEventsSettings = {
	v: 1,
	enabled: true,
	off: [],
	extra: [],
};

const asStringList = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set<string>();
	const names: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string" || entry === "") {
			continue;
		}
		const key = entry.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		names.push(entry);
	}
	return names;
};

/**
 * The storage decoder every surface shares: localStorage hands over a
 * string, chrome.storage an already-parsed value — both arrive here as
 * `unknown`. Anything unexpected (absent, corrupt JSON, a future version,
 * a hostile shape) degrades to the defaults instead of throwing through
 * the render. `off` entries that no default knows are dropped, so a
 * renamed default never haunts the settings.
 */
export function parseIgnoredSettings(raw: unknown): IgnoredEventsSettings {
	let value: unknown = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return { ...DEFAULT_IGNORED_SETTINGS };
		}
	}
	if (typeof value !== "object" || value === null) {
		return { ...DEFAULT_IGNORED_SETTINGS };
	}
	const record = value as Record<string, unknown>;
	if (record["v"] !== 1) {
		return { ...DEFAULT_IGNORED_SETTINGS };
	}
	const defaults = new Set(DEFAULT_IGNORED_EVENTS.map(name => name.toLowerCase()));
	return {
		v: 1,
		enabled: typeof record["enabled"] === "boolean" ? record["enabled"] : true,
		off: asStringList(record["off"]).filter(name => defaults.has(name.toLowerCase())),
		extra: asStringList(record["extra"]),
	};
}

/** The effective hide set: enabled defaults minus `off`, plus `extra` —
 * lowercased, so the timeline matches case-insensitively. */
export function resolveIgnoredNames(settings: IgnoredEventsSettings): ReadonlySet<string> {
	const off = new Set(settings.off.map(name => name.toLowerCase()));
	const names = DEFAULT_IGNORED_EVENTS.filter(name => !off.has(name.toLowerCase()));
	return new Set([...names, ...settings.extra].map(name => name.toLowerCase()));
}

/** Force-ignore one name — what both the row button and the editor's add
 * field mean. A disabled default is re-enabled (adding it back), anything
 * else joins `extra`; a no-op when the name is already ignored. */
export function ignoreName(
	settings: IgnoredEventsSettings,
	rawName: string,
): IgnoredEventsSettings {
	const name = rawName.trim();
	if (name === "") {
		return settings;
	}
	const lower = name.toLowerCase();
	if (DEFAULT_IGNORED_EVENTS.some(defaultName => defaultName.toLowerCase() === lower)) {
		return { ...settings, off: settings.off.filter(off => off.toLowerCase() !== lower) };
	}
	if (settings.extra.some(extra => extra.toLowerCase() === lower)) {
		return settings;
	}
	return { ...settings, extra: [...settings.extra, name] };
}
