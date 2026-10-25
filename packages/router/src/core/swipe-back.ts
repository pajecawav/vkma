import type { VkBridgeLike } from "./bridge-like.ts";

/**
 * Auto swipe-back management: the native gesture
 * (`VKWebAppEnableSwipeBack` / `VKWebAppSetSwipeSettings { history }`) is
 * enabled while the app can go back in its own history and disabled on the
 * first entry — where the system back must close the app. Unsupported
 * platforms (web) answer with error code 6; that is silenced, like the old
 * router did.
 */

export interface SwipeBackManagerOptions {
	bridge: VkBridgeLike;
	history: {
		location: { state?: { __TSR_index?: number } };
		subscribe(listener: () => void): () => void;
	};
}

export function createSwipeBackManager(options: SwipeBackManagerOptions): {
	destroy(): void;
} {
	let lastEnabled: boolean | null = null;

	const sync = (): void => {
		const index = options.history.location.state?.__TSR_index;
		const enabled = index === undefined ? false : index > 0;
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
	return {
		destroy() {
			unsubscribe();
		},
	};
}
