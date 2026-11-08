import type { VkmaBridge } from "@vkma.dev/bridge";
import type { HostMode } from "./types";

function parseOverride(value: unknown): HostMode | undefined {
	return value === "fake" || value === "real" ? value : undefined;
}

function resolveHostMode(): HostMode {
	const queryOverride =
		typeof window === "undefined"
			? undefined
			: parseOverride(new URLSearchParams(window.location.search).get("vkma_host"));
	const envOverride = parseOverride(import.meta.env?.VITE_VKMA_HOST);
	const override = queryOverride ?? envOverride;
	if (override) {
		return override;
	}

	if (typeof window === "undefined") {
		return "fake";
	}

	// A signature and an app id distinguish a VK launch from an arbitrary iframe.
	const params = new URLSearchParams(window.location.search);
	const hasVkLaunchParams = params.has("sign") && params.has("vk_app_id");
	return hasVkLaunchParams && window.parent !== window ? "real" : "fake";
}

/** Query (`vkma_host`) wins over `VITE_VKMA_HOST`, then auto-detection. */
export const hostMode: HostMode = resolveHostMode();

const preparedBridges = new WeakSet<VkmaBridge>();

/**
 * VKUI's bridge hooks intentionally run only in embedded apps. Present the
 * standalone fake as an iframe without changing the bridge package itself.
 */
export function prepareBridgeForHost(bridge: VkmaBridge): void {
	if (hostMode !== "fake" || preparedBridges.has(bridge)) {
		return;
	}
	preparedBridges.add(bridge);
	bridge.isIframe = () => true;
	bridge.isEmbedded = () => true;
	bridge.isStandalone = () => false;
}
