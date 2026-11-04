import bridge, { parseURLSearchParamsForGetLaunchParams } from "@vkma.dev/bridge";
import type { ConfigProviderProps } from "@vkontakte/vkui";
import { AdaptivityProvider, AppRoot, ConfigProvider } from "@vkontakte/vkui";
import type { ReactElement, ReactNode } from "react";
import { useBridgeAdaptivity, useBridgeAppearance, useBridgeInsets } from "./hooks.ts";
import { transformVKBridgeAdaptivity } from "./transform.ts";

/**
 * Every prop of `ConfigProvider` is a bridge-computed default here; anything
 * the app passes explicitly wins over the computed value.
 */
export interface VKBridgeConfigProviderProps extends Partial<ConfigProviderProps> {
	children: ReactNode;
}

/**
 * The preassembled VKUI shell for a VK Mini App: the VKUI config wired to
 * `@vkma.dev/bridge` (theme out of `VKWebAppUpdateConfig`, `vk_platform` out
 * of the launch params, webview flag, and the reserved PanelHeader corner for
 * the host's own controls), then `AdaptivityProvider` fed from the host's
 * adaptivity verdict and `AppRoot(idiomatic mode="full")` carrying the host's
 * safe-area insets.
 */
export function VKBridgeConfigProvider(props: VKBridgeConfigProviderProps): ReactElement {
	const { children, ...overrides } = props;
	const colorScheme = useBridgeAppearance();
	const adaptivity = transformVKBridgeAdaptivity(useBridgeAdaptivity());
	const insets = useBridgeInsets();
	const { vk_platform } = parseURLSearchParamsForGetLaunchParams(window.location.search);

	return (
		<ConfigProvider
			colorScheme={colorScheme}
			platform={vk_platform === "desktop_web" ? "vkcom" : undefined}
			isWebView={bridge.isWebView()}
			hasCustomPanelHeaderAfter
			{...overrides}
		>
			<AdaptivityProvider {...adaptivity}>
				<AppRoot mode="full" safeAreaInsets={insets}>
					{children}
				</AppRoot>
			</AdaptivityProvider>
		</ConfigProvider>
	);
}
