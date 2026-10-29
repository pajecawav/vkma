import type { VkBridgeLike } from "./bridge-like.ts";

/**
 * Auto swipe-back management: the native gesture
 * (`VKWebAppEnableSwipeBack` / `VKWebAppSetSwipeSettings { history }`) is
 * enabled while the app can go back in its own history and disabled on the
 * first entry — where the system back must close the app. Unsupported
 * platforms (web) answer with error code 6; that is silenced, like the old
 * router did.
 *
 * Two manual layers on top of the automatic decision:
 * - `enabled: false` is a hard opt-out — the gesture is never enabled
 *   (an app that drives the gesture itself, or none at all);
 * - `setOverride(boolean)` — fed by `useEnableSwipeBack` — replaces the
 *   automatic decision while set; `null` returns to it.
 */

/** The one active manager — `useEnableSwipeBack` talks to the last created
 * one (a mini app has exactly one history). `destroy` unregisters. */
let activeManager: { setOverride(enabled: boolean | null): void } | null = null;

/** Manual override slot behind `useEnableSwipeBack`. */
export function setSwipeBackOverride(enabled: boolean | null): void {
	activeManager?.setOverride(enabled);
}

export interface SwipeBackManagerOptions {
	bridge: VkBridgeLike;
	history: {
		location: { state?: { __TSR_index?: number } };
		subscribe(listener: () => void): () => void;
	};
	/**
	 * Hard opt-out: the native gesture is never enabled, whatever the
	 * history position or an override says. Default `true`.
	 */
	enabled?: boolean;
}

export function createSwipeBackManager(options: SwipeBackManagerOptions): {
	destroy: () => void;
	/** Manual override — `null` returns to the automatic decision. */
	setOverride: (enabled: boolean | null) => void;
} {
	let lastEnabled: boolean | null = null;
	let override: boolean | null = null;

	const sync = (): void => {
		const index = options.history.location.state?.__TSR_index;
		const auto = index === undefined ? false : index > 0;
		const enabled = options.enabled === false ? false : (override ?? auto);
		if (enabled === lastEnabled) {
			return;
		}
		lastEnabled = enabled;
		void options.bridge.send("VKWebAppSetSwipeSettings", { history: enabled }).catch(() => {});
		void options.bridge
			.send(enabled ? "VKWebAppEnableSwipeBack" : "VKWebAppDisableSwipeBack")
			.catch(() => {});
	};

	sync();
	const unsubscribe = options.history.subscribe(sync);
	const manager = {
		setOverride: (enabled: boolean | null): void => {
			override = enabled;
			sync();
		},
	};
	activeManager = manager;
	return {
		setOverride: manager.setOverride,
		destroy: () => {
			unsubscribe();
			if (activeManager === manager) {
				activeManager = null;
			}
		},
	};
}
