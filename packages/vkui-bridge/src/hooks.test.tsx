import type { VKBridgeEvent } from "@vkma.dev/bridge";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBridgeAdaptivity, useBridgeAppearance, useBridgeInsets } from "./hooks.ts";

const state = vi.hoisted(() => ({
	listeners: [] as Array<(event: VKBridgeEvent) => void>,
	isEmbedded: true,
	sendResults: new Map<string, unknown>(),
	sends: [] as string[],
}));

vi.mock("@vkma.dev/bridge", () => ({
	default: {
		subscribe: (listener: (event: VKBridgeEvent) => void) => {
			state.listeners.push(listener);
			return () => {
				state.listeners = state.listeners.filter(other => other !== listener);
			};
		},
		unsubscribe: () => {},
		isEmbedded: () => state.isEmbedded,
		send: (name: string) => {
			state.sends.push(name);
			return Promise.resolve(state.sendResults.get(name) ?? {});
		},
	},
}));

const emit = (type: string, data: unknown): void => {
	act(() => {
		for (const listener of state.listeners) {
			listener({ detail: { type, data } } as VKBridgeEvent);
		}
	});
};

const flushMicrotasks = (): Promise<void> => act(async () => {});

function renderHook<Returned>(valueProvider: () => Returned): {
	current: Returned | undefined;
	unmount: () => void;
} {
	let current: Returned | undefined;

	const Probe = (): null => {
		current = valueProvider();
		return null;
	};

	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(createElement(Probe, {}));
	});
	return {
		get current() {
			return current;
		},
		unmount: () => {
			act(() => root.unmount());
			container.remove();
		},
	};
}

beforeEach(() => {
	state.listeners.length = 0;
	state.sends.length = 0;
	state.isEmbedded = true;
	state.sendResults.clear();
});

describe("useBridgeAppearance", () => {
	it("streams config events while embedded", () => {
		const hook = renderHook(useBridgeAppearance);
		expect(hook.current).toBeUndefined();
		expect(state.sends).toContain("VKWebAppGetConfig");

		emit("VKWebAppUpdateConfig", { scheme: "space_gray", appearance: undefined });
		expect(hook.current).toBe("dark");

		emit("VKWebAppUpdateConfig", { appearance: "light", scheme: "space_gray" });
		expect(hook.current).toBe("light");
	});

	it("ignores config events without both keys", () => {
		const hook = renderHook(useBridgeAppearance);
		emit("VKWebAppUpdateConfig", { scheme: "space_gray" });
		expect(hook.current).toBeUndefined();
	});

	it("stays out of plain browsers", () => {
		state.isEmbedded = false;
		const hook = renderHook(useBridgeAppearance);
		emit("VKWebAppUpdateConfig", { appearance: "dark", scheme: "space_gray" });
		expect(hook.current).toBeUndefined();
		expect(state.sends).not.toContain("VKWebAppGetConfig");
		expect(state.listeners).toHaveLength(0);
	});

	it("unsubscribes on unmount", () => {
		const hook = renderHook(useBridgeAppearance);
		hook.unmount();
		expect(state.listeners).toHaveLength(0);
	});
});

describe("useBridgeInsets", () => {
	it("insets from either source", () => {
		const hook = renderHook(useBridgeInsets);
		emit("VKWebAppUpdateInsets", { insets: { top: 24, left: 0, right: 0, bottom: 8 } });
		expect(hook.current).toEqual({ top: 24, left: 0, right: 0, bottom: 8 });
		emit("VKWebAppUpdateConfig", { insets: { bottom: 12 } });
		expect(hook.current).toEqual({ bottom: 12 });
	});

	it("clamps the keyboard", () => {
		const hook = renderHook(useBridgeInsets);
		emit("VKWebAppUpdateInsets", { insets: { bottom: 200 } });
		expect(hook.current).toEqual({ bottom: 0 });
	});

	it("ignores unrelated events", () => {
		const hook = renderHook(useBridgeInsets);
		emit("VKWebAppLocationChanged", { location: "/" });
		expect(hook.current).toBeUndefined();
	});
});

describe("useBridgeAdaptivity", () => {
	it("bootstraps from VKWebAppGetConfig", async () => {
		state.sendResults.set("VKWebAppGetConfig", {
			adaptivity: "adaptive",
			viewport_width: 1400,
			viewport_height: 820,
		});
		const hook = renderHook(useBridgeAdaptivity);
		await flushMicrotasks();
		expect(hook.current).toEqual({
			type: "adaptive",
			viewportWidth: 1400,
			viewportHeight: 820,
		});
	});

	it("streams config events", () => {
		const hook = renderHook(useBridgeAdaptivity);
		emit("VKWebAppUpdateConfig", {
			adaptivity: "force_mobile_compact",
			viewport_width: 10,
			viewport_height: 10,
		});
		expect(hook.current).toEqual({
			type: "force_mobile_compact",
			viewportWidth: 10,
			viewportHeight: 10,
		});
	});

	it("bails on configs without a viewport", () => {
		const hook = renderHook(useBridgeAdaptivity);
		emit("VKWebAppUpdateConfig", { scheme: "space_gray", appearance: "dark" });
		expect(hook.current).toEqual({ type: null, viewportWidth: 0, viewportHeight: 0 });
	});
});
