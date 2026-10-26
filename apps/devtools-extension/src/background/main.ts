import { createHandler, type InferNamespace, initWERPC } from "werpc";
import { z } from "zod";
import { OPEN_SIDE_PANEL_MESSAGE } from "../shared/hosts.ts";

/**
 * The service worker: the werpc router (every non-SW context opens a port
 * and the SW routes point-to-point within the tab scope) plus the side
 * panel state machine — `sidePanel.open()` needs a user gesture, and
 * gestures only survive raw one-shot runtime messages, not ports.
 */
const werpc = initWERPC();

// --- side panel state --------------------------------------------------------

interface PanelChanged {
	open: boolean;
}

type PanelListener = (change: PanelChanged) => void;

const PANEL_TAB_PREFIX = "panelTab_";

const panelKey = (tabId: number) => `${PANEL_TAB_PREFIX}${tabId}`;

/** Tabs with a currently open tab-specific side panel. */
const openPanelTabs = new Set<number>();
const panelListeners = new Map<number, Set<PanelListener>>();

/**
 * The panel state must survive service worker restarts (the panel itself
 * does), so it is persisted in session storage and hydrated lazily.
 */
let hydrated = false;

const ensureHydrated = async () => {
	if (hydrated) {
		return;
	}

	hydrated = true;

	const storage = await chrome.storage.session.get(null);

	for (const key of Object.keys(storage)) {
		if (!key.startsWith(PANEL_TAB_PREFIX)) {
			continue;
		}

		const tabId = Number(key.slice(PANEL_TAB_PREFIX.length));

		if (!Number.isNaN(tabId)) {
			openPanelTabs.add(tabId);
		}
	}
};

const persistPanelTab = (tabId: number, open: boolean) => {
	if (open) {
		void chrome.storage.session.set({ [panelKey(tabId)]: true });
	} else {
		void chrome.storage.session.remove(panelKey(tabId));
	}
};

const emitPanelChanged = (tabId: number) => {
	const change: PanelChanged = { open: openPanelTabs.has(tabId) };
	for (const listener of panelListeners.get(tabId) ?? []) {
		listener(change);
	}
};

const setPanelTab = (tabId: number, open: boolean) => {
	persistPanelTab(tabId, open);
	openPanelTabs[open ? "add" : "delete"](tabId);
	emitPanelChanged(tabId);
};

const onPanelChanged = (tabId: number, listener: PanelListener): VoidFunction => {
	const listeners = panelListeners.get(tabId) ?? new Set<PanelListener>();
	listeners.add(listener);
	panelListeners.set(tabId, listeners);

	return () => {
		listeners.delete(listener);
	};
};

/**
 * A tab-specific panel (enabled per-tab via setOptions) hides on other
 * tabs, keeps its state and can be closed programmatically — a global
 * panel cannot. Firefox has no sidePanel API: the procedures guard on it.
 */
const hasSidePanel = typeof chrome.sidePanel !== "undefined";

const enableTabPanel = (tabId: number) =>
	chrome.sidePanel.setOptions({ tabId, path: "panel.html", enabled: true });

const closeTabPanel = async (tabId: number) => {
	await chrome.sidePanel.close({ tabId });
	setPanelTab(tabId, false);
};

/**
 * `sidePanel.open()` may only be called in response to a user gesture,
 * and the gesture does not survive awaits in the service worker: open()
 * must be the very first call. The panel is registered as tab-specific by
 * the host script in advance (setOptions needs no gesture), so opening it
 * does not create the global panel.
 */
const openTabPanelFromGesture = (tabId: number) => {
	if (!hasSidePanel) {
		return;
	}
	void chrome.sidePanel
		.open({ tabId })
		.then(() => setPanelTab(tabId, true))
		.catch((error: unknown) => console.warn("[vkma] open side panel failed:", error));
};

if (hasSidePanel) {
	// keep the default (global) panel disabled — a stale `enabled: true`
	// from an older build may persist in the profile
	void chrome.sidePanel.setOptions({ enabled: false }).catch((error: unknown) => {
		console.warn("[vkma] disabling the default side panel failed:", error);
	});
	void ensureHydrated();
}

