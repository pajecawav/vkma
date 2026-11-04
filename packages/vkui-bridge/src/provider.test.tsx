import { useConfigProvider } from "@vkontakte/vkui";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VKBridgeConfigProvider, type VKBridgeConfigProviderProps } from "./provider.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ProbeConfig = ReturnType<typeof useConfigProvider>;

const state = vi.hoisted(() => ({
	isWebView: false,
	isEmbedded: true,
	getConfigResult: {} as unknown,
	launchParams: {} as Record<string, unknown>,
}));

vi.mock("@vkma.dev/bridge", () => ({
	default: {
		isWebView: () => state.isWebView,
		isEmbedded: () => state.isEmbedded,
		subscribe: () => () => {},
		unsubscribe: () => {},
		send: () => Promise.resolve(state.getConfigResult),
	},
	parseURLSearchParamsForGetLaunchParams: () => state.launchParams,
}));

async function renderProvider({
	props,
}: {
	props?: Omit<VKBridgeConfigProviderProps, "children">;
}): Promise<{
	readConfig: () => ProbeConfig | undefined;
	unmount: () => void;
}> {
	let capturedConfig: ProbeConfig | undefined;
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	const Probe = (): null => {
		capturedConfig = useConfigProvider();
		return null;
	};

	act(() => {
		root.render(
			createElement(VKBridgeConfigProvider, {
				...props,
				children: createElement(Probe),
			}),
		);
	});
	// the VKWebAppGetConfig round trip
	await act(async () => {});

	return {
		readConfig: () => capturedConfig,
		unmount: () => {
			act(() => root.unmount());
			container.remove();
		},
	};
}

beforeEach(() => {
	state.isWebView = false;
	state.isEmbedded = true;
	state.getConfigResult = {};
	state.launchParams = {};
});

describe("VKBridgeConfigProvider", () => {
	it("feeds the shell with the host config", async () => {
		state.getConfigResult = { appearance: "dark", scheme: "space_gray" };
		state.launchParams = { vk_platform: "desktop_web" };
		state.isWebView = true;

		const { readConfig, unmount } = await renderProvider({});
		const config = readConfig();

		expect(config?.colorScheme).toBe("dark");
		expect(config?.platform).toBe("vkcom");
		expect(config?.isWebView).toBe(true);
		expect(config?.hasCustomPanelHeaderAfter).toBe(true);
		unmount();
	});

	it("honors explicit props over the computed ones", async () => {
		state.getConfigResult = { appearance: "dark", scheme: "space_gray" };

		const { readConfig, unmount } = await renderProvider({ props: { colorScheme: "light" } });

		expect(readConfig()?.colorScheme).toBe("light");
		unmount();
	});
});
