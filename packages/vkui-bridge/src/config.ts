import type { VKBridgeEvent } from "@vkma.dev/bridge";
import type { ColorSchemeType, SafeAreaInsets } from "@vkontakte/vkui";

/**
 * The fields the host may put into a config-shaped payload: incoming
 * `VKWebAppUpdateConfig` / `VKWebAppGetConfig` results / `VKWebAppUpdateInsets`
 * and outgoing... no — read-only overlap. Each field is optional because hosts
 * differ by platform (iOS sends insets + scheme in the config, web sends
 * appearance separately, and the adaptivity pass only lives in mobile hosts).
 */
export interface BridgeConfigData {
	/** Legacy scheme name (`bright_light`, `space_gray`, `vkcom_dark`, ...). */
	scheme?: string;
	/** Modern appearance — preferred over `scheme` when present. */
	appearance?: ColorSchemeType;
	/** Screen insets against the host chrome (present in webviews). */
	insets?: Partial<SafeAreaInsets>;
	/** Adaptivity directive: `adaptive`, `force_mobile`, `force_mobile_compact`. */
	adaptivity?: string;
	/** Host viewport at adaptivity change time. */
	viewport_width?: number;
	viewport_height?: number;
}

/** The `VKWebAppUpdateConfig`-sourced adaptivity, in the host's vocabulary. */
export interface BridgeAdaptivity {
	type: "adaptive" | "force_mobile" | "force_mobile_compact" | null;
	viewportWidth: number;
	viewportHeight: number;
}

const DARK_SCHEMES = new Set(["space_gray", "vkcom_dark"]);

/**
 * Appearance (`VKWebAppUpdateConfig` payload → VKUI's ColorSchemeType) — the
 * modern `appearance` field wins, the legacy name is mapped, anything unknown
 * is `light` (`vk-bridge-react`'s `resolveAppearance` parity).
 */
export function resolveAppearance(data: BridgeConfigData): ColorSchemeType | null {
	if (data.appearance) {
		return data.appearance;
	}
	return data.scheme !== undefined && DARK_SCHEMES.has(data.scheme) ? "dark" : "light";
}

/**
 * Host's adaptivity directive → the raw bridge adaptivity. `type` stays
 * `null` for anything unknown; every received viewport is preserved as-is
 * so first-paint measurements are never clobbered (`useAdaptivity` parity).
 */
export function resolveAdaptivity(data: BridgeConfigData): BridgeAdaptivity {
	const type = data.adaptivity;
	return {
		type:
			type === "adaptive" || type === "force_mobile" || type === "force_mobile_compact"
				? type
				: null,
		viewportWidth: Number.isFinite(data.viewport_width) ? Number(data.viewport_width) : 0,
		viewportHeight: Number.isFinite(data.viewport_height) ? Number(data.viewport_height) : 0,
	};
}

/** Height of the virtual keyboard — insets above this are the host's keyboard, not layout. */
const VIRTUAL_KEYBOARD_HEIGHT = 150;

/**
 * `VKWebAppUpdateInsets` / `VKWebAppUpdateConfig` payload → `AppRoot`
 * safe-area insets. Both event sources carry an `insets` field; a bottom
 * already beyond the keyboard's ceiling is clamped to zero so the layout
 * doesn't absorb the transient keyboard (`useInsets` parity).
 */
export function resolveInsets(event: VKBridgeEvent): SafeAreaInsets | null {
	const { type, data } = event.detail;
	if (type !== "VKWebAppUpdateInsets" && type !== "VKWebAppUpdateConfig") {
		return null;
	}
	if (!("insets" in data) || data.insets == null) {
		return null;
	}
	const insets = data.insets as Partial<SafeAreaInsets>;
	return {
		...insets,
		bottom:
			insets.bottom !== undefined && insets.bottom > VIRTUAL_KEYBOARD_HEIGHT
				? 0
				: insets.bottom,
	};
}