// --- surfaces -----------------------------------------------------------------

chrome.action.onClicked.addListener(tab => {
	if (typeof tab.id !== "number") {
		return;
	}
	// The action icon is the "wide" surface: every watched tab at once —
	// the /__vkma/ standalone panel's counterpart.
	void chrome.tabs.create({ url: "panel.html?view=all" });
});

// NOTE: sidePanel.open() requires a user gesture, and gestures do not
// travel over long-lived werpc ports — only over one-shot runtime
// messages, which is why the panel page uses this raw channel instead of
// rpc (the click's gesture rides the one-shot; the tabId is explicit
// because extension pages have no sender.tab)
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
	if (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === OPEN_SIDE_PANEL_MESSAGE
	) {
		const explicit = (message as { tabId?: unknown }).tabId;
		const tabId =
			typeof explicit === "number"
				? explicit
				: typeof sender.tab?.id === "number" && sender.tab.id !== chrome.tabs.TAB_ID_NONE
					? sender.tab.id
					: undefined;
		if (tabId !== undefined) {
			openTabPanelFromGesture(tabId);
		}
	}
});

if (hasSidePanel) {
	chrome.sidePanel.onOpened.addListener(({ tabId }) => {
		if (tabId !== undefined && !openPanelTabs.has(tabId)) {
			setPanelTab(tabId, true);
		}
	});

	chrome.sidePanel.onClosed.addListener(({ tabId }) => {
		if (tabId !== undefined) {
			setPanelTab(tabId, false);
		}
	});
}

chrome.tabs.onRemoved.addListener(tabId => {
	if (openPanelTabs.has(tabId)) {
		setPanelTab(tabId, false);
	}
});

// --- rpc ------------------------------------------------------------------------

const handler = createHandler({
	namespace: "background",
	router: werpc.router({
		/** The host script's own tab id (content-script ports carry it in
		 * the sender; the FAB iframe URL needs it). */
		getTabId: werpc.procedure.query(({ ctx }) => ctx.tabId ?? null),

		/** The FAB enables the panel for its tab right when it loads, so
		 * the panel is already tab-specific by the time the user clicks
		 * the open button (setOptions needs no gesture, unlike open). */
		enableSidePanel: werpc.procedure.mutation(async ({ ctx }) => {
			if (!hasSidePanel || ctx.tabId === undefined) {
				return;
			}
			await enableTabPanel(ctx.tabId);
		}),

		isSidePanelOpen: werpc.procedure.query(async ({ ctx }) => {
			await ensureHydrated();
			return ctx.tabId !== undefined && openPanelTabs.has(ctx.tabId);
		}),

		closeSidePanel: werpc.procedure.mutation(async ({ ctx }) => {
			if (!hasSidePanel || ctx.tabId === undefined) {
				return;
			}
			await ensureHydrated();
			await closeTabPanel(ctx.tabId);
		}),

		sidePanelChanged: werpc.procedure.subscription(async function* ({ ctx, signal }) {
			if (ctx.tabId === undefined) {
				return;
			}

			const tabId = ctx.tabId;
			const abortSignal = signal ?? new AbortController().signal;

			await ensureHydrated();

			yield { open: openPanelTabs.has(tabId) } satisfies PanelChanged;

			while (!abortSignal.aborted) {
				await new Promise<void>(resolve => {
					const done = () => {
						unsubscribe();
						abortSignal.removeEventListener("abort", onAbort);
						resolve();
					};

					const unsubscribe = onPanelChanged(tabId, done);
					const onAbort = () => done();

					abortSignal.addEventListener("abort", onAbort);
				});

				if (abortSignal.aborted) {
					return;
				}

				yield { open: openPanelTabs.has(tabId) } satisfies PanelChanged;
			}
		}),

		/** Echo for panel contexts: verify the port plumbing works. */
		ping: werpc.procedure
			.input(z.object({ nonce: z.string() }))
			.query(({ input }) => input.nonce),
	}),
});

type BackgroundHandler = typeof handler;

declare module "werpc" {
	interface WERPCNamespaces extends InferNamespace<BackgroundHandler> {}
}
