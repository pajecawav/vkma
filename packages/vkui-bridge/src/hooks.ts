import bridge from "@vkma.dev/bridge";
import type { VKBridgeEvent } from "@vkma.dev/bridge";
import type { ColorSchemeType, SafeAreaInsets } from "@vkontakte/vkui";
import { useEffect, useLayoutEffect, useState } from "react";
import {
	resolveAdaptivity,
	resolveAppearance,
	resolveInsets,
	type BridgeAdaptivity,
	type BridgeConfigData,
} from "./config.ts";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Appearance straight from the host, only while EMBEDDED (inside a webview
 * or hosting frame; a plain browser owns its system theme, the VKUI default
 * is `undefined` there): streamed from `VKWebAppUpdateConfig` and
 * bootstrapped with a `VKWebAppGetConfig` round trip (`useAppearance` parity).
 */
export function useBridgeAppearance(): ColorSchemeType | undefined {
	const [appearance, setAppearance] = useState<ColorSchemeType | null>(null);
	useIsomorphicLayoutEffect(() => {
		if (!bridge.isEmbedded()) {
			return;
		}
		const updateAppearance = (data: BridgeConfigData): void => {
			const next = resolveAppearance(data);
			if (next !== null) {
				setAppearance(next);
			}
		};
		const handleBridgeEvent = (event: VKBridgeEvent): void => {
			const data = event.detail.data as BridgeConfigData;
			if (
				event.detail.type !== "VKWebAppUpdateConfig" ||
				!("appearance" in data) ||
				!("scheme" in data)
			) {
				return;
			}
			updateAppearance(data);
		};
		const unsubscribe = bridge.subscribe(handleBridgeEvent);
		bridge
			.send("VKWebAppGetConfig")
			.then(data => updateAppearance(data as BridgeConfigData))
			.catch(error => console.error(error));
		return unsubscribe;
	}, []);
	return appearance ?? undefined;
}

/**
 * Safe-area insets straight from the host, streamed from
 * `VKWebAppUpdateInsets` (and config-carrying insets, see `resolveInsets`),
 * ready for `AppRoot`'s `safeAreaInsets` (`useInsets` parity; no embed
 * gate, VKUI itself decides what to do with the absence).
 */
export function useBridgeInsets(): SafeAreaInsets | undefined {
	const [insets, setInsets] = useState<SafeAreaInsets | null>(null);
	useIsomorphicLayoutEffect(() => {
		const handleBridgeEvent = (event: VKBridgeEvent): void => {
			const insets = resolveInsets(event);
			if (insets !== null) {
				setInsets(insets);
			}
		};
		return bridge.subscribe(handleBridgeEvent);
	}, []);
	return insets ?? undefined;
}

const INITIAL_ADAPTIVITY: BridgeAdaptivity = { type: null, viewportWidth: 0, viewportHeight: 0 };

/**
 * Host's adaptivity verdict, streamed in with every `VKWebAppUpdateConfig`
 * and bootstrapped with `VKWebAppGetConfig`, holding the last received
 * values. Feed it to `transformVKBridgeAdaptivity` and `AdaptivityProvider`
 * (`useAdaptivity` parity).
 */
export function useBridgeAdaptivity(): BridgeAdaptivity {
	const [bridgeAdaptivity, setBridgeAdaptivity] = useState<BridgeAdaptivity>(INITIAL_ADAPTIVITY);
	useIsomorphicLayoutEffect(() => {
		const updateAdaptivity = (data: BridgeConfigData): void => {
			if (!("viewport_width" in data) || !("viewport_height" in data)) {
				return;
			}
			setBridgeAdaptivity(resolveAdaptivity(data));
		};
		const handleBridgeEvent = (event: VKBridgeEvent): void => {
			const data = event.detail.data as BridgeConfigData;
			if (event.detail.type !== "VKWebAppUpdateConfig") {
				return;
			}
			updateAdaptivity(data);
		};
		const unsubscribe = bridge.subscribe(handleBridgeEvent);
		bridge
			.send("VKWebAppGetConfig")
			.then(data => updateAdaptivity(data as BridgeConfigData))
			.catch(error => console.error(error));
		return unsubscribe;
	}, []);
	return bridgeAdaptivity;
}
